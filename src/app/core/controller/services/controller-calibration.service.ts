import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import {
  AxisCalibration,
  AxisRangeStats,
  CALIBRATION_STORAGE_KEY,
  CALIBRATION_VERSION,
  CENTER_CAPTURE_MS,
  CENTER_STABILITY_MAX_DEVIATION,
  CHANNEL_INSTRUCTIONS,
  CalibratedFlightInput,
  CalibrationStatus,
  CalibrationStep,
  ChannelRangeStats,
  ControllerCalibration,
  DEFAULT_CENTERED_DEADZONE,
  FLIGHT_CHANNELS,
  FlightChannel,
  MIN_RANGE_SPAN,
  MOVEMENT_THRESHOLD,
  STEP_TITLES,
  WORKFLOW_STEPS,
} from '../models/controller-calibration.model';
import { AxisState } from '../models/controller-state.model';
import { ControllerProfileService } from './controller-profile.service';
import {
  computeCalibratedFlightInput,
  createDefaultAxisCalibration,
  findStrongestMovedAxis,
  isControllerCalibration,
  maxAbsoluteDeviation,
  median,
} from '../utils/axis-normalization';
import { GamepadControllerService } from './gamepad-controller.service';

export interface CalibrationClock {
  now(): number;
}

const BROWSER_CLOCK: CalibrationClock = {
  now: () => Date.now(),
};

interface DraftAssignment {
  axisIndex: number;
  min: number;
  center: number;
  max: number;
  inverted: boolean;
}

type DraftAssignmentMap = Partial<Record<FlightChannel, DraftAssignment>>;

@Injectable({ providedIn: 'root' })
export class ControllerCalibrationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly gamepad = inject(GamepadControllerService);
  private readonly profiles = inject(ControllerProfileService);

  /** Injectable clock for deterministic unit tests. */
  private clock: CalibrationClock = BROWSER_CLOCK;

  private readonly persistedCalibration =
    signal<ControllerCalibration | null>(null);
  private readonly _activeStep = signal<CalibrationStep>('welcome');
  private readonly _workflowPhase = signal<'idle' | 'calibrating' | 'error'>(
    'idle',
  );
  private readonly _detectedAxis = signal<number | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _isCapturing = signal(false);
  private readonly _centerStability = signal(0);
  private readonly _centerReady = signal(false);
  private readonly _identificationReady = signal(false);
  private readonly _rangeStats = signal<ChannelRangeStats[]>([]);
  private readonly _rangeReady = signal(false);
  private readonly _draftInversions = signal<Record<FlightChannel, boolean>>({
    throttle: false,
    yaw: false,
    pitch: false,
    roll: false,
  });

  private sessionControllerId: string | null = null;
  private axisCenters: number[] = [];
  private readonly draftAssignments = signal<DraftAssignmentMap>({});
  private centerSamples: number[][] = [];
  private centerCaptureStartedAt: number | null = null;
  private identifyBaselines: number[] = [];
  private identifySamples: number[][] = [];
  private rangeBounds = new Map<number, { min: number; max: number }>();
  private workflowActive = false;

  readonly calibration = computed(() => {
    const saved = this.persistedCalibration();
    const controllerId = this.gamepad.controllerName();
    if (!saved || !controllerId || saved.controllerId !== controllerId) {
      return null;
    }
    return saved;
  });

  readonly hasCalibration = computed(() => this.calibration() !== null);

  readonly calibratedInput = computed<CalibratedFlightInput | null>(() => {
    const cal = this.calibration();
    if (!cal) {
      return null;
    }
    return computeCalibratedFlightInput(cal, this.gamepad.axes());
  });

  readonly calibrationStatus = computed<CalibrationStatus>(() => {
    const phase = this._workflowPhase();
    if (phase === 'calibrating') {
      return 'calibrating';
    }
    if (phase === 'error') {
      return 'error';
    }
    return this.hasCalibration() ? 'calibrated' : 'uncalibrated';
  });
  readonly activeStep = this._activeStep.asReadonly();
  readonly detectedAxis = this._detectedAxis.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isCapturing = this._isCapturing.asReadonly();
  readonly centerStability = this._centerStability.asReadonly();
  readonly centerReady = this._centerReady.asReadonly();
  readonly identificationReady = this._identificationReady.asReadonly();
  readonly rangeStats = this._rangeStats.asReadonly();
  readonly rangeReady = this._rangeReady.asReadonly();
  readonly draftInversions = this._draftInversions.asReadonly();

  readonly stepTitle = computed(
    () => STEP_TITLES[this._activeStep()] ?? 'Calibration',
  );

  readonly stepInstruction = computed(() => {
    const step = this._activeStep();
    switch (step) {
      case 'welcome':
        return 'Map your controller sticks to throttle, yaw, pitch, and roll. You will center the sticks, identify each channel, capture full ranges, then confirm directions.';
      case 'center':
        return 'Release both sticks and leave them centered. Throttle may rest at the bottom — that is expected. Hold still until the stability meter fills.';
      case 'identify-throttle':
        return CHANNEL_INSTRUCTIONS.throttle;
      case 'identify-yaw':
        return CHANNEL_INSTRUCTIONS.yaw;
      case 'identify-pitch':
        return CHANNEL_INSTRUCTIONS.pitch;
      case 'identify-roll':
        return CHANNEL_INSTRUCTIONS.roll;
      case 'range':
        return 'Move all sticks slowly through their full ranges several times. Watch the live min / current / max values until every channel shows an adequate span.';
      case 'direction':
        return 'Verify live channel directions. Increasing throttle should move toward 1. Yaw right, pitch forward, and roll right should be positive. Invert any channel that feels reversed.';
      case 'complete':
        return 'Calibration saved. Live calibrated values are shown below.';
      default:
        return '';
    }
  });

  readonly progress = computed(() => {
    const step = this._activeStep();
    const index = WORKFLOW_STEPS.indexOf(step);
    return {
      current: Math.max(1, index + 1),
      total: WORKFLOW_STEPS.length,
      fraction: (Math.max(0, index) + 1) / WORKFLOW_STEPS.length,
    };
  });

  readonly liveDraftInput = computed<CalibratedFlightInput | null>(() => {
    const step = this._activeStep();
    if (step !== 'direction' && step !== 'complete') {
      return this.calibratedInput();
    }

    const draft = this.buildDraftCalibration();
    if (!draft) {
      return this.calibratedInput();
    }

    return computeCalibratedFlightInput(draft, this.gamepad.axes());
  });

  readonly assignedAxes = computed(() => {
    const drafts = this.draftAssignments();
    const result: Partial<Record<FlightChannel, number>> = {};
    for (const channel of FLIGHT_CHANNELS) {
      const assignment = drafts[channel];
      if (assignment) {
        result[channel] = assignment.axisIndex;
      }
    }
    return result;
  });

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.restoreFromStorage();

    const liveEffect = effect(() => {
      const connected = this.gamepad.connected();
      const controllerId = this.gamepad.controllerName();
      const axes = this.gamepad.axes();

      untracked(() => {
        this.onLiveUpdate(connected, controllerId, axes);
      });
    });

    this.destroyRef.onDestroy(() => liveEffect.destroy());
  }

  /** Test-only: replace the clock used for capture timing. */
  setClockForTests(clock: CalibrationClock): void {
    this.clock = clock;
  }

  startCalibration(): void {
    this._error.set(null);

    if (!this.gamepad.connected()) {
      this._error.set('Connect a controller before starting calibration.');
      this._workflowPhase.set('error');
      return;
    }

    if (this.gamepad.axes().length < 4) {
      this._error.set(
        'This controller exposes fewer than four axes. Calibration requires at least four usable axes.',
      );
      this._workflowPhase.set('error');
      return;
    }

    this.workflowActive = true;
    this.sessionControllerId = this.gamepad.controllerName();
    this.resetDraftState();
    this._workflowPhase.set('calibrating');
    this._activeStep.set('center');
    this.beginCenterCapture();
  }

  cancelCalibration(): void {
    this.workflowActive = false;
    this._isCapturing.set(false);
    this.resetDraftState();
    this._error.set(null);
    this._detectedAxis.set(null);
    this._workflowPhase.set('idle');

    if (this.hasCalibration()) {
      this._activeStep.set('complete');
    } else {
      this._activeStep.set('welcome');
    }
  }

  continueFromCenter(): void {
    if (this._activeStep() !== 'center' || !this._centerReady()) {
      return;
    }

    this._isCapturing.set(false);
    this.beginIdentification('throttle');
  }

  acceptDetectedAxis(): void {
    const step = this._activeStep();
    const channel = this.channelFromIdentifyStep(step);
    const axisIndex = this._detectedAxis();

    if (!channel || axisIndex === null || !this._identificationReady()) {
      return;
    }

    if (this.isAxisAssigned(axisIndex, channel)) {
      this._error.set(
        `Axis ${axisIndex} is already assigned to another channel.`,
      );
      return;
    }

    const center = this.axisCenters[axisIndex] ?? 0;
    const extremes = this.computeIdentifyExtremes(axisIndex);

    this.draftAssignments.update((current) => ({
      ...current,
      [channel]: {
        axisIndex,
        min: extremes.min,
        center,
        max: extremes.max,
        inverted: false,
      },
    }));

    this._error.set(null);
    this._detectedAxis.set(null);
    this._identificationReady.set(false);

    const next = this.nextIdentifyChannel(channel);
    if (next) {
      this.beginIdentification(next);
    } else {
      this.beginRangeCapture();
    }
  }

  repeatStep(): void {
    const step = this._activeStep();

    if (step === 'center') {
      this.beginCenterCapture();
      return;
    }

    const channel = this.channelFromIdentifyStep(step);
    if (channel) {
      this.draftAssignments.update((current) => {
        const next = { ...current };
        delete next[channel];
        return next;
      });
      this.beginIdentification(channel);
      return;
    }

    if (step === 'range') {
      this.beginRangeCapture();
    }
  }

  finishRangeCapture(): void {
    if (this._activeStep() !== 'range' || !this._rangeReady()) {
      return;
    }

    this._isCapturing.set(false);
    this.applyRangeBoundsToDraft();

    const drafts = this.draftAssignments();
    const inversions: Record<FlightChannel, boolean> = {
      throttle: false,
      yaw: false,
      pitch: false,
      roll: false,
    };
    for (const channel of FLIGHT_CHANNELS) {
      inversions[channel] = drafts[channel]?.inverted ?? false;
    }
    this._draftInversions.set(inversions);
    this._activeStep.set('direction');
  }

  toggleInvert(channel: FlightChannel): void {
    this.draftAssignments.update((current) => {
      const assignment = current[channel];
      if (!assignment) {
        return current;
      }
      return {
        ...current,
        [channel]: { ...assignment, inverted: !assignment.inverted },
      };
    });

    this._draftInversions.update((current) => ({
      ...current,
      [channel]: !current[channel],
    }));

    const persisted = this.persistedCalibration();
    const controllerId = this.gamepad.controllerName();
    if (
      this._activeStep() === 'complete' &&
      persisted &&
      controllerId &&
      persisted.controllerId === controllerId
    ) {
      const updated: ControllerCalibration = {
        ...persisted,
        updatedAt: new Date(this.clock.now()).toISOString(),
        channels: {
          ...persisted.channels,
          [channel]: {
            ...persisted.channels[channel],
            inverted: !persisted.channels[channel].inverted,
          },
        },
      };
      this.persistedCalibration.set(updated);
      this.writeStorage(updated);
    }
  }

  saveCalibration(): void {
    const draft = this.buildDraftCalibration();
    if (!draft) {
      this._error.set('Cannot save calibration — channel mapping is incomplete.');
      this._workflowPhase.set('error');
      return;
    }

    this.persistedCalibration.set(draft);
    this.writeStorage(draft);
    this.profiles.createFromCalibration({
      displayName: draft.controllerId.slice(0, 40) || 'Controller profile',
      gamepadId: draft.controllerId,
      axisMappings: {
        throttle: draft.channels.throttle.axisIndex,
        yaw: draft.channels.yaw.axisIndex,
        pitch: draft.channels.pitch.axisIndex,
        roll: draft.channels.roll.axisIndex,
      },
      inversion: {
        throttle: draft.channels.throttle.inverted,
        yaw: draft.channels.yaw.inverted,
        pitch: draft.channels.pitch.inverted,
        roll: draft.channels.roll.inverted,
      },
      deadZones: {
        throttle: draft.channels.throttle.deadzone,
        yaw: draft.channels.yaw.deadzone,
        pitch: draft.channels.pitch.deadzone,
        roll: draft.channels.roll.deadzone,
      },
    });
    this.workflowActive = false;
    this._isCapturing.set(false);
    this._activeStep.set('complete');
    this._workflowPhase.set('idle');
    this._error.set(null);
  }

  resetCalibration(): void {
    this.persistedCalibration.set(null);
    this.clearStorage();
    this.workflowActive = false;
    this.resetDraftState();
    this._activeStep.set('welcome');
    this._workflowPhase.set('idle');
    this._error.set(null);
    this._detectedAxis.set(null);
  }

  openWelcomeOrComplete(): void {
    if (this.hasCalibration()) {
      this._activeStep.set('complete');
      this._workflowPhase.set('idle');
    } else if (this._workflowPhase() !== 'error') {
      this._activeStep.set('welcome');
      this._workflowPhase.set('idle');
    } else {
      this._activeStep.set('welcome');
    }
  }

  private onLiveUpdate(
    connected: boolean,
    controllerId: string | null,
    axes: AxisState[],
  ): void {
    if (!this.workflowActive) {
      return;
    }

    if (!connected) {
      this.abortWorkflow('Controller disconnected during calibration.');
      return;
    }

    if (
      this.sessionControllerId &&
      controllerId &&
      controllerId !== this.sessionControllerId
    ) {
      this.abortWorkflow('Controller changed during calibration.');
      return;
    }

    const step = this._activeStep();

    if (step === 'center' && this._isCapturing()) {
      this.sampleCenter(axes);
    } else if (step.startsWith('identify-') && this._isCapturing()) {
      this.sampleIdentification(axes);
    } else if (step === 'range' && this._isCapturing()) {
      this.sampleRange(axes);
    }
  }

  private abortWorkflow(message: string): void {
    this.workflowActive = false;
    this._isCapturing.set(false);
    this.resetDraftState();
    this._error.set(message);
    this._workflowPhase.set('error');
    this._activeStep.set('welcome');
    this._detectedAxis.set(null);
  }

  private beginCenterCapture(): void {
    this.centerSamples = [];
    this.centerCaptureStartedAt = this.clock.now();
    this.axisCenters = [];
    this._centerStability.set(0);
    this._centerReady.set(false);
    this._isCapturing.set(true);
    this._activeStep.set('center');
    this._error.set(null);
  }

  private sampleCenter(axes: AxisState[]): void {
    if (axes.length === 0) {
      return;
    }

    this.centerSamples.push(axes.map((axis) => axis.rawValue));

    const startedAt = this.centerCaptureStartedAt ?? this.clock.now();
    const elapsed = this.clock.now() - startedAt;
    const timeProgress = clamp01(elapsed / CENTER_CAPTURE_MS);

    const axisCount = axes.length;
    let worstDeviation = 0;

    for (let i = 0; i < axisCount; i++) {
      const values = this.centerSamples.map((sample) => sample[i] ?? 0);
      const center = median(values);
      worstDeviation = Math.max(
        worstDeviation,
        maxAbsoluteDeviation(values, center),
      );
    }

    const stability = clamp01(
      1 - worstDeviation / Math.max(CENTER_STABILITY_MAX_DEVIATION * 3, 1e-6),
    );
    this._centerStability.set(stability);

    const stable = worstDeviation <= CENTER_STABILITY_MAX_DEVIATION;
    const ready = elapsed >= CENTER_CAPTURE_MS && stable;
    this._centerReady.set(ready);

    if (ready || (elapsed >= CENTER_CAPTURE_MS && this.centerSamples.length > 0)) {
      this.axisCenters = [];
      for (let i = 0; i < axisCount; i++) {
        const values = this.centerSamples.map((sample) => sample[i] ?? 0);
        this.axisCenters[i] = median(values);
      }
    }

    // Keep capturing while on the center step so the meter stays live.
    void timeProgress;
  }

  private beginIdentification(channel: FlightChannel): void {
    this._activeStep.set(
      `identify-${channel}` as CalibrationStep,
    );
    this._detectedAxis.set(null);
    this._identificationReady.set(false);
    this._error.set(null);
    this.identifySamples = [];
    this.identifyBaselines = this.gamepad.axes().map((axis) => axis.rawValue);

    if (this.identifyBaselines.length === 0) {
      this.identifyBaselines = [...this.axisCenters];
    }

    this._isCapturing.set(true);
  }

  private sampleIdentification(axes: AxisState[]): void {
    if (axes.length === 0) {
      return;
    }

    this.identifySamples.push(axes.map((axis) => axis.rawValue));

    const excluded = this.assignedAxisSet();
    const result = findStrongestMovedAxis(
      this.identifyBaselines,
      this.identifySamples,
      excluded,
      MOVEMENT_THRESHOLD,
    );

    if (!result) {
      this._detectedAxis.set(null);
      this._identificationReady.set(false);
      return;
    }

    this._detectedAxis.set(result.axisIndex);
    this._identificationReady.set(true);
  }

  private beginRangeCapture(): void {
    this.rangeBounds.clear();
    const drafts = this.draftAssignments();
    for (const channel of FLIGHT_CHANNELS) {
      const assignment = drafts[channel];
      if (!assignment) {
        continue;
      }
      const current =
        this.gamepad.axes().find((axis) => axis.index === assignment.axisIndex)
          ?.rawValue ?? assignment.center;
      this.rangeBounds.set(assignment.axisIndex, {
        min: Math.min(assignment.min, current),
        max: Math.max(assignment.max, current),
      });
    }

    this._activeStep.set('range');
    this._isCapturing.set(true);
    this._error.set(null);
    this.updateRangeStats();
  }

  private sampleRange(axes: AxisState[]): void {
    const drafts = this.draftAssignments();
    for (const channel of FLIGHT_CHANNELS) {
      const assignment = drafts[channel];
      if (!assignment) {
        continue;
      }

      const raw = axes.find((axis) => axis.index === assignment.axisIndex)
        ?.rawValue;
      if (raw === undefined) {
        continue;
      }

      const bounds = this.rangeBounds.get(assignment.axisIndex) ?? {
        min: raw,
        max: raw,
      };
      bounds.min = Math.min(bounds.min, raw);
      bounds.max = Math.max(bounds.max, raw);
      this.rangeBounds.set(assignment.axisIndex, bounds);
    }

    this.updateRangeStats();
  }

  private updateRangeStats(): void {
    const axes = this.gamepad.axes();
    const drafts = this.draftAssignments();
    const stats: ChannelRangeStats[] = [];
    let allAdequate = true;

    for (const channel of FLIGHT_CHANNELS) {
      const assignment = drafts[channel];
      if (!assignment) {
        allAdequate = false;
        continue;
      }

      const bounds = this.rangeBounds.get(assignment.axisIndex) ?? {
        min: assignment.min,
        max: assignment.max,
      };
      const current =
        axes.find((axis) => axis.index === assignment.axisIndex)?.rawValue ??
        assignment.center;
      const span = bounds.max - bounds.min;
      const adequate = span >= MIN_RANGE_SPAN;

      if (!adequate) {
        allAdequate = false;
      }

      const axisStats: AxisRangeStats = {
        axisIndex: assignment.axisIndex,
        min: bounds.min,
        current,
        max: bounds.max,
        span,
        adequate,
      };

      stats.push({ channel, stats: axisStats });
    }

    this._rangeStats.set(stats);
    this._rangeReady.set(allAdequate && stats.length === 4);
  }

  private applyRangeBoundsToDraft(): void {
    this.draftAssignments.update((drafts) => {
      const next: DraftAssignmentMap = { ...drafts };

      for (const channel of FLIGHT_CHANNELS) {
        const assignment = next[channel];
        if (!assignment) {
          continue;
        }

        const bounds = this.rangeBounds.get(assignment.axisIndex);
        if (!bounds) {
          continue;
        }

        next[channel] = {
          ...assignment,
          min: bounds.min,
          max: bounds.max,
          center:
            channel === 'throttle'
              ? bounds.min
              : (this.axisCenters[assignment.axisIndex] ??
                (bounds.min + bounds.max) / 2),
        };
      }

      return next;
    });
  }

  private computeIdentifyExtremes(axisIndex: number): {
    min: number;
    max: number;
  } {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const sample of this.identifySamples) {
      const value = sample[axisIndex];
      if (value === undefined) {
        continue;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const center = this.axisCenters[axisIndex] ?? 0;
      return { min: center, max: center };
    }

    return { min, max };
  }

  private buildDraftCalibration(): ControllerCalibration | null {
    const controllerId =
      this.sessionControllerId ?? this.gamepad.controllerName();
    if (!controllerId) {
      return null;
    }

    const drafts = this.draftAssignments();

    for (const channel of FLIGHT_CHANNELS) {
      if (!drafts[channel]) {
        // Fall back to persisted channels when editing inversions on complete.
        const persisted = this.persistedCalibration();
        if (
          this._activeStep() === 'complete' &&
          persisted &&
          persisted.controllerId === controllerId
        ) {
          return persisted;
        }
        return null;
      }
    }

    const inversions = this._draftInversions();
    const now = new Date(this.clock.now()).toISOString();
    const existing = this.persistedCalibration();

    const channels = {} as Record<FlightChannel, AxisCalibration>;
    for (const channel of FLIGHT_CHANNELS) {
      const assignment = drafts[channel]!;
      channels[channel] = createDefaultAxisCalibration(assignment.axisIndex, {
        min: assignment.min,
        center: assignment.center,
        max: assignment.max,
        inverted: inversions[channel],
        deadzone:
          channel === 'throttle' ? 0 : DEFAULT_CENTERED_DEADZONE,
      });
    }

    return {
      version: CALIBRATION_VERSION,
      controllerId,
      controllerMapping: this.gamepad.mapping() ?? 'none',
      createdAt: existing?.controllerId === controllerId ? existing.createdAt : now,
      updatedAt: now,
      channels,
    };
  }

  private channelFromIdentifyStep(
    step: CalibrationStep,
  ): FlightChannel | null {
    switch (step) {
      case 'identify-throttle':
        return 'throttle';
      case 'identify-yaw':
        return 'yaw';
      case 'identify-pitch':
        return 'pitch';
      case 'identify-roll':
        return 'roll';
      default:
        return null;
    }
  }

  private nextIdentifyChannel(
    channel: FlightChannel,
  ): FlightChannel | null {
    const order: FlightChannel[] = ['throttle', 'yaw', 'pitch', 'roll'];
    const index = order.indexOf(channel);
    return order[index + 1] ?? null;
  }

  private assignedAxisSet(except?: FlightChannel): Set<number> {
    const set = new Set<number>();
    const drafts = this.draftAssignments();
    for (const channel of FLIGHT_CHANNELS) {
      if (channel === except) {
        continue;
      }
      const assignment = drafts[channel];
      if (assignment) {
        set.add(assignment.axisIndex);
      }
    }
    return set;
  }

  private isAxisAssigned(
    axisIndex: number,
    except?: FlightChannel,
  ): boolean {
    return this.assignedAxisSet(except).has(axisIndex);
  }

  private resetDraftState(): void {
    this.axisCenters = [];
    this.draftAssignments.set({});
    this.centerSamples = [];
    this.centerCaptureStartedAt = null;
    this.identifyBaselines = [];
    this.identifySamples = [];
    this.rangeBounds.clear();
    this._centerStability.set(0);
    this._centerReady.set(false);
    this._identificationReady.set(false);
    this._rangeStats.set([]);
    this._rangeReady.set(false);
    this._draftInversions.set({
      throttle: false,
      yaw: false,
      pitch: false,
      roll: false,
    });
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (!raw) {
        this.persistedCalibration.set(null);
        return;
      }

      const parsed: unknown = JSON.parse(raw);
      if (!isControllerCalibration(parsed)) {
        this.clearStorage();
        this.persistedCalibration.set(null);
        return;
      }

      if (parsed.version !== CALIBRATION_VERSION) {
        this.clearStorage();
        this.persistedCalibration.set(null);
        return;
      }

      this.persistedCalibration.set(parsed);
    } catch {
      this.clearStorage();
      this.persistedCalibration.set(null);
    }
  }

  private writeStorage(calibration: ControllerCalibration): void {
    try {
      localStorage.setItem(
        CALIBRATION_STORAGE_KEY,
        JSON.stringify(calibration),
      );
    } catch {
      this._error.set('Unable to persist calibration to localStorage.');
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(CALIBRATION_STORAGE_KEY);
    } catch {
      // Ignore storage failures on clear.
    }
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
