import { DecimalPipe, UpperCasePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import {
  TRAINING_GATE_BASICS_COURSE,
} from '../../core/academy/config/training-gate-basics.course';
import { getTrainingModuleById } from '../../core/academy/config/training-modules.config';
import type {
  TrainingModuleDefinition,
  TrainingResult,
} from '../../core/academy/models/training-module.models';
import type {
  TrainingEvaluation,
  TrainingSessionSnapshot,
} from '../../core/academy/models/training-session.models';
import { TrainingAcademyService } from '../../core/academy/services/training-academy.service';
import { AircraftRuntimeService } from '../../core/aircraft/services/aircraft-runtime.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { stampReplayAircraftMetadata } from '../../core/aircraft/adapters/replay-aircraft.adapter';
import { AudioManagerService } from '../../core/audio/services/audio-manager.service';
import { DroneAudioService } from '../../core/audio/services/drone-audio.service';
import { EnvironmentAudioService } from '../../core/audio/services/environment-audio.service';
import { GameplayAudioService } from '../../core/audio/services/gameplay-audio.service';
import { CourseRunService } from '../../core/course/services/course-run.service';
import { CourseCatalogService } from '../../core/course/services/course-catalog.service';
import type { Course } from '../../core/course/models/course.model';
import { formatRunTime } from '../../core/course/models/run-state.model';
import {
  ENVIRONMENT_LOAD_LABELS,
  type EnvironmentLoadStage,
  type EnvironmentQuality,
  type TimeOfDay,
} from '../../core/environment/models/environment.model';
import { EnvironmentRegistryService } from '../../core/environment/services/environment-registry.service';
import { FlightCameraEffectsService } from '../../core/flight-feedback/services/flight-camera-effects.service';
import {
  RATE_PROFILES,
  type RateProfileId,
} from '../../core/flight/config/rate-profiles';
import { FlightControllerService } from '../../core/flight/services/flight-controller.service';
import type { FlightFrameDiagnostics } from '../../core/flight/services/flight-controller.service';
import type { CameraMode, Vec3 } from '../../core/flight/models/flight-state.model';
import { headingYawRad } from '../../core/flight/utils/quat-math';
import { environment } from '../../../environments/environment';
import { GhostRaceService } from '../../core/ghost/services/ghost-race.service';
import { GhostStorageService } from '../../core/ghost/services/ghost-storage.service';
import { formatGhostDeltaSeconds } from '../../core/ghost/utils/ghost-comparison';
import { AchievementService } from '../../core/progression/services/achievement.service';
import { ProgressionService } from '../../core/progression/services/progression.service';
import { ThreeRendererService } from '../../core/rendering/services/three-renderer.service';
import type { TrainingOverlaySpec } from '../../core/rendering/services/three-renderer.service';
import type { FlightReplay } from '../../core/replay/models/replay.model';
import { ReplayPlaybackService } from '../../core/replay/services/replay-playback.service';
import { ReplayRecorderService } from '../../core/replay/services/replay-recorder.service';
import { ControllerCalibrationService } from '../../core/controller/services/controller-calibration.service';
import { GamepadControllerService } from '../../core/controller/services/gamepad-controller.service';
import {
  type CameraEffectsIntensity,
  type GhostComparisonModeSetting,
  type ReplayCameraMode,
  type ReplayPlaybackSpeed,
} from '../../core/settings/models/trainer-settings.model';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { TrainerSessionService } from '../../core/session/services/trainer-session.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import type { FlightLaunchIntent } from '../../core/shell/app-shell.service';
import { AuthoritativeFlightStepPublisher } from '../../core/flight-runtime/services/authoritative-flight-step-publisher.service';
import { FlightSimulationClock } from '../../core/flight-runtime/services/flight-simulation-clock.service';
import type { AuthoritativeCollisionOutcomeSummary } from '../../core/flight-runtime/models/authoritative-flight-step-snapshot';
import { MissionAircraftSnapshotAdapter } from '../../core/mission/adapters/mission-aircraft-snapshot.adapter';
import { MissionAircraftCapabilitiesAdapter } from '../../core/mission/adapters/mission-aircraft-capabilities.adapter';
import { FlightCameraSnapshotAdapter } from '../../core/camera/services/flight-camera-snapshot-adapter.service';
import { MissionRuntimeCoordinator } from '../../core/mission/services/mission-runtime-coordinator.service';
import { MissionSessionFacade } from '../../core/mission/services/mission-session.facade';
import { AccountPromptService } from '../../core/online/services/account-prompt.service';
import { RankedRaceService } from '../../core/online/services/ranked-race.service';
import { PhysicsSessionService } from '../../core/physics/services/physics-session.service';
import { ImpactParticleService } from '../../core/physics/services/impact-particle.service';
import type { CrashReason } from '../../core/physics/models/collision.models';
import type { RaceSession } from '../../core/online/models/race-submission.model';
import { splitsFromReplay } from '../../core/online/utils/replay-splits';
import { PhysicsIntegrityService } from '../../core/physics/guards/physics-integrity.service';
import { AdaptivePerformanceService } from '../../core/performance/adaptive-performance.service';
import { FrameTimeMonitorService } from '../../core/performance/frame-time-monitor.service';
import { GuidanceEngineService } from '../../core/training-guidance/services/guidance-engine.service';
import { ContinueExperienceService } from '../../core/continue/continue-experience.service';
import { ProductAnalyticsService } from '../../core/analytics/product-analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics-events';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import {
  getWeatherPreset,
  listWeatherPresetsForEnvironment,
} from '../../core/weather/config/weather-presets.config';
import { WeatherService } from '../../core/weather/services/weather.service';
import { EnvironmentSettingsComponent } from '../settings/environment-settings.component';
import {
  FlightKeyboardAdapter,
  mergeFlightInputs,
} from './flight-keyboard.adapter';
import {
  isEditableTarget,
  shouldHandleEscapeAsSettings,
  shouldToggleFullscreenShortcut,
} from './flight-shortcuts';

export type PlayMode = 'free' | 'course' | 'training';

interface MinimapNode {
  id: string;
  index: number;
  x: number;
  y: number;
}

interface MinimapContour {
  d: string;
  opacity: number;
}

interface MinimapLayout {
  width: number;
  height: number;
  nodes: MinimapNode[];
  path: string;
  pathLength: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startX: number;
  startY: number;
  contours: MinimapContour[];
}

export type FlightHudMode = 'full' | 'compact' | 'minimal';

@Component({
  selector: 'app-flight',
  imports: [DecimalPipe, UpperCasePipe, EnvironmentSettingsComponent],
  templateUrl: './flight.component.html',
  styleUrl: './flight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlightComponent implements AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasHost =
    viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly stageHost =
    viewChild.required<ElementRef<HTMLElement>>('stageHost');

  /** Full keeps all panels; compact trims secondary chrome; minimal keeps timer/gate/speed/altitude/warnings. */
  protected readonly hudMode = signal<FlightHudMode>(readHudMode());

  protected readonly controller = inject(GamepadControllerService);
  protected readonly calibration = inject(ControllerCalibrationService);
  protected readonly flight = inject(FlightControllerService);
  protected readonly courseRun = inject(CourseRunService);
  private readonly renderer = inject(ThreeRendererService);
  protected readonly shell = inject(AppShellService);
  protected readonly trainerSettings = inject(TrainerSettingsService);
  protected readonly session = inject(TrainerSessionService);
  protected readonly audioManager = inject(AudioManagerService);
  private readonly droneAudio = inject(DroneAudioService);
  private readonly aircraftRuntime = inject(AircraftRuntimeService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly environmentAudio = inject(EnvironmentAudioService);
  private readonly gameplayAudio = inject(GameplayAudioService);
  private readonly cameraEffects = inject(FlightCameraEffectsService);
  protected readonly replayRecorder = inject(ReplayRecorderService);
  protected readonly replayPlayback = inject(ReplayPlaybackService);
  protected readonly ghostRace = inject(GhostRaceService);
  private readonly ghostStorage = inject(GhostStorageService);
  protected readonly academy = inject(TrainingAcademyService);
  private readonly progression = inject(ProgressionService);
  private readonly achievements = inject(AchievementService);
  private readonly courseCatalog = inject(CourseCatalogService);
  private readonly weather = inject(WeatherService);
  private readonly environmentRegistry = inject(EnvironmentRegistryService);
  private readonly rankedRace = inject(RankedRaceService);
  private readonly accountPrompt = inject(AccountPromptService);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly authSession = inject(AuthSessionService);
  private readonly physicsSession = inject(PhysicsSessionService);
  private readonly impactParticles = inject(ImpactParticleService);
  private readonly physicsIntegrity = inject(PhysicsIntegrityService);
  private readonly adaptivePerformance = inject(AdaptivePerformanceService);
  private readonly frameMonitor = inject(FrameTimeMonitorService);
  private readonly guidance = inject(GuidanceEngineService);
  private readonly continueXp = inject(ContinueExperienceService);
  private readonly flightSimClock = inject(FlightSimulationClock);
  private readonly authoritativeStepPublisher = inject(AuthoritativeFlightStepPublisher);
  private readonly missionAircraftSnapshotAdapter = inject(MissionAircraftSnapshotAdapter);
  private readonly missionAircraftCapabilitiesAdapter = inject(
    MissionAircraftCapabilitiesAdapter,
  );
  private readonly flightCameraSnapshotAdapter = inject(FlightCameraSnapshotAdapter);
  private readonly missionRuntimeCoordinator = inject(MissionRuntimeCoordinator);
  private readonly missionSessionFacade = inject(MissionSessionFacade);

  /** Cached metadata for authoritative step snapshots (updated on aircraft apply). */
  private activeAircraftSourceType: 'factory' | 'user-compiled' = 'factory';
  private activeDefinitionVersion: string | null = null;
  private activePhysicsProfileVersion: string | null = null;

  private readonly keyboard = new FlightKeyboardAdapter();
  private mounted = false;
  private wasConnected = false;
  private hadCalibration = false;
  private frameInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
  private lastCountdownBeep = -1;
  private lastCompletedGates = 0;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  private gateFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private bestFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameMs: number | null = null;
  private wasCrashed = false;
  private prevVelocity = { x: 0, y: 0, z: 0 };
  private wasArmed = false;
  private recordingActive = false;
  private bestBeforeFinish: number | null = null;
  private prefersReducedMotion = false;
  private reducedMotionQuery: MediaQueryList | null = null;
  private scrubbingReplay = false;
  private lastWindHudMs = 0;
  private lastAmbienceAudioMs = 0;
  private readonly windHudSample = signal<{
    speed: number;
    gustActive: boolean;
    presetName: string;
    dirX: number;
    dirZ: number;
  } | null>(null);

  // --- Ghost / training / progression integration state ---
  private pendingLaunchIntent: FlightLaunchIntent | null = null;
  private activeRankedSession: RaceSession | null = null;
  private rankedSubmissionId: string | null = null;
  private ghostLoadedForCourseId: string | null = null;
  private ghostReadyPlayedThisRun = false;
  private runHadMiss = false;
  private hasFiredTakeoff = false;
  private trainingResultHandled = false;

  protected readonly liveInput = signal({
    throttle: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
  });
  protected readonly cameraMode = signal<CameraMode>('fpv');
  protected readonly playMode = signal<PlayMode>('course');
  protected readonly audioMuted = signal(false);
  protected readonly paused = signal(false);
  protected readonly settingsOpen = signal(false);
  protected readonly rateMenuOpen = signal(false);
  protected readonly celebratingGate = signal<number | null>(null);
  protected readonly gateFlashLabel = signal<string | null>(null);
  protected readonly newBestLabel = signal<string | null>(null);
  protected readonly smoothSpeed = signal(0);
  protected readonly smoothAltitude = signal(0);
  protected readonly groundProximityWarn = signal(false);
  protected readonly forceCameraEffects = signal(false);
  protected readonly hudReady = signal(false);
  protected readonly environmentReady = signal(false);
  protected readonly environmentLoading = signal(true);
  protected readonly environmentStage = signal<EnvironmentLoadStage>('terrain');
  protected readonly environmentError = signal<string | null>(null);
  protected readonly environmentRetryCount = signal(0);
  protected readonly replayUiOpen = signal(false);
  protected readonly physicsWarning = signal<string | null>(null);
  protected readonly guidanceMessage = this.guidance.message;
  protected readonly crashReasonLabel = signal<string | null>(null);
  protected readonly showCollisionDebug = signal(false);
  /**
   * Body-frame HUD — off by default; toggle with B when diagnosticsVisible.
   * Production builds set diagnosticsVisible=false so this never appears.
   */
  protected readonly showFrameDebug = signal(false);
  protected readonly frameDebug = signal<{
    physics: FlightFrameDiagnostics;
    modelForward: Vec3;
    cameraForward: Vec3;
    modelQuat: { x: number; y: number; z: number; w: number };
    rapierActive: boolean;
  } | null>(null);
  protected readonly diagnosticsVisible = environment.diagnosticsVisible;

  // --- Ghost / training / progression signals ---
  protected readonly ghostSavedThisRun = signal(false);
  protected readonly ghostBeatenThisRun = signal(false);
  protected readonly lastXpEarned = signal(0);
  protected readonly lastGhostSaveWarning = signal<string | null>(null);
  protected readonly trainingCountdownSeconds = signal(0);
  protected readonly trainingGoFlashSeconds = signal(0);
  protected readonly trainingElapsedMs = signal(0);
  protected readonly trainingHoldProgress = signal(0);

  protected readonly environmentStageLabel = computed(
    () => ENVIRONMENT_LOAD_LABELS[this.environmentStage()],
  );

  protected readonly environmentSettings = computed(
    () => this.trainerSettings.settings().environment,
  );

  protected readonly weatherSettings = computed(
    () => this.trainerSettings.settings().weather,
  );

  protected readonly availableEnvironments = computed(() =>
    this.environmentRegistry.listEnabled(),
  );

  protected readonly availableWeatherPresets = computed(() =>
    listWeatherPresetsForEnvironment(
      this.environmentSettings().selectedEnvironmentId,
    ),
  );

  protected readonly weatherState = this.weather.state;

  protected readonly showWindHud = computed(() => {
    const ws = this.weatherSettings();
    const weather = this.weatherState();
    if (!ws.windHudEnabled && weather.recordCategory !== 'challenge') {
      return false;
    }
    return weather.wind.enabled && weather.wind.baseSpeed > 0.05;
  });

  protected readonly windHud = this.windHudSample;

  protected readonly windHudArrowDeg = computed(() => {
    const hud = this.windHud();
    if (!hud) {
      return 0;
    }
    return (Math.atan2(hud.dirX, hud.dirZ) * 180) / Math.PI;
  });

  protected readonly showMinimapWind = computed(() => {
    const ws = this.weatherSettings();
    const weather = this.weatherState();
    return (
      ws.windOnMinimapEnabled &&
      weather.wind.enabled &&
      weather.wind.baseSpeed > 0.05
    );
  });

  protected readonly polishSettings = computed(() => this.trainerSettings.settings());

  protected readonly autoFullscreenOnFlight = computed(
    () => this.trainerSettings.settings().autoFullscreenOnFlight,
  );

  protected readonly canFly = computed(
    () => this.environmentReady() && !this.environmentLoading(),
  );

  protected readonly isReplayMode = computed(() => this.replayPlayback.isActive());

  protected readonly replaySpeeds: ReplayPlaybackSpeed[] = [0.25, 0.5, 1, 2];
  protected readonly replayCameras: ReplayCameraMode[] = ['fpv', 'chase', 'orbit'];
  protected readonly cameraIntensities: CameraEffectsIntensity[] = [
    'off',
    'low',
    'medium',
    'high',
  ];

  protected readonly isNewBest = computed(() => {
    const state = this.courseRun.runState();
    if (state.status !== 'finished' || state.bestTimeSeconds === null) {
      return false;
    }
    return Math.abs(state.elapsedSeconds - state.bestTimeSeconds) < 0.0005;
  });

  protected readonly newBestDeltaLabel = computed(() => {
    if (!this.isNewBest() || this.bestBeforeFinish === null) {
      return null;
    }
    const improvement = this.bestBeforeFinish - this.courseRun.runState().elapsedSeconds;
    if (!(improvement > 0.005)) {
      return null;
    }
    return `−${improvement.toFixed(2)} s`;
  });

  protected readonly formattedReplayTime = computed(() => {
    const ms = this.replayPlayback.currentTimeMs();
    return formatClockMs(ms);
  });

  protected readonly formattedReplayDuration = computed(() => {
    return formatClockMs(this.replayPlayback.durationMs());
  });

  protected readonly speedBarRatio = computed(() =>
    Math.min(1, Math.max(0, this.smoothSpeed() / 22)),
  );

  protected readonly rateProfileIds: RateProfileId[] = [
    'beginner',
    'normal',
    'acro',
  ];
  protected readonly rateProfiles = RATE_PROFILES;

  protected readonly connectionStatus = computed(() => {
    if (!this.controller.apiAvailable()) {
      return 'unavailable' as const;
    }
    return this.controller.connected()
      ? ('connected' as const)
      : ('waiting' as const);
  });

  protected readonly connectionLabel = computed(() => {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'Connected';
      case 'unavailable':
        return 'API unavailable';
      default:
        return 'Disconnected';
    }
  });

  protected readonly calibrationLabel = computed(() =>
    this.calibration.hasCalibration() ? 'Calibrated' : 'Not calibrated',
  );

  protected readonly canArm = computed(() => {
    if (!this.canFly()) {
      return false;
    }
    if (this.flight.crashed()) {
      return false;
    }
    const connected = this.controller.connected();
    const calibrated = this.calibration.hasCalibration();
    if (connected) {
      return calibrated;
    }
    return this.keyboard.available;
  });

  protected readonly armBlockHint = computed(() => {
    if (!this.canFly()) {
      return 'Wait for Alpine Training Valley to finish loading.';
    }
    if (this.flight.crashed()) {
      return 'Reset after a crash before arming.';
    }
    if (
      this.controller.connected() &&
      !this.calibration.hasCalibration()
    ) {
      return 'Calibrate the controller before arming, or disconnect and use keyboard.';
    }
    if (!this.controller.connected()) {
      return 'Controller disconnected — keyboard fallback is available.';
    }
    return this.flight.armWarning();
  });

  protected readonly trainingModule = computed(() =>
    this.academy.activeModule(),
  );

  protected readonly isGateCourseTraining = computed(
    () =>
      this.playMode() === 'training' &&
      this.trainingModule()?.evaluatorType === 'gateCourse',
  );

  protected readonly showCourseMap = computed(
    () => this.playMode() === 'course' || this.isGateCourseTraining(),
  );

  protected readonly recommendedProfilePrompt = computed(() => {
    if (this.playMode() !== 'training') {
      return null;
    }
    const module = this.trainingModule();
    if (!module) {
      return null;
    }
    if (this.flight.rateProfileId() === module.recommendedRateProfile) {
      return null;
    }
    const profile = this.rateProfiles[module.recommendedRateProfile as RateProfileId];
    return `Recommended profile: ${profile?.name ?? module.recommendedRateProfile}`;
  });

  protected readonly showGhostHud = computed(() => {
    if (this.isReplayMode()) {
      return false;
    }
    if (this.playMode() !== 'course') {
      return false;
    }
    return this.trainerSettings.settings().ghost.ghostEnabled;
  });

  protected readonly runStatusLabel = computed(() => {
    if (this.playMode() === 'free') {
      return 'Free Flight';
    }
    if (this.playMode() === 'training') {
      switch (this.academy.state()) {
        case 'briefing':
          return 'Briefing';
        case 'preparing':
          return 'Preparing';
        case 'countdown':
          return 'Countdown';
        case 'active':
          return 'Training';
        case 'paused':
          return 'Paused';
        case 'success':
          return 'Success';
        case 'failed':
          return 'Failed';
        case 'results':
          return 'Results';
        default:
          return 'Academy';
      }
    }
    switch (this.courseRun.runState().status) {
      case 'countdown':
        return 'Countdown';
      case 'running':
        return 'Running';
      case 'finished':
        return 'Finished';
      case 'invalid':
        return 'Invalid';
      default:
        return 'Idle';
    }
  });

  protected readonly gateProgressLabel = computed(() => {
    const total = this.courseRun.course().gates.length;
    const state = this.courseRun.runState();
    const current = Math.min(state.completedGateCount + 1, total);
    if (state.status === 'finished') {
      return `${total} / ${total}`;
    }
    if (state.status === 'idle' || state.status === 'invalid') {
      return `0 / ${total}`;
    }
    return `${current} / ${total}`;
  });

  protected readonly centerTimerLabel = computed(() => {
    if (this.playMode() === 'course' || this.isGateCourseTraining()) {
      return this.courseRun.formattedElapsedTime();
    }
    if (this.playMode() === 'training') {
      return formatRunTime(this.trainingElapsedMs() / 1000);
    }
    return this.formatFlightTime(this.flight.flightTime());
  });

  protected readonly countdownDisplay = computed(() => {
    if (this.playMode() === 'training' && !this.isGateCourseTraining()) {
      if (this.academy.state() === 'countdown' && this.trainingCountdownSeconds() > 0) {
        return String(Math.max(1, Math.ceil(this.trainingCountdownSeconds())));
      }
      if (this.trainingGoFlashSeconds() > 0) {
        return 'GO';
      }
      return null;
    }
    const state = this.courseRun.runState();
    if (state.status === 'countdown') {
      return String(Math.max(1, Math.ceil(state.countdownSeconds)));
    }
    if (state.goFlashSeconds > 0) {
      return 'GO';
    }
    return null;
  });

  protected readonly timeDeltaLabel = computed(() => {
    const state = this.courseRun.runState();
    if (state.status !== 'finished' || state.bestTimeSeconds === null) {
      return null;
    }
    const delta = state.elapsedSeconds - state.bestTimeSeconds;
    if (Math.abs(delta) < 0.0005) {
      return 'New best';
    }
    const sign = delta > 0 ? '+' : '-';
    return `${sign}${Math.abs(delta).toFixed(2)}s`;
  });

  protected readonly runBusy = computed(() => {
    const status = this.courseRun.runState().status;
    return status === 'countdown' || status === 'running';
  });

  protected readonly canChangeProfile = computed(() => !this.runBusy());

  /** Static course projection — rebuilt only when the course changes. */
  protected readonly minimap = computed((): MinimapLayout => {
    const course = this.courseRun.course();
    const gates = course.gates;
    const width = 200;
    const height = 260;
    const pad = 18;

    if (gates.length === 0) {
      return {
        width,
        height,
        nodes: [],
        path: '',
        pathLength: 0,
        minX: 0,
        maxX: 1,
        minZ: 0,
        maxZ: 1,
        startX: width * 0.5,
        startY: height * 0.5,
        contours: [],
      };
    }

    const xs = [
      ...gates.map((g) => g.position.x),
      course.startPosition.x,
    ];
    const zs = [
      ...gates.map((g) => g.position.z),
      course.startPosition.z,
    ];
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minZ = Math.min(...zs) - pad;
    const maxZ = Math.max(...zs) + pad;
    const spanX = Math.max(maxX - minX, 1);
    const spanZ = Math.max(maxZ - minZ, 1);

    // Preserve aspect ratio inside the SVG viewport.
    const worldAspect = spanX / spanZ;
    const viewAspect = width / height;
    let usedW = width;
    let usedH = height;
    let ox = 0;
    let oy = 0;
    if (worldAspect > viewAspect) {
      usedH = width / worldAspect;
      oy = (height - usedH) * 0.5;
    } else {
      usedW = height * worldAspect;
      ox = (width - usedW) * 0.5;
    }

    const project = (x: number, z: number) => ({
      x: ox + ((x - minX) / spanX) * usedW,
      y: oy + ((z - minZ) / spanZ) * usedH,
    });

    const nodes: MinimapNode[] = gates.map((g) => {
      const p = project(g.position.x, g.position.z);
      return { id: g.id, index: g.index, x: p.x, y: p.y };
    });

    const start = project(course.startPosition.x, course.startPosition.z);
    const path = buildSmoothPath(nodes);
    const pathLength = estimatePathLength(nodes);
    const contours = buildTerrainContours(width, height, ox, oy, usedW, usedH);

    return {
      width,
      height,
      nodes,
      path,
      pathLength,
      minX,
      maxX,
      minZ,
      maxZ,
      startX: start.x,
      startY: start.y,
      contours,
    };
  });

  protected readonly minimapProgress = computed(() => {
    const map = this.minimap();
    const total = map.nodes.length;
    if (total === 0 || map.pathLength <= 0) {
      return { offset: map.pathLength, ratio: 0 };
    }
    const state = this.courseRun.runState();
    let completed = state.completedGateCount;
    if (state.status === 'finished') {
      completed = total;
    } else if (state.status === 'idle' || state.status === 'invalid') {
      completed = 0;
    }
    const ratio = Math.min(1, Math.max(0, completed / Math.max(total - 1, 1)));
    return {
      offset: map.pathLength * (1 - ratio),
      ratio,
    };
  });

  protected readonly droneMapPos = computed(() => {
    const map = this.minimap();
    const p = this.flight.position();
    const proj = this.projectWorldToMinimap(map, p.x, p.z);
    return { ...proj, headingDeg: this.headingDegrees() };
  });

  /** Ghost drone marker position on the minimap — visual only, course mode. */
  protected readonly ghostMapPos = computed(() => {
    if (!this.showCourseMap() || !this.ghostRace.isVisible()) {
      return null;
    }
    const sample = this.ghostRace.sample();
    if (!sample) {
      return null;
    }
    const map = this.minimap();
    return this.projectWorldToMinimap(map, sample.position.x, sample.position.z);
  });

  private projectWorldToMinimap(
    map: MinimapLayout,
    x: number,
    z: number,
  ): { x: number; y: number } {
    const spanX = Math.max(map.maxX - map.minX, 1);
    const spanZ = Math.max(map.maxZ - map.minZ, 1);
    const worldAspect = spanX / spanZ;
    const viewAspect = map.width / map.height;
    let usedW = map.width;
    let usedH = map.height;
    let ox = 0;
    let oy = 0;
    if (worldAspect > viewAspect) {
      usedH = map.width / worldAspect;
      oy = (map.height - usedH) * 0.5;
    } else {
      usedW = map.height * worldAspect;
      ox = (map.width - usedW) * 0.5;
    }

    const rawX = ox + ((x - map.minX) / spanX) * usedW;
    const rawY = oy + ((z - map.minZ) / spanZ) * usedH;
    return {
      x: Math.min(map.width - 4, Math.max(4, rawX)),
      y: Math.min(map.height - 4, Math.max(4, rawY)),
    };
  }

  private headingDegrees(): number {
    return (headingYawRad(this.flight.orientation()) * 180) / Math.PI;
  }

  constructor() {
    effect(() => {
      const connected = this.controller.connected();
      const hasCalibration = this.calibration.hasCalibration();

      untracked(() => {
        if (this.flight.armed()) {
          if (this.wasConnected && !connected) {
            this.flight.disarm();
          } else if (this.hadCalibration && !hasCalibration) {
            this.flight.disarm();
          }
        }
        this.wasConnected = connected;
        this.hadCalibration = hasCalibration;
      });
    });

    // Crash during timed run → invalidate.
    effect(() => {
      const crashed = this.flight.crashed();
      const status = this.courseRun.runState().status;
      untracked(() => {
        if (
          crashed &&
          this.playMode() === 'course' &&
          (status === 'running' || status === 'countdown')
        ) {
          this.courseRun.invalidateRun('Crash');
          this.gameplayAudio.beepInvalid();
          this.replayRecorder.cancelRecording();
          this.recordingActive = false;
        }
      });
    });

    // Sync audio settings.
    effect(() => {
      const audio = this.trainerSettings.settings().audio;
      const weather = this.trainerSettings.settings().weather;
      untracked(() => {
        this.audioManager.applySettings(audio);
        this.audioManager.applyAmbienceVolumes(
          weather.environmentAmbienceVolume,
          weather.weatherAudioVolume,
        );
        this.environmentAudio.setEnabled(audio.audioEnabled);
        this.audioMuted.set(!audio.audioEnabled || this.audioManager.isMuted);
      });
    });

    // Latch training results (success/failed) exactly once per attempt.
    effect(() => {
      const state = this.academy.state();
      const evaluation = this.academy.evaluation();
      untracked(() => {
        if (state === 'results' && evaluation && !this.trainingResultHandled) {
          this.trainingResultHandled = true;
          this.handleTrainingResult(evaluation);
        }
        if (state !== 'results') {
          this.trainingResultHandled = false;
        }
      });
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  ngAfterViewInit(): void {
    this.session.setResizeHandler(() => this.renderer.requestResize());
    this.applyLaunchIntent();
    this.mountRenderer();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.bindReducedMotion();
    requestAnimationFrame(() => this.hudReady.set(true));

    if (
      this.session.consumeAutoFullscreenArm() &&
      this.autoFullscreenOnFlight()
    ) {
      void this.session.enter(this.stageHost().nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  protected onArmToggle(): void {
    if (!this.canFly() || this.isReplayMode()) {
      return;
    }
    void this.unlockAudio();
    const wasArmed = this.flight.armed();
    const input = this.sampleMergedInput();
    const ok = this.flight.toggleArm(input.throttle);
    if (ok) {
      this.gameplayAudio.play(wasArmed ? 'disarm' : 'arm');
    }
  }

  protected onResetDrone(): void {
    if (this.isReplayMode()) {
      return;
    }
    this.physicsIntegrity.clearLock();
    this.physicsWarning.set(null);
    void this.unlockAudio();
    this.gameplayAudio.play('reset');
    this.physicsSession.resetDynamicProps();
    this.crashReasonLabel.set(null);
    this.renderer.setDroneDamageState('pristine', 0);
    if (this.recordingActive) {
      this.replayRecorder.cancelRecording();
      this.recordingActive = false;
    }
    if (this.playMode() === 'course') {
      this.resetDroneToCourseStart();
      this.ghostRace.onReset();
      this.syncGhostVisibility();
    } else if (this.playMode() === 'training') {
      const module = this.trainingModule();
      if (module) {
        this.flight.reset({
          position: module.spawnPose.position,
          orientation: module.spawnPose.orientation,
        });
      } else {
        this.flight.reset();
      }
    } else {
      this.flight.reset();
    }
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.cameraEffects.reset();
    this.wasCrashed = false;
    this.syncRendererPose();
  }

  protected onStartRun(): void {
    if (!this.canFly() || this.isReplayMode()) {
      return;
    }
    void this.unlockAudio();
    this.exitReplayInternal();
    this.paused.set(false);
    this.settingsOpen.set(false);
    this.rateMenuOpen.set(false);
    this.playMode.set('course');
    this.renderer.clearTrainingOverlays();
    this.courseRun.prepareRun();
    this.resetDroneToCourseStart();
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.lastCountdownBeep = -1;
    this.lastCompletedGates = 0;
    this.runHadMiss = false;
    this.ghostSavedThisRun.set(false);
    this.ghostBeatenThisRun.set(false);
    this.lastGhostSaveWarning.set(null);
    this.lastXpEarned.set(0);
    this.ghostReadyPlayedThisRun = false;
    this.celebratingGate.set(null);
    this.gateFlashLabel.set(null);
    this.newBestLabel.set(null);
    this.cameraEffects.reset();
    // Timed races keep weather fixed for the entire run.
    this.weather.lockForRace();
    this.courseRun.setWeatherCategory(this.weather.recordCategory());
    this.ensureGhostLoaded(this.courseRun.course());
    this.courseRun.startCountdown();
    this.ghostOnCountdownStart();
    this.syncRendererPose();
    this.syncGateVisuals();
    void this.maybeAutoFullscreen();
  }

  protected onRetryRun(): void {
    this.onStartRun();
  }

  protected onCancelRun(): void {
    void this.unlockAudio();
    if (this.recordingActive) {
      this.replayRecorder.cancelRecording();
      this.recordingActive = false;
    }
    this.courseRun.resetRun();
    this.flight.disarm();
    this.ghostRace.onCancel();
    this.syncGhostVisibility();
    this.syncGateVisuals();
  }

  protected onFreeFlight(): void {
    void this.unlockAudio();
    this.exitReplayInternal();
    if (this.recordingActive) {
      this.replayRecorder.cancelRecording();
      this.recordingActive = false;
    }
    this.courseRun.resetRun();
    this.exitTrainingInternal();
    this.playMode.set('free');
    this.flight.reset();
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.paused.set(false);
    this.ghostRace.clear();
    this.renderer.setGhostVisible(false);
    this.renderer.clearTrainingOverlays();
    this.syncRendererPose();
    this.syncGateVisuals();
  }

  protected onCourseMode(): void {
    void this.unlockAudio();
    this.exitReplayInternal();
    this.exitTrainingInternal();
    this.playMode.set('course');
    this.courseRun.resetRun();
    this.renderer.clearTrainingOverlays();
    this.resetDroneToCourseStart();
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.paused.set(false);
    this.syncRendererPose();
    this.syncGateVisuals();
  }

  // --- Training Academy flow ---

  protected onStartTraining(): void {
    if (!this.canFly() || this.isReplayMode()) {
      return;
    }
    const module = this.trainingModule();
    if (!module) {
      return;
    }
    void this.unlockAudio();
    this.paused.set(false);
    this.settingsOpen.set(false);
    this.rateMenuOpen.set(false);
    this.academy.startPreparing();
    this.flight.reset({
      position: module.spawnPose.position,
      orientation: module.spawnPose.orientation,
    });
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.lastCountdownBeep = -1;
    this.lastCompletedGates = 0;
    this.trainingElapsedMs.set(0);
    this.trainingGoFlashSeconds.set(0);
    this.cameraEffects.reset();
    this.syncRendererPose();

    if (module.evaluatorType === 'gateCourse') {
      this.courseRun.prepareRun();
      this.academy.startCountdown();
      this.courseRun.startCountdown();
    } else {
      this.academy.startCountdown();
      this.trainingCountdownSeconds.set(3);
    }
    this.syncGateVisuals();
    void this.maybeAutoFullscreen();
  }

  protected onUseRecommendedProfile(): void {
    const module = this.trainingModule();
    if (!module || !this.canChangeProfile()) {
      return;
    }
    void this.unlockAudio();
    this.flight.setRateProfile(module.recommendedRateProfile as RateProfileId);
  }

  protected onCancelTraining(): void {
    void this.unlockAudio();
    this.exitTrainingInternal();
    this.shell.showAcademy();
  }

  protected onRetryTraining(): void {
    const module = this.trainingModule();
    if (!module) {
      return;
    }
    void this.unlockAudio();
    this.academy.retry();
    this.flight.reset({
      position: module.spawnPose.position,
      orientation: module.spawnPose.orientation,
    });
    this.keyboard.resetThrottle();
    this.liveInput.set({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    this.lastCountdownBeep = -1;
    this.lastCompletedGates = 0;
    this.trainingElapsedMs.set(0);
    this.trainingGoFlashSeconds.set(0);
    this.lastXpEarned.set(0);
    this.cameraEffects.reset();
    this.syncRendererPose();
    if (module.evaluatorType === 'gateCourse') {
      this.courseRun.prepareRun();
      this.academy.startCountdown();
      this.courseRun.startCountdown();
    } else {
      this.academy.startCountdown();
      this.trainingCountdownSeconds.set(3);
    }
    this.syncGateVisuals();
  }

  protected onNextTrainingModule(): void {
    void this.unlockAudio();
    const advanced = this.academy.nextModule();
    if (!advanced) {
      this.shell.showAcademy();
      return;
    }
    const module = this.trainingModule();
    if (module) {
      this.flight.reset({
        position: module.spawnPose.position,
        orientation: module.spawnPose.orientation,
      });
      this.syncRendererPose();
      if (module.evaluatorType === 'gateCourse') {
        this.renderer.clearTrainingOverlays();
        this.courseRun.setCourse(TRAINING_GATE_BASICS_COURSE);
        this.courseRun.prepareRun();
        this.syncGateVisuals();
      } else {
        this.applyTrainingOverlaysForModule(module);
      }
    }
  }

  protected onReturnToAcademy(): void {
    void this.unlockAudio();
    this.exitTrainingInternal();
    this.shell.showAcademy();
  }

  private exitTrainingInternal(): void {
    this.academy.returnToIdle();
    this.renderer.clearTrainingOverlays();
    this.trainingCountdownSeconds.set(0);
    this.trainingGoFlashSeconds.set(0);
    this.trainingElapsedMs.set(0);
  }

  protected onSwitchCamera(): void {
    if (this.isReplayMode()) {
      this.replayPlayback.cycleCamera();
      this.renderer.setReplayCameraMode(this.replayPlayback.selectedReplayCamera());
      return;
    }
    const mode = this.renderer.toggleCameraMode();
    this.cameraMode.set(mode);
  }

  protected cycleHudMode(): void {
    const order: FlightHudMode[] = ['full', 'compact', 'minimal'];
    const idx = order.indexOf(this.hudMode());
    const next = order[(idx + 1) % order.length] ?? 'full';
    this.hudMode.set(next);
    try {
      localStorage.setItem('fpv.hud.mode', next);
    } catch {
      // Ignore storage failures.
    }
  }

  protected onSelectProfile(id: RateProfileId): void {
    if (!this.canChangeProfile()) {
      return;
    }
    void this.unlockAudio();
    this.flight.setRateProfile(id);
    this.rateMenuOpen.set(false);
  }

  protected onToggleMute(): void {
    void this.unlockAudio();
    const next = !this.audioManager.isMuted;
    this.audioManager.setMuted(next);
    this.audioMuted.set(next);
    if (!next) {
      this.trainerSettings.patchAudio({ audioEnabled: true });
    }
  }

  protected onEnableAudio(): void {
    void this.unlockAudio().then((ok) => {
      if (ok) {
        this.audioManager.dismissGestureHint();
      } else {
        this.audioManager.markNeedsGesture();
      }
    });
  }

  protected onViewportPointer(): void {
    void this.unlockAudio();
  }

  protected onOpenCalibration(): void {
    this.calibration.openWelcomeOrComplete();
    this.shell.showCalibration();
  }

  protected onTogglePause(): void {
    if (this.isReplayMode()) {
      this.replayPlayback.togglePlayPause();
      this.gameplayAudio.play(
        this.replayPlayback.state() === 'playing' ? 'resume' : 'pause',
      );
      return;
    }
    void this.unlockAudio();
    const next = !this.paused();
    this.paused.set(next);
    this.gameplayAudio.play(next ? 'pause' : 'resume');
    if (next) {
      this.rateMenuOpen.set(false);
      this.analytics.track(AnalyticsEvents.pauseOpened, { mode: this.playMode() });
    }
  }

  protected isTrainingMode(): boolean {
    return this.playMode() === 'training';
  }

  protected isRaceMode(): boolean {
    return this.playMode() === 'course';
  }

  protected onRestartFlight(): void {
    this.onResetDrone();
    if (this.playMode() === 'course') {
      this.onStartRun();
    }
    this.paused.set(false);
  }

  protected onOpenFlightSettings(): void {
    this.settingsOpen.set(true);
    this.paused.set(true);
  }

  protected onPauseFeedback(): void {
    this.paused.set(true);
    this.shell.showFeedback();
  }

  protected onReturnSetup(): void {
    this.paused.set(false);
    if (this.playMode() === 'training') {
      this.shell.showLearn();
      return;
    }
    if (this.playMode() === 'course') {
      this.shell.showCourses();
      return;
    }
    this.shell.showFly();
  }

  protected onReturnHangar(): void {
    this.paused.set(false);
    this.shell.showHangar();
  }

  protected onExitToDashboard(): void {
    this.paused.set(false);
    this.shell.showHome();
  }

  protected onCrashReset(): void {
    this.onResetDrone();
    this.paused.set(false);
  }

  protected onCrashRestart(): void {
    this.onRestartFlight();
    this.paused.set(false);
  }

  protected onToggleSettings(): void {
    void this.unlockAudio();
    const next = !this.settingsOpen();
    this.settingsOpen.set(next);
    if (next) {
      this.rateMenuOpen.set(false);
    } else {
      // closing settings leaves pause state as-is
    }
  }

  protected onToggleRateMenu(): void {
    void this.unlockAudio();
    this.rateMenuOpen.update((open) => !open);
  }

  protected onToggleFullscreen(): void {
    void this.unlockAudio();
    void this.session.toggle(this.stageHost().nativeElement);
  }

  protected onAutoFullscreenChange(enabled: boolean): void {
    this.trainerSettings.setAutoFullscreenOnFlight(enabled);
  }

  protected onCloseResults(): void {
    this.courseRun.resetRun();
    this.syncGateVisuals();
  }

  protected onWatchReplay(): void {
    const replay = this.replayRecorder.getLatestReplay();
    if (!replay) {
      return;
    }
    void this.unlockAudio();
    const defaults = this.trainerSettings.replaySettings();
    const ok = this.replayPlayback.load(replay, {
      camera: defaults.replayDefaultCamera,
      speed: defaults.replayDefaultSpeed,
    });
    if (!ok) {
      return;
    }
    this.replayUiOpen.set(true);
    this.paused.set(false);
    this.flight.disarm();
    this.settingsOpen.set(false);
    this.renderer.setReplayCameraMode(
      this.replayPlayback.selectedReplayCamera(),
    );
    if (defaults.replayFlightTrailEnabled) {
      this.renderer.setFlightTrail(
        replay.frames.map((f) => f.position),
        true,
      );
      this.renderer.setFlightTrailProgress(0);
    } else {
      this.renderer.clearFlightTrail();
    }
    this.applyReplaySample();
    this.replayPlayback.play();
  }

  protected onExitReplay(): void {
    this.exitReplayInternal();
    this.syncRendererPose();
    this.syncGateVisuals();
  }

  protected onReplaySpeed(speed: ReplayPlaybackSpeed): void {
    this.replayPlayback.setSpeed(speed);
  }

  protected onReplayCamera(camera: ReplayCameraMode): void {
    this.replayPlayback.setCamera(camera);
    this.renderer.setReplayCameraMode(camera);
  }

  protected onReplayScrubStart(): void {
    this.scrubbingReplay = true;
    this.replayPlayback.beginScrub();
  }

  protected onReplayScrub(value: string | number): void {
    const ms = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(ms)) {
      return;
    }
    this.replayPlayback.scrubTo(ms);
    this.applyReplaySample();
  }

  protected onReplayScrubEnd(): void {
    this.scrubbingReplay = false;
    this.replayPlayback.endScrub();
  }

  protected onResetPolishSettings(): void {
    this.trainerSettings.resetPolishSettings();
    this.audioManager.applySettings(this.trainerSettings.audioSettings());
    this.renderer.setVisualEffectsSettings(
      this.trainerSettings.visualEffectsSettings(),
      this.environmentSettings().quality,
    );
  }

  protected onCameraEffectsToggle(enabled: boolean): void {
    this.trainerSettings.patchCamera({ cameraEffectsEnabled: enabled });
  }

  protected onCameraIntensity(intensity: CameraEffectsIntensity): void {
    this.trainerSettings.patchCamera({ cameraEffectsIntensity: intensity });
  }

  protected onCameraEffectFlag(
    key:
      | 'speedVibrationEnabled'
      | 'throttleVibrationEnabled'
      | 'impactShakeEnabled'
      | 'dynamicFovEnabled',
    value: boolean,
  ): void {
    this.trainerSettings.patchCamera({ [key]: value });
  }

  protected onForceCameraEffects(value: boolean): void {
    this.forceCameraEffects.set(value);
  }

  protected onAudioVolume(
    key: 'masterVolume' | 'motorVolume' | 'effectsVolume' | 'uiVolume',
    value: string | number,
  ): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    this.trainerSettings.patchAudio({ [key]: Math.round(n) });
    this.audioManager.applySettings(this.trainerSettings.audioSettings());
  }

  protected onAudioEnabled(enabled: boolean): void {
    this.trainerSettings.patchAudio({ audioEnabled: enabled });
    this.audioManager.applySettings(this.trainerSettings.audioSettings());
    this.audioMuted.set(!enabled);
  }

  protected onVisualFlag(
    key:
      | 'propellerBlurEnabled'
      | 'groundDustEnabled'
      | 'crashParticlesEnabled'
      | 'gatePulseEnabled',
    value: boolean,
  ): void {
    this.trainerSettings.patchVisualEffects({ [key]: value });
    this.renderer.setVisualEffectsSettings(
      this.trainerSettings.visualEffectsSettings(),
      this.environmentSettings().quality,
    );
  }

  protected onReplayTrailToggle(enabled: boolean): void {
    this.trainerSettings.patchReplay({ replayFlightTrailEnabled: enabled });
  }

  protected onGhostToggle(enabled: boolean): void {
    this.trainerSettings.patchGhost({ ghostEnabled: enabled });
    this.syncGhostVisibility();
  }

  protected onGhostTrailToggle(enabled: boolean): void {
    this.trainerSettings.patchGhost({ ghostTrailEnabled: enabled });
    const record = this.ghostRace.getRecord();
    this.renderer.setGhostTrail(record?.replay ?? null, enabled);
  }

  protected onGhostOpacity(value: string | number): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      return;
    }
    const opacity = Math.min(1, Math.max(0, n));
    this.trainerSettings.patchGhost({ ghostOpacity: opacity });
    this.renderer.setGhostOpacity(opacity);
  }

  protected onGhostCountdownPreviewToggle(enabled: boolean): void {
    this.trainerSettings.patchGhost({ ghostCountdownPreview: enabled });
  }

  protected onGhostComparisonMode(mode: GhostComparisonModeSetting): void {
    this.trainerSettings.patchGhost({ ghostComparisonMode: mode });
  }

  protected onTrainingGuidanceToggle(enabled: boolean): void {
    this.trainerSettings.patchTraining({ trainingGuidanceEnabled: enabled });
  }

  protected onTrainingTipsToggle(enabled: boolean): void {
    this.trainerSettings.patchTraining({ trainingTipsEnabled: enabled });
  }

  protected onAutoShowBriefingToggle(enabled: boolean): void {
    this.trainerSettings.patchTraining({ autoShowTrainingBriefing: enabled });
  }

  protected onAchievementNotificationsToggle(enabled: boolean): void {
    this.trainerSettings.patchProgression({ achievementNotificationsEnabled: enabled });
  }

  protected onXpNotificationsToggle(enabled: boolean): void {
    this.trainerSettings.patchProgression({ xpNotificationsEnabled: enabled });
  }

  protected onEnvironmentQuality(quality: EnvironmentQuality): void {
    if (this.environmentSettings().quality === quality) {
      return;
    }
    this.trainerSettings.setQuality(quality);
    void this.rebuildEnvironment();
  }

  protected onEnvironmentTimeOfDay(timeOfDay: TimeOfDay): void {
    if (this.environmentSettings().timeOfDay === timeOfDay) {
      return;
    }
    this.trainerSettings.setTimeOfDay(timeOfDay);
    void this.rebuildEnvironment();
  }

  protected onEnvironmentVegetation(vegetation: boolean): void {
    if (this.environmentSettings().vegetation === vegetation) {
      return;
    }
    this.trainerSettings.setVegetation(vegetation);
    void this.rebuildEnvironment();
  }

  protected onEnvironmentShadows(shadows: boolean): void {
    if (this.environmentSettings().shadows === shadows) {
      return;
    }
    this.trainerSettings.setShadows(shadows);
    void this.rebuildEnvironment();
  }

  protected onEnvironmentFog(fog: boolean): void {
    if (this.environmentSettings().fog === fog) {
      return;
    }
    this.trainerSettings.setFog(fog);
    this.renderer.setFogEnabled(fog);
    this.syncWeatherVisuals();
  }

  protected onWeatherPreset(presetId: string): void {
    const run = this.courseRun.runState().status;
    if (run === 'countdown' || run === 'running') {
      return;
    }
    this.trainerSettings.patchWeather({
      selectedFreeFlightWeatherPreset: presetId,
    });
    if (this.playMode() === 'free') {
      this.weather.transitionToPreset(presetId);
    } else {
      this.weather.applyPreset(presetId);
    }
    this.courseRun.setWeatherCategory(this.weather.recordCategory());
    this.ghostLoadedForCourseId = null;
    this.syncWeatherVisuals();
  }

  protected onSelectEnvironment(environmentId: string): void {
    if (this.environmentSettings().selectedEnvironmentId === environmentId) {
      return;
    }
    const run = this.courseRun.runState().status;
    if (run === 'countdown' || run === 'running') {
      const ok = confirm(
        'Switching environment will end the current session.',
      );
      if (!ok) {
        return;
      }
      this.courseRun.resetRun();
      this.flight.disarm();
    }
    this.trainerSettings.patchEnvironment({ selectedEnvironmentId: environmentId });
    const meta = this.environmentRegistry.resolve(environmentId);
    const course =
      this.courseCatalog.getPlayable(meta.supportedCourses[0] ?? '') ??
      this.courseRun.course();
    if (course.environmentId === meta.id || meta.supportedCourses.includes(course.id)) {
      this.courseRun.setCourse(course);
    } else if (meta.supportedCourses[0]) {
      const preferred = this.courseCatalog.getPlayable(meta.supportedCourses[0]);
      if (preferred) {
        this.courseRun.setCourse(preferred);
      }
    }
    this.weather.unlock();
    this.weather.applyPreset(
      this.trainerSettings.weatherSettings().selectedFreeFlightWeatherPreset ||
        meta.defaultWeatherPresetId,
    );
    this.ghostLoadedForCourseId = null;
    void this.rebuildEnvironment();
  }

  protected onWindHudToggle(enabled: boolean): void {
    this.trainerSettings.patchWeather({ windHudEnabled: enabled });
  }

  protected onWindPhysicsToggle(enabled: boolean): void {
    this.trainerSettings.patchWeather({ windPhysicsEnabled: enabled });
    if (!enabled) {
      this.flight.clearWind();
    }
  }

  protected onPrecipitationToggle(enabled: boolean): void {
    this.trainerSettings.patchWeather({ precipitationEnabled: enabled });
    this.syncWeatherVisuals();
  }

  protected onAmbienceVolume(volume: number): void {
    this.trainerSettings.patchWeather({ environmentAmbienceVolume: volume });
    this.audioManager.applyAmbienceVolumes(
      volume,
      this.weatherSettings().weatherAudioVolume,
    );
  }

  protected onWeatherAudioVolume(volume: number): void {
    this.trainerSettings.patchWeather({ weatherAudioVolume: volume });
    this.audioManager.applyAmbienceVolumes(
      this.weatherSettings().environmentAmbienceVolume,
      volume,
    );
  }

  private applyWindToFlight(_fixedDt: number): void {
    const weatherCfg = this.trainerSettings.weatherSettings();
    if (!weatherCfg.windPhysicsEnabled) {
      this.flight.clearWind();
      this.flight.setWindTorqueScale(0);
      return;
    }
    if (this.isReplayMode()) {
      this.flight.clearWind();
      return;
    }
    const sample = this.weather
      .getWindField()
      .sample(this.flight.position(), this.flight.getSimulationTime());
    this.flight.setWindSample({
      velocity: sample.velocity,
      turbulence: this.weather.state().wind.turbulence,
      gustActive: sample.gustActive,
    });
    const trainingReduced =
      this.playMode() === 'training' ? 0.35 : 0.12;
    this.flight.setWindTorqueScale(
      this.weather.state().wind.enabled ? trainingReduced : 0,
    );

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastWindHudMs > 120) {
      this.lastWindHudMs = now;
      const st = this.weather.state();
      this.windHudSample.set({
        speed: sample.speed,
        gustActive: sample.gustActive,
        presetName: getWeatherPreset(st.presetId)?.name ?? st.presetId,
        dirX: st.wind.baseDirection.x,
        dirZ: st.wind.baseDirection.z,
      });
    }
  }

  private syncEnvironmentAudio(nowMs: number): void {
    if (nowMs - this.lastAmbienceAudioMs < 200) {
      return;
    }
    this.lastAmbienceAudioMs = nowMs;
    this.environmentAudio.ensureStarted();
    const meta = this.environmentRegistry.resolve(
      this.environmentSettings().selectedEnvironmentId,
    );
    const st = this.weather.state();
    this.environmentAudio.setTheme(meta.theme);
    this.environmentAudio.setWindSpeed(st.wind.enabled ? st.wind.baseSpeed : 0);
    const precipEnabled =
      this.trainerSettings.weatherSettings().precipitationEnabled;
    this.environmentAudio.setPrecipitation(
      precipEnabled ? st.precipitationType : 'none',
      precipEnabled ? st.precipitationIntensity : 0,
    );
  }

  private syncWeatherVisuals(): void {
    const generated = this.renderer.environment;
    if (!generated) {
      return;
    }
    const weatherCfg = this.trainerSettings.weatherSettings();
    const state = this.weather.state();
    if (!weatherCfg.weatherVisualsEnabled) {
      this.renderer.applyWeatherVisuals(
        {
          ...state,
          precipitationType: 'none',
          precipitationIntensity: 0,
          fogDensity: 0.3,
        },
        {
          quality: generated.quality,
          fogEnabled: this.environmentSettings().fog,
          precipitationEnabled: false,
          reduceMotion:
            this.prefersReducedMotion || weatherCfg.reduceWeatherMotion,
          baseFog: generated.fog,
          environmentId: generated.definitionId,
        },
      );
      return;
    }
    this.renderer.applyWeatherVisuals(state, {
      quality: generated.quality,
      fogEnabled: this.environmentSettings().fog,
      precipitationEnabled: weatherCfg.precipitationEnabled,
      reduceMotion:
        this.prefersReducedMotion ||
        weatherCfg.reduceWeatherMotion ||
        weatherCfg.reducePrecipitationDensity,
      baseFog: generated.fog,
      environmentId: generated.definitionId,
    });
  }

  protected onRetryEnvironment(): void {
    void this.rebuildEnvironment({ forceFallback: this.environmentRetryCount() >= 1 });
  }

  protected gateNodeState(
    index: number,
  ): 'pending' | 'current' | 'done' | 'celebrate' {
    const state = this.courseRun.runState();
    const celebrate = this.celebratingGate();
    const runActive =
      state.status === 'countdown' ||
      state.status === 'running' ||
      state.status === 'finished';

    if (!runActive) {
      return 'pending';
    }
    if (index < state.completedGateCount) {
      return celebrate === index ? 'celebrate' : 'done';
    }
    if (
      (state.status === 'countdown' || state.status === 'running') &&
      index === state.currentGateIndex
    ) {
      return 'current';
    }
    return 'pending';
  }

  protected formatFlightTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  protected formatGhostBest(): string {
    const ms = this.ghostRace.hud().bestTimeMs;
    return ms === null ? '--:--.--' : formatRunTime(ms / 1000);
  }

  protected formatGhostDelta(): string {
    const hud = this.ghostRace.hud();
    const delta = hud.comparison?.smoothedDeltaSeconds ?? hud.finalDeltaSeconds ?? null;
    return formatGhostDeltaSeconds(delta);
  }

  protected ghostAheadLabel(): string {
    const hud = this.ghostRace.hud();
    if (hud.raceState === 'finished' && hud.ghostBeaten !== null) {
      return hud.ghostBeaten ? 'Ghost Beaten' : 'Ghost Wins';
    }
    const aheadState = hud.comparison?.aheadState;
    if (aheadState === 'ahead') {
      return 'Ahead';
    }
    if (aheadState === 'behind') {
      return 'Behind';
    }
    return '';
  }

  private resetDroneToCourseStart(): void {
    const course = this.courseRun.course();
    this.flight.reset({
      position: course.startPosition,
      orientation: course.startOrientation,
    });
  }

  private mountRenderer(): void {
    if (this.mounted) {
      return;
    }
    void this.rebuildEnvironment({ initial: true });
  }

  /** Consume the shell's launch intent and stage course/mode before first mount. */
  private applyLaunchIntent(): void {
    const intent = this.shell.consumeFlightIntent();
    if (!intent) {
      return;
    }

    if (intent.kind === 'free' || intent.kind === 'test-flight') {
      this.playMode.set('free');
      this.pendingLaunchIntent = intent;
      if (intent.aircraftId) {
        this.selectedAircraft.select(intent.aircraftId);
      }
      this.guidance.stop();
      this.continueXp.remember({
        kind: intent.kind === 'test-flight' ? 'test-flight' : 'free-flight',
        label: `${intent.kind === 'test-flight' ? 'Test Flight' : 'Free Flight'} with ${this.selectedAircraft.selectedAircraftId()}`,
        aircraftId: this.selectedAircraft.selectedAircraftId(),
        environmentId: this.trainerSettings.environmentSettings().selectedEnvironmentId,
      });
      return;
    }

    if (intent.kind === 'race') {
      const course = this.courseCatalog.getPlayable(intent.courseId);
      if (!course) {
        return;
      }
      this.courseRun.setCourse(course);
      this.playMode.set('course');
      this.pendingLaunchIntent = intent;
      if (intent.aircraftId) {
        this.selectedAircraft.select(intent.aircraftId);
      }
      if (intent.ranked && intent.rankedSession) {
        this.activeRankedSession = {
          id: intent.rankedSession.id,
          courseId: intent.courseId,
          environmentId: intent.rankedSession.environmentId,
          weatherPresetId: intent.rankedSession.weatherPresetId,
          nonce: intent.rankedSession.nonce,
          rulesVersion: intent.rankedSession.rulesVersion,
          expiresAt: intent.rankedSession.expiresAt,
        };
        this.rankedSubmissionId = crypto.randomUUID();
        this.analytics.track('ranked_run_started', { courseId: intent.courseId });
      } else {
        this.activeRankedSession = null;
        this.rankedSubmissionId = null;
      }
      return;
    }

    if (intent.kind === 'training') {
      const module = getTrainingModuleById(intent.moduleId);
      if (!module) {
        return;
      }
      this.playMode.set('training');
      if (module.evaluatorType === 'gateCourse') {
        this.courseRun.setCourse(TRAINING_GATE_BASICS_COURSE);
      }
      this.pendingLaunchIntent = intent;
      this.guidance.start('first-flight-v1', { competitive: false });
      this.continueXp.remember({
        kind: 'training',
        label: `Continue training: ${module.title}`,
        moduleId: module.id,
        aircraftId: intent.aircraftId ?? this.selectedAircraft.selectedAircraftId(),
        environmentId: module.environmentId,
      });
      return;
    }

    if (intent.kind === 'replay') {
      this.pendingLaunchIntent = intent;
    }

    if (intent.kind === 'mission') {
      // Mission flights reuse the shared free-flight runtime path.
      // Full mission scoring / location install is Checkpoint 4+.
      this.playMode.set('free');
      this.pendingLaunchIntent = intent;
      this.selectedAircraft.select(intent.aircraftId);
      this.guidance.stop();
      return;
    }
  }

  /** Apply the staged launch intent once the environment/drone is ready. */
  private handlePendingLaunchIntent(): void {
    const intent = this.pendingLaunchIntent;
    this.pendingLaunchIntent = null;
    if (!intent) {
      return;
    }

    switch (intent.kind) {
      case 'free':
      case 'test-flight':
        this.flight.reset();
        this.syncRendererPose();
        break;
      case 'race': {
        if (intent.weatherPresetId) {
          this.weather.applyPreset(intent.weatherPresetId, {
            lock: true,
            environmentId: this.courseRun.course().environmentId,
          });
          this.courseRun.setWeatherCategory(this.weather.recordCategory());
          this.syncWeatherVisuals();
        }
        const course = this.courseRun.course();
        this.courseRun.prepareRun();
        this.resetDroneToCourseStart();
        this.syncRendererPose();
        this.syncGateVisuals();
        this.ensureGhostLoaded(course);
        break;
      }
      case 'training': {
        const module = getTrainingModuleById(intent.moduleId);
        if (module) {
          this.startTrainingModule(module);
        }
        break;
      }
      case 'replay':
        if (this.replayRecorder.hasReplay()) {
          this.onWatchReplay();
        }
        break;
      case 'mission': {
        // Shared free-flight runtime; mission coordinator observes fixed steps.
        this.flight.reset();
        this.syncRendererPose();
        this.missionRuntimeCoordinator.attach(
          this.flightSimClock.sessionGeneration(),
        );
        break;
      }
    }
  }

  private startTrainingModule(module: TrainingModuleDefinition): void {
    this.academy.openBriefing(module.id);
    const weatherPreset =
      typeof module.evaluatorConfig['weatherPresetId'] === 'string'
        ? module.evaluatorConfig['weatherPresetId']
        : 'calm';
    this.weather.applyPreset(weatherPreset, {
      lock: true,
      environmentId: module.environmentId,
    });
    this.courseRun.setWeatherCategory(this.weather.recordCategory());
    this.flight.reset({
      position: module.spawnPose.position,
      orientation: module.spawnPose.orientation,
    });
    this.syncRendererPose();
    if (module.evaluatorType === 'gateCourse') {
      this.renderer.clearTrainingOverlays();
      this.courseRun.setCourse(TRAINING_GATE_BASICS_COURSE);
      this.courseRun.prepareRun();
      this.syncGateVisuals();
    } else {
      this.applyTrainingOverlaysForModule(module);
    }
    this.syncWeatherVisuals();
  }

  private applyTrainingOverlaysForModule(module: TrainingModuleDefinition): void {
    const opacity = this.trainerSettings.settings().training.trainingTargetOpacity;
    const cfg = module.evaluatorConfig;
    const spec = buildTrainingOverlaySpec(module.evaluatorType, cfg, opacity);
    if (spec) {
      this.renderer.setTrainingOverlays(spec);
    } else {
      this.renderer.clearTrainingOverlays();
    }
  }

  private async rebuildEnvironment(options?: {
    initial?: boolean;
    forceFallback?: boolean;
  }): Promise<void> {
    const host = this.canvasHost().nativeElement;
    const course = this.courseRun.course();
    const pose = {
      position: { ...this.flight.position() },
      orientation: { ...this.flight.orientation() },
    };

    this.environmentLoading.set(true);
    this.environmentReady.set(false);
    this.environmentError.set(null);
    this.environmentStage.set('terrain');
    this.flight.disarm();
    this.paused.set(true);

    // Yield so the loading overlay can paint before synchronous generation.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const settings = this.trainerSettings.environmentSettings();
      const useFallback = options?.forceFallback === true;
      const envId =
        this.playMode() === 'free'
          ? settings.selectedEnvironmentId
          : (course.environmentId ??
            settings.selectedEnvironmentId ??
            'alpine-training-valley');
      const meta = this.environmentRegistry.resolve(envId);
      this.weather.setEnvironmentId(meta.id);
      const freePreset =
        this.trainerSettings.weatherSettings().selectedFreeFlightWeatherPreset;
      if (this.playMode() === 'free') {
        this.weather.unlock();
        this.weather.applyPreset(freePreset || meta.defaultWeatherPresetId);
      } else if (!this.weather.locked()) {
        this.weather.applyPreset('calm');
      }

      // Load selected commercial aircraft into the single simulator runtime.
      this.applySelectedAircraft();

      this.renderer.mount(host, {
        cameraMode: this.cameraMode(),
        course,
        environment: {
          settings,
          definition: meta.definition,
          fallback: useFallback,
          onProgress: (stage) => this.environmentStage.set(stage),
        },
        onBeforeSteps: () => {
          if (this.isReplayMode()) {
            return;
          }
          this.frameInput = this.sampleMergedInput();
        },
        onFixedStep: (fixedDt) => {
          if (this.isReplayMode()) {
            return;
          }
          if (this.paused() || !this.environmentReady()) {
            return;
          }

          this.applyWindToFlight(fixedDt);

          const before = {
            x: this.flight.position().x,
            y: this.flight.position().y,
            z: this.flight.position().z,
          };

          this.prevVelocity = { ...this.flight.velocity() };
          this.flight.update(this.frameInput, fixedDt);

          // Hybrid Rapier collision: custom flight predicted pose → contacts → corrections.
          let collisionOutcome: AuthoritativeCollisionOutcomeSummary = 'unavailable';
          if (this.physicsSession.isActive() && !this.isReplayMode()) {
            const correction = this.physicsSession.processFixedStep({
              position: this.flight.position(),
              velocity: this.flight.velocity(),
              orientation: this.flight.orientation(),
              angularVelocity: this.flight.angularVelocity(),
              armed: this.flight.armed(),
              crashed: this.flight.crashed(),
              timestampMs: this.flight.getSimulationTime() * 1000,
            });
            if (correction) {
              collisionOutcome = correction.outcome;
              const meaningful =
                correction.crash ||
                (correction.outcome !== 'none' &&
                  correction.outcome !== 'safeLanding') ||
                Math.hypot(
                  correction.position.x - this.flight.position().x,
                  correction.position.y - this.flight.position().y,
                  correction.position.z - this.flight.position().z,
                ) > 1e-4 ||
                Math.hypot(
                  correction.velocity.x - this.flight.velocity().x,
                  correction.velocity.y - this.flight.velocity().y,
                  correction.velocity.z - this.flight.velocity().z,
                ) > 1e-4;
              // Apply soft landings only when they actually change state.
              const softLanding =
                correction.outcome === 'safeLanding' && meaningful;
              if (meaningful || softLanding) {
              this.flight.applyCollisionCorrection({
                position: correction.position,
                velocity: correction.velocity,
                angularVelocity: correction.angularVelocity,
                orientation: correction.orientation,
                crash: correction.crash,
                crashReason: correction.crashReason,
                enableTumble: true,
              });
              if (this.recordingActive) {
                for (const ev of correction.events) {
                  if (ev.outcome === 'none' || ev.outcome === 'safeLanding') {
                    continue;
                  }
                  this.replayRecorder.pushCollisionEvent({
                    timestampMs: ev.timestampMs,
                    objectId: ev.objectId,
                    material: ev.material,
                    impactStrength: ev.impactStrength,
                    collisionPoint: { ...ev.collisionPoint },
                    collisionNormal: { ...ev.collisionNormal },
                    outcome: ev.outcome,
                    crashState: ev.crashState,
                    crashReason: ev.crashReason,
                  });
                }
              }
              }
            } else {
              collisionOutcome = 'none';
            }
            this.flight.recordPostPhysicsVelocity(this.flight.velocity());
            this.renderer.setDroneDamageState(
              this.physicsSession.getDamageState(),
              this.flight.getSimulationTime(),
            );
          } else {
            this.flight.recordPostPhysicsVelocity(this.flight.velocity(), null);
            collisionOutcome = this.physicsSession.isActive() ? 'none' : 'unavailable';
          }

          // Authoritative completed-step seam (post-collision, pre course/replay/render).
          this.publishAuthoritativeFixedStep(fixedDt, collisionOutcome);

          const after = this.flight.position();

          if (this.playMode() === 'course') {
            const statusBefore = this.courseRun.runState().status;
            this.courseRun.update(before, after, fixedDt);
            this.handleRunSideEffects(statusBefore);
          } else if (this.playMode() === 'training') {
            this.updateTrainingFixedStep(fixedDt, before, after);
          }

          if (
            !this.hasFiredTakeoff &&
            this.flight.armed() &&
            this.flight.altitude() > 0.5
          ) {
            this.hasFiredTakeoff = true;
            this.achievements.handleEvent({ type: 'takeoff' });
          }

          if (this.recordingActive) {
            this.replayRecorder.pushSample(
              {
                position: after,
                orientation: this.flight.orientation(),
                velocity: this.flight.velocity(),
                angularVelocity: this.flight.angularVelocity(),
                throttle: this.frameInput.throttle,
                armed: this.flight.armed(),
                crashed: this.flight.crashed(),
                currentGateIndex: this.courseRun.runState().currentGateIndex,
              },
              fixedDt,
            );
          }

          this.renderer.applyFlightState({
            position: after,
            orientation: this.flight.orientation(),
          });

          this.handleCrashImpact();
          this.handleArmAudio();
          this.physicsSession.endScrapeIfIdle();
        },
        onFrame: () => {
          const now =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
          let dt = 1 / 60;
          if (this.lastFrameMs !== null) {
            dt = Math.min(0.05, Math.max(0, (now - this.lastFrameMs) / 1000));
          }
          this.lastFrameMs = now;
          this.adaptivePerformance.sampleFrameTime(dt * 1000);
          this.frameMonitor.recordFrame(dt * 1000);
          this.frameMonitor.publish({
            qualityPreset: this.trainerSettings.environmentSettings().quality,
            aircraftId: this.selectedAircraft.selectedAircraftId(),
            environmentId: this.trainerSettings.environmentSettings().selectedEnvironmentId,
          });

          if (this.isReplayMode()) {
            this.tickReplay(dt);
            return;
          }

          const integrity = this.physicsIntegrity.check({
            position: this.flight.position(),
            quaternion: this.flight.orientation(),
            velocity: this.flight.velocity(),
            deltaTime: dt,
          });
          if (!integrity.valid) {
            this.paused.set(true);
            this.physicsWarning.set(
              'Flight state became invalid. Reset aircraft or restart. Issue reported if enabled.',
            );
            return;
          }

          if (this.playMode() === 'training' && this.guidance.isActive()) {
            this.guidance.tick({
              elapsedSec: this.flight.getSimulationTime(),
              throttle: this.frameInput.throttle,
              altitude: this.flight.position().y,
              yawDelta: this.frameInput.yaw,
              pitchDelta: this.frameInput.pitch,
              rollDelta: this.frameInput.roll,
              crashed: this.flight.crashed(),
              controllerDisconnected: !this.controller.connected() && this.hadCalibration,
            });
          }

          if (this.playMode() === 'free') {
            this.weather.update(dt);
          }
          this.syncWeatherVisuals();
          this.syncEnvironmentAudio(now);

          this.liveInput.set(this.frameInput);
          this.syncGateVisuals();
          this.updateSmoothHud(dt);
          this.updateLivePolish(dt);
          this.updateGhostFrame(dt);
          this.impactParticles.update(dt);
        },
      });

      // Start hybrid collision session after renderer has generated environment.
      await this.bootstrapPhysicsSession();

      this.renderer.setVisualEffectsSettings(
        this.trainerSettings.visualEffectsSettings(),
        settings.quality,
      );
      this.syncWeatherVisuals();
      this.courseRun.setWeatherCategory(this.weather.recordCategory());

      if (options?.initial && this.playMode() === 'course') {
        this.resetDroneToCourseStart();
      } else {
        this.flight.reset({
          position: pose.position,
          orientation: pose.orientation,
        });
      }

      this.syncRendererPose();
      this.syncGateVisuals();
      this.mounted = true;
      this.environmentReady.set(true);
      this.environmentLoading.set(false);
      this.environmentStage.set('ready');
      this.paused.set(false);
      if (useFallback) {
        this.environmentRetryCount.update((n) => n + 1);
      } else {
        this.environmentRetryCount.set(0);
      }
      if (options?.initial) {
        this.handlePendingLaunchIntent();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to prepare environment';
      this.environmentError.set(message);
      this.environmentStage.set('error');
      this.environmentLoading.set(false);
      this.environmentReady.set(false);
      this.environmentRetryCount.update((n) => n + 1);

      if (!options?.forceFallback && this.environmentRetryCount() >= 1) {
        await this.rebuildEnvironment({ forceFallback: true });
      }
    }
  }

  private handleRunSideEffects(statusBefore: string): void {
    const state = this.courseRun.runState();

    if (state.status === 'countdown') {
      const step = Math.ceil(state.countdownSeconds);
      if (step !== this.lastCountdownBeep && step >= 1 && step <= 3) {
        this.lastCountdownBeep = step;
        this.gameplayAudio.beepCountdown(step);
      }
    }

    if (statusBefore === 'countdown' && state.status === 'running') {
      this.gameplayAudio.beepGo();
      const throttle = this.frameInput.throttle;
      if (!this.flight.armed() && this.canArm()) {
        this.flight.arm(throttle);
      }
      // Start replay recording when the timed run actually starts.
      const envMeta = this.environmentRegistry.resolve(
        this.courseRun.course().environmentId ??
          this.trainerSettings.environmentSettings().selectedEnvironmentId,
      );
      const weatherSnap = this.weather.snapshotForReplay();
      const physicsMeta = this.physicsSession.getVersionMetadata();
      const aircraftStamp = this.aircraftRuntime.runtime()
        ? stampReplayAircraftMetadata(
            this.aircraftRuntime.runtime()!.definition,
            this.flight.rateProfileId(),
            this.aircraftRuntime.runtime()!.liveryId,
          )
        : null;
      this.replayRecorder.startRecording({
        courseId: this.courseRun.course().id,
        environmentId: envMeta.id,
        environmentVersion: envMeta.version,
        rateProfileId: this.flight.rateProfileId(),
        weatherPresetId: weatherSnap.weatherPresetId,
        weatherCategory: weatherSnap.weatherCategory,
        windSeed: weatherSnap.windSeed,
        windParametersSnapshot: weatherSnap.windParametersSnapshot,
        collisionModelVersion: physicsMeta['collisionModelVersion'],
        colliderManifestVersion: physicsMeta['colliderManifestVersion'],
        droneColliderVersion: physicsMeta['droneColliderVersion'],
        physicsEngineVersion: physicsMeta['physicsEngineVersion'],
        environmentArtVersion: physicsMeta['environmentArtVersion'],
        aircraftId: aircraftStamp?.aircraftId,
        aircraftDefinitionVersion: aircraftStamp?.aircraftDefinitionVersion,
        physicsProfileVersion: aircraftStamp?.physicsProfileVersion,
        colliderVersion: aircraftStamp?.colliderVersion,
        visualVersion: aircraftStamp?.visualVersion,
        liveryId: aircraftStamp?.liveryId,
        cameraProfileId: aircraftStamp?.cameraProfileId,
      });
      this.recordingActive = true;
      this.bestBeforeFinish = state.bestTimeSeconds;
      this.ghostOnRunStart();
    }

    if (state.missedGate || state.wrongDirection) {
      this.runHadMiss = true;
    }

    if (
      state.status === 'running' &&
      state.completedGateCount > this.lastCompletedGates
    ) {
      const justDone = state.completedGateCount - 1;
      const total = this.courseRun.course().gates.length;
      this.gameplayAudio.beepGate();
      this.celebrateGateVisual(justDone, total);
      this.progression.recordGate();
      this.achievements.handleEvent({ type: 'gate' });
      this.ghostOnGateCompleted(justDone, state.elapsedSeconds * 1000);
    }
    this.lastCompletedGates = state.completedGateCount;

    if (statusBefore === 'running' && state.status === 'finished') {
      const isBest =
        state.bestTimeSeconds !== null &&
        Math.abs(state.elapsedSeconds - state.bestTimeSeconds) < 0.0005;
      this.gameplayAudio.play(isBest ? 'best' : 'finish');
      if (isBest) {
        const delta = this.newBestDeltaLabel();
        this.newBestLabel.set(delta ? `New Best\n${delta}` : 'New Best');
        if (this.bestFlashTimer !== null) {
          clearTimeout(this.bestFlashTimer);
        }
        this.bestFlashTimer = setTimeout(() => {
          this.newBestLabel.set(null);
          this.bestFlashTimer = null;
        }, 2800);
      }

      const finalTimeMs = state.elapsedSeconds * 1000;
      this.ghostRace.onPlayerFinished(finalTimeMs);

      let completedReplay: FlightReplay | null = null;
      if (this.recordingActive) {
        completedReplay = this.replayRecorder.stopRecording({
          saveCompleted: true,
          finalTimeMs,
          bestTimeAtCompletion: this.bestBeforeFinish,
        });
        this.recordingActive = false;
      }

      const course = this.courseRun.course();
      if (completedReplay) {
        const saveResult = this.ghostStorage.saveGhostIfBest(course.id, completedReplay, {
          courseVersion: course.version,
          weatherCategory: this.weather.recordCategory(),
        });
        if (saveResult.saved) {
          this.ghostSavedThisRun.set(true);
          this.lastGhostSaveWarning.set(null);
        } else {
          this.ghostSavedThisRun.set(false);
          if (saveResult.warning) {
            this.lastGhostSaveWarning.set(saveResult.warning);
          }
        }
      }

      const ghostBeaten = this.ghostRace.hud().ghostBeaten === true;
      this.ghostBeatenThisRun.set(ghostBeaten);
      if (ghostBeaten) {
        this.gameplayAudio.play('ghostBeaten');
      }

      const clean = !this.runHadMiss;
      const xpBefore = this.progression.getProgress().experiencePoints;
      this.progression.recordRaceComplete(course.id, { timeMs: finalTimeMs, clean });
      const xpAfter = this.progression.getProgress().experiencePoints;
      this.lastXpEarned.set(Math.max(0, xpAfter - xpBefore));

      this.achievements.handleEvent({
        type: 'race_finish',
        courseId: course.id,
        clean,
      });
      if (ghostBeaten) {
        this.achievements.handleEvent({ type: 'ghost_beaten' });
      }
      if (clean) {
        this.achievements.handleEvent({ type: 'clean_finish', courseId: course.id });
      }
      if (isBest && this.bestBeforeFinish !== null && this.bestBeforeFinish > 0) {
        const improvedPct =
          ((this.bestBeforeFinish - state.elapsedSeconds) / this.bestBeforeFinish) * 100;
        if (improvedPct > 0) {
          this.achievements.handleEvent({
            type: 'best_improved',
            courseId: course.id,
            improvedPct,
          });
        }
      }

      this.maybeSubmitRankedRun({
        durationMs: finalTimeMs,
        completedReplay,
        crashed: this.flight.crashed(),
      });

      if (this.authSession.isGuest()) {
        this.accountPrompt.promptAfterRun(true, isBest);
      }
    }

    if (statusBefore !== 'invalid' && state.status === 'invalid') {
      if (this.recordingActive) {
        this.replayRecorder.cancelRecording();
        this.recordingActive = false;
      }
      this.ghostRace.onCancel();
      this.syncGhostVisibility();
    }
  }

  private celebrateGateVisual(justDone: number, total: number): void {
    this.celebratingGate.set(justDone);
    this.renderer.pulseGate(justDone);
    this.gateFlashLabel.set(`Gate ${justDone + 1} / ${total}`);
    if (this.gateFlashTimer !== null) {
      clearTimeout(this.gateFlashTimer);
    }
    this.gateFlashTimer = setTimeout(() => {
      this.gateFlashLabel.set(null);
      this.gateFlashTimer = null;
    }, 900);
    if (this.celebrateTimer !== null) {
      clearTimeout(this.celebrateTimer);
    }
    this.celebrateTimer = setTimeout(() => {
      if (this.celebratingGate() === justDone) {
        this.celebratingGate.set(null);
      }
      this.celebrateTimer = null;
    }, 700);
  }

  private maybeSubmitRankedRun(args: {
    durationMs: number;
    completedReplay: FlightReplay | null;
    crashed: boolean;
  }): void {
    const session = this.activeRankedSession;
    if (!session) {
      return;
    }
    const course = this.courseRun.course();
    const submissionId = this.rankedSubmissionId ?? crypto.randomUUID();
    this.rankedSubmissionId = submissionId;
    const payload = this.rankedRace.buildSubmissionPayload(
      session,
      {
        durationMs: Math.round(args.durationMs),
        completed: true,
        crashed: args.crashed,
        splits: splitsFromReplay(
          args.completedReplay,
          course.gates.length,
          Math.round(args.durationMs),
        ),
        replay: args.completedReplay
          ? {
              metadata: args.completedReplay.metadata as unknown as Record<string, unknown>,
              frames: args.completedReplay.frames,
            }
          : undefined,
      },
      submissionId,
    );
    this.analytics.track('ranked_run_completed', {
      courseId: course.id,
      durationMs: args.durationMs,
    });
    this.rankedRace.queueOrSubmit(payload).subscribe({
      next: (run) => {
        this.analytics.track(
          run ? 'ranked_submission_accepted' : 'ranked_submission_pending',
          { submissionId, status: run?.status ?? 'queued' },
        );
      },
      error: () => {
        this.analytics.track('ranked_submission_pending', { submissionId });
      },
    });
    // Clear session after one submission attempt; retries use the pending queue.
    this.activeRankedSession = null;
  }

  // --- Ghost lifecycle helpers (visual only — never touch physics/gates/timer) ---

  private ensureGhostLoaded(course: Course): void {
    const weatherCategory = this.weather.recordCategory();
    const cacheKey = `${course.id}:${weatherCategory}`;
    if (this.ghostLoadedForCourseId === cacheKey) {
      return;
    }
    this.ghostLoadedForCourseId = cacheKey;
    this.ghostRace.loadForCourse(course.id, course.gates.length, {
      courseVersion: course.version,
      environmentId: course.environmentId ?? 'alpine-training-valley',
      weatherCategory,
    });
  }

  private ghostOnCountdownStart(): void {
    this.ghostRace.onCountdownStart();
    const ghostSettings = this.trainerSettings.settings().ghost;
    if (ghostSettings.ghostEnabled && ghostSettings.ghostCountdownPreview) {
      this.renderer.setGhostVisible(true);
      this.renderer.setGhostOpacity(ghostSettings.ghostOpacity);
      const record = this.ghostRace.getRecord();
      this.renderer.setGhostTrail(record?.replay ?? null, ghostSettings.ghostTrailEnabled);
      if (!this.ghostReadyPlayedThisRun && record) {
        this.ghostReadyPlayedThisRun = true;
        this.gameplayAudio.play('ghostReady');
      }
    } else {
      this.renderer.setGhostVisible(false);
      this.renderer.clearGhostTrail();
    }
  }

  private ghostOnRunStart(): void {
    this.ghostRace.onRunStart();
    this.syncGhostVisibility();
  }

  private ghostOnGateCompleted(gateIndex: number, playerElapsedMs: number): void {
    this.ghostRace.onPlayerGateCompleted(gateIndex, playerElapsedMs);
    const comparison = this.ghostRace.comparison();
    if (this.ghostRace.isVisible() && comparison?.aheadState) {
      if (comparison.aheadState === 'ahead') {
        this.gameplayAudio.play('splitAhead');
      } else if (comparison.aheadState === 'behind') {
        this.gameplayAudio.play('splitBehind');
      }
    }
  }

  private syncGhostVisibility(): void {
    if (this.isReplayMode()) {
      this.renderer.setGhostVisible(false);
      return;
    }
    const show = this.playMode() === 'course' && this.ghostRace.isVisible();
    this.renderer.setGhostVisible(show);
    if (show) {
      this.renderer.setGhostOpacity(this.trainerSettings.settings().ghost.ghostOpacity);
    }
  }

  private updateGhostFrame(dt: number): void {
    if (this.isReplayMode() || this.playMode() !== 'course') {
      return;
    }
    if (!this.ghostRace.isVisible()) {
      return;
    }
    const state = this.courseRun.runState();
    const ms = state.status === 'running' ? state.elapsedSeconds * 1000 : 0;
    const sample = this.ghostRace.syncToElapsedMs(ms, {
      playerGateIndex: state.currentGateIndex,
      playerCompletedGates: state.completedGateCount,
      paused: this.paused(),
    });
    this.renderer.updateGhostSample(sample, dt);
  }

  // --- Training Academy fixed-step flow ---

  private updateTrainingFixedStep(fixedDt: number, before: Vec3, after: Vec3): void {
    const module = this.trainingModule();
    if (!module) {
      return;
    }

    if (module.evaluatorType === 'gateCourse') {
      const statusBefore = this.courseRun.runState().status;
      this.courseRun.update(before, after, fixedDt);
      this.handleTrainingGateSideEffects(statusBefore);
      const state = this.courseRun.runState();
      if (state.status === 'running') {
        this.academy.update(
          this.buildTrainingSnapshot(after, fixedDt, state.elapsedSeconds * 1000),
        );
      }
      return;
    }

    if (this.trainingGoFlashSeconds() > 0) {
      this.trainingGoFlashSeconds.update((s) => Math.max(0, s - fixedDt));
    }

    const academyState = this.academy.state();

    if (academyState === 'countdown') {
      const prevStep = Math.ceil(this.trainingCountdownSeconds());
      const next = Math.max(0, this.trainingCountdownSeconds() - fixedDt);
      this.trainingCountdownSeconds.set(next);
      const nextStep = Math.ceil(next);
      if (nextStep !== prevStep && nextStep >= 1 && nextStep <= 3) {
        this.gameplayAudio.beepCountdown(nextStep);
      }
      if (next <= 0) {
        this.gameplayAudio.beepGo();
        this.trainingGoFlashSeconds.set(0.55);
        this.academy.beginActive();
        this.trainingElapsedMs.set(0);
        if (!this.flight.armed() && this.canArm()) {
          this.flight.arm(this.frameInput.throttle);
        }
      }
      return;
    }

    if (academyState === 'active') {
      this.trainingElapsedMs.update((ms) => ms + fixedDt * 1000);
      this.academy.update(
        this.buildTrainingSnapshot(after, fixedDt, this.trainingElapsedMs()),
      );
    }
  }

  private handleTrainingGateSideEffects(statusBefore: string): void {
    const state = this.courseRun.runState();

    if (state.status === 'countdown') {
      const step = Math.ceil(state.countdownSeconds);
      if (step !== this.lastCountdownBeep && step >= 1 && step <= 3) {
        this.lastCountdownBeep = step;
        this.gameplayAudio.beepCountdown(step);
      }
    }

    if (statusBefore === 'countdown' && state.status === 'running') {
      this.gameplayAudio.beepGo();
      this.academy.beginActive();
      if (!this.flight.armed() && this.canArm()) {
        this.flight.arm(this.frameInput.throttle);
      }
    }

    if (state.missedGate) {
      this.academy.handleEvent({ type: 'miss' });
    }

    if (
      state.status === 'running' &&
      state.completedGateCount > this.lastCompletedGates
    ) {
      const justDone = state.completedGateCount - 1;
      const total = this.courseRun.course().gates.length;
      this.gameplayAudio.beepGate();
      this.celebrateGateVisual(justDone, total);
      this.academy.handleEvent({ type: 'gate', payload: { gateIndex: justDone } });
    }
    this.lastCompletedGates = state.completedGateCount;

    if (statusBefore === 'running' && state.status === 'finished') {
      this.academy.handleEvent({ type: 'finish' });
    }

    if (statusBefore !== 'invalid' && state.status === 'invalid') {
      this.academy.completeFail('Run invalidated');
    }
  }

  private buildTrainingSnapshot(
    position: Vec3,
    deltaSeconds: number,
    elapsedMs: number,
  ): TrainingSessionSnapshot {
    return {
      position,
      orientation: this.flight.orientation(),
      velocity: this.flight.velocity(),
      speed: this.flight.speed(),
      altitude: this.flight.altitude(),
      armed: this.flight.armed(),
      crashed: this.flight.crashed(),
      throttle: this.frameInput.throttle,
      elapsedMs,
      deltaSeconds,
    };
  }

  private handleTrainingResult(evaluation: TrainingEvaluation): void {
    const module = this.trainingModule();
    if (!module) {
      return;
    }
    if (this.recordingActive) {
      this.replayRecorder.cancelRecording();
      this.recordingActive = false;
    }

    const durationMs = Number.isFinite(evaluation.metrics['finishMs'])
      ? evaluation.metrics['finishMs']
      : Number.isFinite(evaluation.metrics['durationMs'])
        ? evaluation.metrics['durationMs']
        : this.trainingElapsedMs();

    if (evaluation.completed) {
      this.gameplayAudio.play('trainingSuccess');
      if (evaluation.medal !== 'none') {
        this.gameplayAudio.play('medal');
      }
      const result: TrainingResult = {
        moduleId: module.id,
        moduleVersion: module.version,
        completed: true,
        score: evaluation.score,
        medal: evaluation.medal,
        durationMs,
        penalties: evaluation.penalties.reduce((sum, p) => sum + p.amount, 0),
        metrics: { ...evaluation.metrics },
        completedAt: new Date().toISOString(),
      };
      const xpBefore = this.progression.getProgress().experiencePoints;
      this.progression.recordTrainingCompletion(result);
      const xpAfter = this.progression.getProgress().experiencePoints;
      this.lastXpEarned.set(Math.max(0, xpAfter - xpBefore));
      this.achievements.handleEvent({
        type: 'module_complete',
        moduleId: module.id,
        medal: evaluation.medal,
      });
    } else {
      this.gameplayAudio.play('trainingFail');
      this.lastXpEarned.set(0);
    }
  }

  private handleCrashImpact(): void {
    const crashed = this.flight.crashed();
    if (crashed && !this.wasCrashed) {
      const impact = Math.min(
        1.5,
        Math.hypot(this.prevVelocity.x, this.prevVelocity.y, this.prevVelocity.z) /
          10,
      );
      this.cameraEffects.triggerImpact(impact, {
        x: -this.prevVelocity.x,
        y: 1,
        z: -this.prevVelocity.z,
      });
      this.renderer.emitCrashBurst(impact);
      this.gameplayAudio.play('crash');
      this.crashReasonLabel.set(
        this.crashReasonToLabel(this.flight.getCrashReason()),
      );
      this.paused.set(true);
      this.settingsOpen.set(false);
      this.rateMenuOpen.set(false);
    }
    if (!crashed) {
      this.crashReasonLabel.set(null);
    }
    this.wasCrashed = crashed;
  }

  private handleArmAudio(): void {
    const armed = this.flight.armed();
    // Arm/disarm tones are handled in onArmToggle for user gestures;
    // track state for motor audio only.
    this.wasArmed = armed;
  }

  private frameDebugAccum = 0;

  private updateSmoothHud(dt: number): void {
    const a = 1 - Math.exp(-10 * dt);
    const speed = this.flight.speed();
    const alt = this.flight.altitude();
    this.smoothSpeed.update((v) => v + (speed - v) * a);
    this.smoothAltitude.update((v) => v + (alt - v) * a);
    const warn =
      alt < 0.55 &&
      this.flight.armed() &&
      !this.flight.crashed() &&
      this.frameInput.throttle > 0.2;
    this.groundProximityWarn.set(warn);
    this.updateFrameDebugHud();
  }

  /** Throttled (~8 Hz) frame diagnostics — no console logging. */
  private updateFrameDebugHud(): void {
    if (!this.diagnosticsVisible || !this.showFrameDebug()) {
      if (this.frameDebug() !== null) {
        this.frameDebug.set(null);
      }
      return;
    }
    this.frameDebugAccum += 1;
    if (this.frameDebugAccum < 8) {
      return;
    }
    this.frameDebugAccum = 0;
    const physics = this.flight.getFrameDiagnostics();
    const render = this.renderer.getFrameDiagnostics();
    this.frameDebug.set({
      physics,
      modelForward: render?.modelForward ?? { x: 0, y: 0, z: 0 },
      cameraForward: render?.cameraForward ?? { x: 0, y: 0, z: 0 },
      modelQuat: render?.modelQuaternion ?? physics.quaternion,
      rapierActive: this.physicsSession.isActive(),
    });
  }

  private updateLivePolish(dt: number): void {
    const settings = this.trainerSettings.settings();
    const ang = this.flight.angularVelocity();
    const effects = this.cameraEffects.update(
      {
        position: this.flight.position(),
        orientation: this.flight.orientation(),
        velocity: this.flight.velocity(),
        angularVelocity: ang,
        throttle: this.frameInput.throttle,
        armed: this.flight.armed(),
        crashed: this.flight.crashed(),
        speed: this.flight.speed(),
        altitude: this.flight.altitude(),
        paused: this.paused(),
        prefersReducedMotion: this.prefersReducedMotion,
        forceEffectsDespiteReducedMotion: this.forceCameraEffects(),
        settings: settings.camera,
        replayMode: false,
      },
      dt,
    );

    this.renderer.setCameraEffectsState({
      effects,
      baseFov: 75,
      mode: this.cameraMode(),
      replayMode: false,
      chaseStiffness: 6.5,
      chaseDistanceScale: 1,
    });

    this.renderer.updateDroneVisuals(
      {
        throttle: this.frameInput.throttle,
        armed: this.flight.armed(),
        crashed: this.flight.crashed(),
        altitude: this.flight.altitude(),
        speed: this.flight.speed(),
        paused: this.paused(),
      },
      dt,
    );

    const stickDemand = Math.min(
      1,
      (Math.abs(this.frameInput.pitch) +
        Math.abs(this.frameInput.roll) +
        Math.abs(this.frameInput.yaw)) /
        2.2,
    );
    this.droneAudio.update({
      armed: this.flight.armed(),
      crashed: this.flight.crashed(),
      throttle: this.frameInput.throttle,
      stickDemand,
      paused: this.paused(),
    });
  }

  private tickReplay(dt: number): void {
    if (!this.scrubbingReplay) {
      this.replayPlayback.tick(dt);
    }
    this.applyReplaySample();

    const gate = this.replayPlayback.consumeGateEvent();
    if (gate !== null && gate > 0) {
      this.gameplayAudio.beepGate();
      this.renderer.pulseGate(gate - 1);
    }
    if (this.replayPlayback.consumeFinishEvent()) {
      this.gameplayAudio.play('finish');
    }

    const sample = this.replayPlayback.currentSample();
    if (sample) {
      const speed = Math.hypot(
        sample.linearVelocity.x,
        sample.linearVelocity.y,
        sample.linearVelocity.z,
      );
      this.droneAudio.update({
        armed: sample.armed,
        crashed: sample.crashed,
        throttle: sample.throttle,
        paused: this.replayPlayback.state() !== 'playing',
        playbackSpeed: this.replayPlayback.playbackSpeed(),
      });
      this.renderer.updateDroneVisuals(
        {
          throttle: sample.throttle,
          armed: sample.armed,
          crashed: sample.crashed,
          altitude: sample.position.y,
          speed,
          paused: this.replayPlayback.state() !== 'playing',
        },
        dt,
      );

      const camSettings = this.trainerSettings.cameraSettings();
      const effects = this.cameraEffects.update(
        {
          position: sample.position,
          orientation: sample.orientation,
          velocity: sample.linearVelocity,
          angularVelocity: {
            pitch: sample.angularVelocity.x,
            yaw: sample.angularVelocity.y,
            roll: sample.angularVelocity.z,
          },
          throttle: sample.throttle,
          armed: sample.armed,
          crashed: sample.crashed,
          speed,
          altitude: sample.position.y,
          paused: this.replayPlayback.state() !== 'playing',
          prefersReducedMotion: this.prefersReducedMotion,
          forceEffectsDespiteReducedMotion: this.forceCameraEffects(),
          settings: camSettings,
          replayMode: true,
        },
        dt,
      );
      this.renderer.setCameraEffectsState({
        effects,
        baseFov: 75,
        mode: this.replayPlayback.selectedReplayCamera(),
        replayMode: true,
        chaseStiffness: 5,
        chaseDistanceScale: 1.05,
      });
      this.renderer.setFlightTrailProgress(this.replayPlayback.progress());

      // Gate visuals from recorded index — no real gate events.
      const total = this.courseRun.course().gates.length;
      const completed = Math.min(sample.currentGateIndex, total);
      this.renderer.applyCourseVisualState({
        course: this.courseRun.course(),
        currentGateIndex: Math.min(sample.currentGateIndex, total - 1),
        completedGateCount: completed,
        runActive: true,
      });

      this.smoothSpeed.set(speed);
      this.smoothAltitude.set(sample.position.y);
    }
  }

  protected applyReplaySample(): void {
    const sample = this.replayPlayback.currentSample();
    if (!sample) {
      return;
    }
    this.renderer.applyFlightState({
      position: sample.position,
      orientation: sample.orientation,
    });
  }

  protected onReplayRestart(): void {
    this.replayPlayback.restart();
    this.applyReplaySample();
  }

  private exitReplayInternal(): void {
    if (!this.replayPlayback.isActive() && !this.replayUiOpen()) {
      this.renderer.clearReplayMode();
      this.renderer.clearFlightTrail();
      return;
    }
    this.replayPlayback.stop();
    this.replayUiOpen.set(false);
    this.renderer.clearReplayMode();
    this.renderer.clearFlightTrail();
    this.renderer.setCameraMode(this.cameraMode());
    this.cameraEffects.reset();
    this.paused.set(false);
  }

  private async unlockAudio(): Promise<boolean> {
    const ok = await this.audioManager.unlock();
    if (ok) {
      this.droneAudio.ensureStarted();
      this.environmentAudio.ensureStarted();
      const weather = this.trainerSettings.weatherSettings();
      this.audioManager.applyAmbienceVolumes(
        weather.environmentAmbienceVolume,
        weather.weatherAudioVolume,
      );
    } else {
      this.audioManager.markNeedsGesture();
    }
    return ok;
  }

  private bindReducedMotion(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange);
  }

  private readonly onReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion = event.matches;
  };

  private syncGateVisuals(): void {
    const state = this.courseRun.runState();
    this.renderer.applyCourseVisualState({
      course: this.courseRun.course(),
      currentGateIndex: state.currentGateIndex,
      completedGateCount: state.completedGateCount,
      runActive:
        this.playMode() === 'course' &&
        (state.status === 'countdown' ||
          state.status === 'running' ||
          state.status === 'finished'),
    });
  }

  private syncRendererPose(): void {
    this.renderer.applyFlightState({
      position: this.flight.position(),
      orientation: this.flight.orientation(),
    });
  }

  private sampleMergedInput() {
    const calibrated = this.calibration.calibratedInput();
    const keyboard = this.keyboard.sample();
    return mergeFlightInputs(calibrated, keyboard);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const code = event.code;
    if (
      code === 'Space' ||
      code === 'KeyR' ||
      code === 'KeyC' ||
      code === 'KeyT' ||
      code === 'KeyP' ||
      code === 'KeyF' ||
      code === 'Escape' ||
      code.startsWith('Arrow')
    ) {
      event.preventDefault();
    }

    // Replay shortcuts take priority while replay is active.
    if (this.isReplayMode()) {
      this.handleReplayKey(code, event);
      return;
    }

    if (code === 'Escape') {
      if (!event.repeat) {
        // Fullscreen exit (browser Escape) takes priority over Settings.
        if (!shouldHandleEscapeAsSettings(this.session.isFullscreen())) {
          return;
        }
        if (this.rateMenuOpen()) {
          this.rateMenuOpen.set(false);
        } else {
          this.onToggleSettings();
        }
      }
      return;
    }

    if (shouldToggleFullscreenShortcut(event)) {
      this.onToggleFullscreen();
      return;
    }

    if (code === 'KeyP' && !event.repeat) {
      this.onTogglePause();
      return;
    }

    if (this.settingsOpen() && code !== 'Space') {
      // Allow arm via Space even with settings open; block flight keys otherwise.
      if (
        code === 'KeyR' ||
        code === 'KeyC' ||
        code === 'KeyT' ||
        code.startsWith('Arrow') ||
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD'
      ) {
        return;
      }
    }

    if (code === 'Space') {
      if (!event.repeat) {
        this.onArmToggle();
      }
      return;
    }
    if (code === 'KeyR' && !event.repeat) {
      this.onResetDrone();
      return;
    }
    if (code === 'KeyC' && !event.repeat) {
      this.onSwitchCamera();
      return;
    }
    if (code === 'KeyB' && !event.repeat && this.diagnosticsVisible) {
      this.showFrameDebug.update((v) => !v);
      return;
    }
    if (
      code === 'KeyZ' &&
      !event.repeat &&
      this.diagnosticsVisible &&
      this.showFrameDebug()
    ) {
      this.flight.zeroLinearVelocity();
      return;
    }
    if (code === 'KeyT' && !event.repeat) {
      if (this.playMode() === 'course' && !this.runBusy()) {
        this.onStartRun();
      }
      return;
    }

    if (this.paused()) {
      return;
    }

    this.keyboard.onKeyDown(code);
  };

  private handleReplayKey(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') {
      if (!event.repeat) {
        if (!shouldHandleEscapeAsSettings(this.session.isFullscreen())) {
          return;
        }
        this.onExitReplay();
      }
      return;
    }
    if (shouldToggleFullscreenShortcut(event)) {
      this.onToggleFullscreen();
      return;
    }
    if (code === 'Space' && !event.repeat) {
      this.replayPlayback.togglePlayPause();
      return;
    }
    if (code === 'KeyR' && !event.repeat) {
      this.replayPlayback.restart();
      this.applyReplaySample();
      return;
    }
    if (code === 'KeyC' && !event.repeat) {
      this.onSwitchCamera();
      return;
    }
    if (code === 'ArrowLeft') {
      this.replayPlayback.seekBy(-5000);
      this.applyReplaySample();
      return;
    }
    if (code === 'ArrowRight') {
      this.replayPlayback.seekBy(5000);
      this.applyReplaySample();
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keyboard.onKeyUp(event.code);
  };

  private async maybeAutoFullscreen(): Promise<void> {
    if (!this.autoFullscreenOnFlight() || this.session.isFullscreen()) {
      return;
    }
    await this.session.enter(this.stageHost().nativeElement);
  }

  private async bootstrapPhysicsSession(): Promise<void> {
    const env = this.renderer.environment;
    if (!env) {
      this.flight.setLegacyGroundEnabled(true);
      this.physicsWarning.set(null);
      return;
    }

    const competitive =
      this.playMode() === 'course' && this.activeRankedSession !== null;
    const allowDynamic = this.playMode() === 'free' || this.playMode() === 'training';

    try {
      const scene = this.renderer.getScene();
      if (scene) {
        this.impactParticles.setScene(scene, env.quality);
      }
    } catch {
      /* particles optional */
    }

    const ok = await this.physicsSession.startSession({
      environment: env,
      course: this.courseRun.course(),
      competitive,
      allowDynamicProps: allowDynamic && !competitive,
      quality: env.quality,
      collisionProfile: this.aircraftRuntime.runtime()?.definition.collisionProfile,
      aircraftColliderVersion:
        this.aircraftRuntime.runtime()?.definition.colliderVersion,
    });

    if (ok) {
      // Keep legacy y≈0 ground — Rapier owns structures/props only.
      this.flight.setLegacyGroundEnabled(true);
      this.physicsWarning.set(null);
      this.physicsSession.resetDynamicProps();
    } else {
      this.flight.setLegacyGroundEnabled(true);
      this.physicsWarning.set(
        this.physicsSession.initWarning() ??
          'Using legacy ground collision (advanced physics unavailable).',
      );
    }
  }

  private crashReasonToLabel(reason: CrashReason | null | undefined): string | null {
    if (!reason) {
      return null;
    }
    switch (reason) {
      case 'terrain':
        return 'Terrain impact';
      case 'structure':
        return 'Structure collision';
      case 'propStrike':
        return 'Prop strike';
      case 'water':
        return 'Water impact';
      case 'outOfBounds':
        return 'Out of bounds';
      case 'hardLanding':
        return 'Hard landing';
      default:
        return 'Crash';
    }
  }

  /** Configure the single flight/physics/audio/visual stack for the selected aircraft. */
  private applySelectedAircraft(): void {
    const { definition, applied, warnings } = this.aircraftRuntime.prepareForFlight(
      this.selectedAircraft.selectedAircraftId(),
    );
    this.flight.applyAircraftConfig(applied);
    this.droneAudio.applyAudioProfile(definition.audioProfile);
    this.renderer.applyAircraft(definition, {
      liveryId: this.selectedAircraft.preferredLiveryId(),
      appliedConfig: applied,
    });

    const sourceType = this.missionAircraftCapabilitiesAdapter.resolveSourceType(definition);
    this.activeAircraftSourceType = sourceType;
    this.activeDefinitionVersion = definition.definitionVersion ?? null;
    this.activePhysicsProfileVersion = definition.physicsProfileVersion ?? null;

    const rig = this.flightCameraSnapshotAdapter.resolveAndActivate({
      aircraft: definition,
      appliedFpvCameraTiltRad: applied.fpvCameraTilt,
      templateDerivedCamera: sourceType === 'user-compiled',
    });
    this.renderer.setResolvedFlightCameraRig(rig);

    // New flight mount always begins a fresh runtime session (tick 0).
    this.flightSimClock.beginSession();

    if (warnings.length) {
      console.warn('[aircraft]', warnings.join(' | '));
    }
  }

  /**
   * Authoritative completed fixed-step seam.
   * Invoked once after collision correction; increments tick then notifies observers.
   */
  private publishAuthoritativeFixedStep(
    fixedDt: number,
    collisionOutcome: AuthoritativeCollisionOutcomeSummary,
  ): void {
    if (!this.flightSimClock.isStarted()) {
      this.flightSimClock.beginSession(fixedDt);
    }
    const tick = this.authoritativeStepPublisher.completeFixedStep();
    const definitionId = this.flight.getAppliedAircraftId();

    const adapted = this.missionAircraftSnapshotAdapter.adapt({
      simulationTick: tick,
      fixedStepSeconds: fixedDt,
      sessionGeneration: this.flightSimClock.sessionGeneration(),
      position: this.flight.position(),
      orientation: this.flight.orientation(),
      linearVelocity: this.flight.velocity(),
      bodyAngularVelocity: this.flight.angularVelocity(),
      armed: this.flight.armed(),
      crashed: this.flight.crashed(),
      altitudeMeters: this.flight.altitude(),
      speedMps: this.flight.speed(),
      aircraftId: definitionId,
      aircraftSourceType: this.activeAircraftSourceType,
      definitionVersion: this.activeDefinitionVersion,
      physicsProfileVersion: this.activePhysicsProfileVersion,
      collisionOutcome,
    });

    if (!adapted.ok) {
      console.error('[AuthoritativeFlightStep]', adapted.reason);
      return;
    }
    this.authoritativeStepPublisher.publish(adapted.snapshot);
  }

  private teardown(): void {
    this.guidance.stop();
    void this.missionRuntimeCoordinator.exitAndTeardown();
    this.missionSessionFacade.reset();
    this.authoritativeStepPublisher.clearObservers();
    this.flightCameraSnapshotAdapter.clearActiveRig();
    this.physicsIntegrity.clearLock();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.reducedMotionQuery?.removeEventListener(
      'change',
      this.onReducedMotionChange,
    );
    this.session.setResizeHandler(null);
    void this.physicsSession.endSession();
    this.flight.setLegacyGroundEnabled(true);
    this.impactParticles.dispose();
    if (this.celebrateTimer !== null) {
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = null;
    }
    if (this.gateFlashTimer !== null) {
      clearTimeout(this.gateFlashTimer);
      this.gateFlashTimer = null;
    }
    if (this.bestFlashTimer !== null) {
      clearTimeout(this.bestFlashTimer);
      this.bestFlashTimer = null;
    }
    if (this.recordingActive) {
      this.replayRecorder.cancelRecording();
      this.recordingActive = false;
    }
    this.exitReplayInternal();
    this.ghostRace.clear();
    this.academy.returnToIdle();
    this.keyboard.clear();
    this.environmentAudio.dispose();
    this.droneAudio.dispose();
    this.audioManager.dispose();
    this.cameraEffects.reset();
    if (this.session.isFullscreen()) {
      void this.session.exit();
    }
    if (this.mounted) {
      this.renderer.dispose();
      this.mounted = false;
    }
  }
}

function formatClockMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00.00';
  }
  const totalCs = Math.round(ms / 10);
  const mins = Math.floor(totalCs / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${mins}:${secs.toString().padStart(2, '0')}.${cs
    .toString()
    .padStart(2, '0')}`;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cpx = (a.x + b.x) / 2;
    const cpy = (a.y + b.y) / 2;
    d += ` Q ${a.x.toFixed(2)} ${a.y.toFixed(2)} ${cpx.toFixed(2)} ${cpy.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

function estimatePathLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return Math.max(len, 1);
}

function buildTerrainContours(
  width: number,
  height: number,
  ox: number,
  oy: number,
  usedW: number,
  usedH: number,
): MinimapContour[] {
  const cx = ox + usedW * 0.5;
  const cy = oy + usedH * 0.55;
  const rings = [
    { rx: usedW * 0.42, ry: usedH * 0.38, opacity: 0.16 },
    { rx: usedW * 0.58, ry: usedH * 0.52, opacity: 0.12 },
    { rx: usedW * 0.72, ry: usedH * 0.66, opacity: 0.08 },
  ];
  return rings.map((ring) => {
    const d = `M ${cx - ring.rx} ${cy} C ${cx - ring.rx} ${cy - ring.ry}, ${cx + ring.rx} ${cy - ring.ry}, ${cx + ring.rx} ${cy} C ${cx + ring.rx} ${cy + ring.ry}, ${cx - ring.rx} ${cy + ring.ry}, ${cx - ring.rx} ${cy}`;
    return { d, opacity: ring.opacity };
  });
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function vec3Or(value: unknown, fallback: Vec3): Vec3 {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }
  const o = value as Record<string, unknown>;
  return {
    x: numOr(o['x'], fallback.x),
    y: numOr(o['y'], fallback.y),
    z: numOr(o['z'], fallback.z),
  };
}

/** Build a renderer training-overlay spec from a module's evaluator config. */
function buildTrainingOverlaySpec(
  evaluatorType: TrainingModuleDefinition['evaluatorType'],
  cfg: Record<string, unknown>,
  opacity: number,
): TrainingOverlaySpec | null {
  if (evaluatorType === 'hover') {
    return {
      kind: 'hover',
      opacity,
      hover: {
        center: vec3Or(cfg['center'], { x: 0, y: 3, z: -12 }),
        radius: numOr(cfg['radius'], 1.2),
        height: numOr(cfg['targetHeight'], 3),
      },
    };
  }
  if (evaluatorType === 'landing') {
    return {
      kind: 'landing',
      opacity,
      landing: {
        center: vec3Or(cfg['padCenter'], { x: 8, y: 0, z: -20 }),
        radius: numOr(cfg['padRadius'], 1.5),
      },
    };
  }
  if (evaluatorType === 'figureEight') {
    return {
      kind: 'figureEight',
      opacity,
      figureEight: {
        center: vec3Or(cfg['center'], { x: 0, y: 2, z: -30 }),
        left: vec3Or(cfg['leftMarker'], { x: -8, y: 2, z: -30 }),
        right: vec3Or(cfg['rightMarker'], { x: 8, y: 2, z: -30 }),
        radius: numOr(cfg['checkpointRadius'], 3),
      },
    };
  }
  return null;
}

function readHudMode(): FlightHudMode {
  try {
    const raw = localStorage.getItem('fpv.hud.mode');
    if (raw === 'compact' || raw === 'minimal' || raw === 'full') {
      return raw;
    }
  } catch {
    // Ignore.
  }
  return 'full';
}
