import { Injectable, inject } from '@angular/core';
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

import type { Course, CourseGate } from '../../course/models/course.model';
import { DEFAULT_COURSE } from '../../course/config/default-course';
import { EnvironmentGeneratorService } from '../../environment/services/environment-generator.service';
import { GhostRendererService } from '../../ghost/services/ghost-renderer.service';
import type { GhostStyle } from '../../ghost/services/ghost-renderer.service';
import type { FlightReplay } from '../../replay/models/replay.model';
import type { InterpolatedReplaySample } from '../../replay/utils/replay-interpolation';
import type {
  EnvironmentDefinition,
  EnvironmentLoadStage,
  FogSettings,
  GeneratedEnvironment,
  LandmarkPlacement,
  PlacementInstance,
} from '../../environment/models/environment.model';
import type { CameraEffectsOutput } from '../../flight-feedback/models/camera-effects.model';
import { ParticlePool } from '../../flight-feedback/utils/particle-pool';
import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type {
  CameraMode,
  Quat,
  Vec3,
} from '../../flight/models/flight-state.model';
import type {
  EnvironmentQuality,
  ReplayCameraMode,
  TrainerEnvironmentSettings,
  TrainerVisualEffectsSettings,
} from '../../settings/models/trainer-settings.model';
import {
  DEFAULT_VISUAL_EFFECTS_SETTINGS,
} from '../../settings/models/trainer-settings.model';
import type { WeatherState } from '../../weather/models/weather.models';
import { WeatherRendererService } from '../../weather/services/weather-renderer.service';
import { createRealisticDroneModel } from '../../drone/visual/drone-model.factory';
import type { SharedDroneMaterials } from '../../drone/visual/drone-model.factory';
import { createAircraftVisual } from '../../aircraft/factories/aircraft-visual.factory';
import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import type { AppliedFlightConfig } from '../../aircraft/adapters/flight-profile.adapter';
import { PropellerAnimationService } from '../../drone/visual/propeller-animation.service';
import { DroneDamageVisualService } from '../../drone/visual/drone-damage-visual.service';
import type { DroneDamageState } from '../../physics/models/collision.models';
import { threeFlightCameraViewAdapter } from '../../camera/adapters/three-flight-camera-view.adapter';
import type { ResolvedFlightCameraRig } from '../../camera/models/resolved-flight-camera-rig';
import {
  LEGACY_FPV_BASE_FOV_DEGREES,
  LEGACY_FPV_FAR_METERS,
  LEGACY_FPV_MOUNT_POSITION,
  LEGACY_FPV_NEAR_METERS,
  DEFAULT_MISSION_CAPTURE_ASPECT,
  DEFAULT_PROJECTION_MODEL_VERSION,
  RESOLVED_FLIGHT_CAMERA_RIG_VERSION,
} from '../../camera/models/resolved-flight-camera-rig';

export interface RenderFlightState {
  position: Vec3;
  orientation: Quat;
}

/** Per-frame visual polish inputs (render-only). */
export interface RenderDroneVisualState {
  throttle: number;
  armed: boolean;
  crashed: boolean;
  altitude: number;
  speed: number;
  paused: boolean;
}

export interface RenderCameraEffectsState {
  effects: CameraEffectsOutput;
  baseFov: number;
  mode: CameraMode | ReplayCameraMode;
  replayMode: boolean;
  chaseStiffness: number;
  chaseDistanceScale: number;
}

export type GateVisualState = 'upcoming' | 'active' | 'completed';

export interface CourseRenderState {
  course: Course;
  currentGateIndex: number;
  completedGateCount: number;
  runActive: boolean;
}

export interface MountEnvironmentOptions {
  settings: TrainerEnvironmentSettings;
  onProgress?: (stage: EnvironmentLoadStage) => void;
  fallback?: boolean;
  definition?: EnvironmentDefinition;
}

interface GateHandle {
  group: Group;
  frameMat: MeshStandardMaterial;
  chevronMat: MeshStandardMaterial;
  label: Sprite | null;
  pulse: number;
  baseEmissive: number;
}

interface PropHandle {
  group: Group;
  blades: Mesh[];
  blur: Mesh;
  spinDir: number;
}

interface DroneLightHandle {
  mesh: Mesh;
  material: MeshStandardMaterial;
  kind: 'front' | 'rear';
}

interface FlagAnim {
  mesh: Object3D;
  phase: number;
  amp: number;
}

/**
 * Owns all Three.js objects and rendering.
 * Environment generation lives in EnvironmentGeneratorService.
 */
export interface TrainingOverlaySpec {
  kind: 'hover' | 'landing' | 'figureEight' | 'none';
  opacity?: number;
  hover?: {
    center: Vec3;
    radius: number;
    height: number;
  };
  landing?: {
    center: Vec3;
    radius: number;
  };
  figureEight?: {
    center: Vec3;
    left: Vec3;
    right: Vec3;
    radius: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ThreeRendererService {
  private readonly cfg: {
    fpvCameraTilt: number;
    chaseOffset: Vec3;
    chaseSmoothing: number;
    physicsStep: number;
    maxFrameDelta: number;
    maxPixelRatio: number;
  } = {
    fpvCameraTilt: FLIGHT_CONFIG.fpvCameraTilt,
    chaseOffset: { ...FLIGHT_CONFIG.chaseOffset },
    chaseSmoothing: FLIGHT_CONFIG.chaseSmoothing,
    physicsStep: FLIGHT_CONFIG.physicsStep,
    maxFrameDelta: FLIGHT_CONFIG.maxFrameDelta,
    maxPixelRatio: FLIGHT_CONFIG.maxPixelRatio,
  };
  private activeAircraft: AircraftDefinition | null = null;
  private activeLiveryId: string | null = null;
  private readonly environmentGenerator = inject(EnvironmentGeneratorService);
  private readonly ghostRenderer = inject(GhostRendererService);
  private readonly weatherRenderer = inject(WeatherRendererService);
  private trainingOverlayGroup: Group | null = null;
  private readonly trainingDisposables: Array<{ dispose: () => void }> = [];

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private drone: Group | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLElement | null = null;

  private rafId: number | null = null;
  private running = false;
  private lastFrameMs: number | null = null;
  private accumulator = 0;
  private cameraMode: CameraMode = 'fpv';
  private readonly chasePos = new Vector3(0, 3, 6);
  private readonly chaseLook = new Vector3();
  private readonly scratchForward = new Vector3();
  private readonly scratchUp = new Vector3(0, 1, 0);
  private readonly scratchRight = new Vector3(1, 0, 0);
  private readonly scratchTarget = new Vector3();
  private readonly scratchOffset = new Vector3();
  private readonly scratchObject = new Object3D();
  private readonly scratchQuat = new Quaternion();
  private readonly sunDirection = new Vector3();

  private onFixedStep: ((fixedDt: number) => void) | null = null;
  private onBeforeSteps: (() => void) | null = null;
  private onFrame: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private courseGroup: Group | null = null;
  private environmentGroup: Group | null = null;
  private gateHandles: GateHandle[] = [];
  private sharedFrameGeo: BoxGeometry | null = null;
  private sharedPostGeo: CylinderGeometry | null = null;
  private sharedChevronGeo: BoxGeometry | null = null;
  private lastVisualKey = '';

  private hemiLight: HemisphereLight | null = null;
  private sunLight: DirectionalLight | null = null;
  private ambientLight: AmbientLight | null = null;
  private sky: Sky | null = null;
  private generated: GeneratedEnvironment | null = null;
  private flagAnims: FlagAnim[] = [];
  private towerMarker: Mesh | null = null;
  private birds: Array<{ mesh: Mesh; phase: number; radius: number; speed: number; y: number }> =
    [];
  private animTime = 0;
  private windDirYaw = 0;
  private windVisualSpeed = 0;
  private weatherWindVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private oceanMesh: Mesh | null = null;

  // --- Polish: drone visuals / particles / trail / camera effects ---
  private readonly propAnim = inject(PropellerAnimationService);
  private readonly damageVisual = inject(DroneDamageVisualService);
  private props: PropHandle[] = [];
  private droneLights: DroneLightHandle[] = [];
  private droneMaterials: SharedDroneMaterials | null = null;
  private propRpm = 0;
  private damageState: DroneDamageState = 'pristine';
  private visualEffects: TrainerVisualEffectsSettings = {
    ...DEFAULT_VISUAL_EFFECTS_SETTINGS,
  };
  private quality: EnvironmentQuality = 'medium';
  private dustPool: ParticlePool | null = null;
  private sparkPool: ParticlePool | null = null;
  private dustEmitCooldown = 0;
  private crashFlash = 0;
  private gatePulseEnabled = true;

  private cameraEffects: CameraEffectsOutput | null = null;
  private baseFov = 75;
  /** Canonical FPV base-camera rig; cosmetics applied after this base. */
  private resolvedFpvRig: ResolvedFlightCameraRig = createDefaultLegacyResolvedRig(
    FLIGHT_CONFIG.fpvCameraTilt,
  );
  private replayCameraMode: ReplayCameraMode = 'fpv';
  private replayMode = false;
  private chaseStiffness = 6 as number;
  private chaseDistanceScale = 1;
  private orbitYaw = 0.6;
  private orbitPitch = 0.35;
  private orbitDistance = 8;
  private orbitDragging = false;
  private orbitLastX = 0;
  private orbitLastY = 0;

  private trailLine: Line | null = null;
  private trailPositions: Float32Array | null = null;
  private trailPointCount = 0;
  private trailProgress = 1;
  private canvasPointerDown: ((e: PointerEvent) => void) | null = null;
  private canvasPointerMove: ((e: PointerEvent) => void) | null = null;
  private canvasPointerUp: ((e: PointerEvent) => void) | null = null;
  private canvasWheel: ((e: WheelEvent) => void) | null = null;

  get activeCameraMode(): CameraMode {
    return this.cameraMode;
  }

  get environment(): GeneratedEnvironment | null {
    return this.generated;
  }

  /** Expose scene for impact particle attachment (render-only consumers). */
  getScene(): Scene | null {
    return this.scene;
  }

  mount(
    host: HTMLElement,
    options: {
      onFixedStep: (fixedDt: number) => void;
      onBeforeSteps?: () => void;
      onFrame?: () => void;
      cameraMode?: CameraMode;
      course?: Course;
      environment?: MountEnvironmentOptions;
    },
  ): void {
    this.dispose();

    this.host = host;
    this.onFixedStep = options.onFixedStep;
    this.onBeforeSteps = options.onBeforeSteps ?? null;
    this.onFrame = options.onFrame ?? null;
    this.cameraMode = options.cameraMode ?? 'fpv';

    const course = options.course ?? DEFAULT_COURSE;
    const envOptions = options.environment;
    const progress = envOptions?.onProgress;

    progress?.('terrain');
    const generated = this.environmentGenerator.generate({
      course,
      settings:
        envOptions?.settings ?? {
          selectedEnvironmentId: 'alpine-training-valley',
          quality: 'medium',
          timeOfDay: 'midday',
          vegetation: true,
          shadows: true,
          fog: true,
        },
      definition: envOptions?.definition,
      fallback: envOptions?.fallback === true,
    });
    this.generated = generated;

    progress?.('vegetation');

    const canvas = document.createElement('canvas');
    canvas.className = 'flight-canvas';
    canvas.setAttribute('aria-label', 'FPV flight viewport');
    host.appendChild(canvas);
    this.canvas = canvas;

    const renderer = new WebGLRenderer({
      canvas,
      antialias: generated.quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMappingExposure = generated.sun.exposure;
    renderer.shadowMap.enabled = generated.shadowsEnabled;
    renderer.setClearColor(new Color(generated.fog.color), 1);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.cfg.maxPixelRatio),
    );
    this.renderer = renderer;

    const scene = new Scene();
    scene.background = new Color(generated.fog.color);
    this.scene = scene;

    const camera = new PerspectiveCamera(75, 1, 0.05, 900);
    camera.position.set(0, 1.2, 0.15);
    this.camera = camera;
    this.baseFov = 75;

    this.weatherRenderer.attach(scene, camera);

    progress?.('lighting');
    this.buildSkyAndLights(scene, generated);
    this.applyFog(scene, generated);

    progress?.('course');
    this.environmentGroup = new Group();
    scene.add(this.environmentGroup);
    this.buildTerrain(this.environmentGroup, generated);
    if (generated.vegetationEnabled) {
      this.buildVegetation(this.environmentGroup, generated);
    }
    this.buildProps(this.environmentGroup, generated);
    if (generated.industrial) {
      this.buildIndustrialScenery(this.environmentGroup, generated);
    }
    if (generated.coastal) {
      this.buildCoastalScenery(this.environmentGroup, generated);
    }
    this.buildCourse(scene, course, generated);
    this.drone = this.buildDrone(generated.shadowsEnabled);
    scene.add(this.drone);
    this.buildBirds(this.environmentGroup, generated);
    this.initParticlePools(scene, generated.quality);
    this.bindOrbitControls(canvas);
    this.ghostRenderer.attach(scene);

    progress?.('ready');

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);

    this.running = true;
    this.lastFrameMs = null;
    this.accumulator = 0;
    this.animTime = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Rebuild environment while keeping the same RAF host callbacks. */
  rebuildEnvironment(
    course: Course,
    settings: TrainerEnvironmentSettings,
    options?: {
      fallback?: boolean;
      onProgress?: (stage: EnvironmentLoadStage) => void;
      definition?: EnvironmentDefinition;
    },
  ): void {
    if (!this.host || !this.onFixedStep) {
      return;
    }
    const host = this.host;
    const onFixedStep = this.onFixedStep;
    const onBeforeSteps = this.onBeforeSteps ?? undefined;
    const onFrame = this.onFrame ?? undefined;
    const cameraMode = this.cameraMode;
    this.mount(host, {
      onFixedStep,
      onBeforeSteps,
      onFrame,
      cameraMode,
      course,
      environment: {
        settings,
        fallback: options?.fallback,
        onProgress: options?.onProgress,
        definition: options?.definition,
      },
    });
  }

  /** Lightweight fog toggle without full rebuild. */
  setFogEnabled(enabled: boolean): void {
    if (!this.scene || !this.generated) {
      return;
    }
    this.generated = {
      ...this.generated,
      fog: { ...this.generated.fog, enabled },
    };
    this.applyFog(this.scene, this.generated);
  }

  /** Bias flag cloth toward prevailing wind (visual only). */
  setWindVisual(directionYaw: number, speed: number): void {
    this.windDirYaw = directionYaw;
    this.windVisualSpeed = Math.max(0, speed);
  }

  /** Forward weather visuals to WeatherRendererService. */
  applyWeatherVisuals(
    state: WeatherState,
    options: {
      quality: EnvironmentQuality;
      fogEnabled: boolean;
      precipitationEnabled: boolean;
      reduceMotion: boolean;
      baseFog: FogSettings;
      environmentId: string;
    },
  ): void {
    const wind = state.wind;
    if (wind.enabled && wind.baseSpeed > 0) {
      this.weatherWindVelocity = {
        x: wind.baseDirection.x * wind.baseSpeed,
        y: 0,
        z: wind.baseDirection.z * wind.baseSpeed,
      };
      this.setWindVisual(
        Math.atan2(wind.baseDirection.x, wind.baseDirection.z),
        wind.baseSpeed,
      );
    } else {
      this.weatherWindVelocity = { x: 0, y: 0, z: 0 };
      this.setWindVisual(this.windDirYaw, 0);
    }
    this.weatherRenderer.applyWeatherState(state, options);
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  toggleCameraMode(): CameraMode {
    this.cameraMode = this.cameraMode === 'fpv' ? 'chase' : 'fpv';
    return this.cameraMode;
  }

  applyFlightState(state: RenderFlightState): void {
    if (!this.drone) {
      return;
    }
    this.drone.position.set(state.position.x, state.position.y, state.position.z);
    this.drone.quaternion.set(
      state.orientation.x,
      state.orientation.y,
      state.orientation.z,
      state.orientation.w,
    );
  }

  /**
   * Read-back of model + camera frame for HUD diagnostics.
   * Does not allocate logs — caller may throttle UI updates.
   */
  getFrameDiagnostics(): {
    modelQuaternion: { x: number; y: number; z: number; w: number };
    modelForward: { x: number; y: number; z: number };
    cameraForward: { x: number; y: number; z: number };
    cameraUp: { x: number; y: number; z: number };
    rapierProxyActive: boolean;
  } | null {
    if (!this.drone || !this.camera) {
      return null;
    }
    this.scratchForward.set(0, 0, -1).applyQuaternion(this.drone.quaternion);
    this.camera.getWorldDirection(this.scratchTarget);
    return {
      modelQuaternion: {
        x: this.drone.quaternion.x,
        y: this.drone.quaternion.y,
        z: this.drone.quaternion.z,
        w: this.drone.quaternion.w,
      },
      modelForward: {
        x: this.scratchForward.x,
        y: this.scratchForward.y,
        z: this.scratchForward.z,
      },
      cameraForward: {
        x: this.scratchTarget.x,
        y: this.scratchTarget.y,
        z: this.scratchTarget.z,
      },
      cameraUp: {
        x: this.camera.up.x,
        y: this.camera.up.y,
        z: this.camera.up.z,
      },
      rapierProxyActive: false,
    };
  }

  setVisualEffectsSettings(
    settings: TrainerVisualEffectsSettings,
    quality: EnvironmentQuality,
  ): void {
    this.visualEffects = { ...settings };
    this.quality = quality;
    this.gatePulseEnabled = settings.gatePulseEnabled;
  }

  setCameraEffectsState(state: RenderCameraEffectsState | null): void {
    if (!state) {
      this.cameraEffects = null;
      this.replayMode = false;
      if (this.camera) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    this.cameraEffects = state.effects;
    // Cosmetic dynamic FOV uses baseFov from the active resolved rig when present.
    this.baseFov = this.resolvedFpvRig.baseVerticalFovDegrees;
    if (Math.abs(state.baseFov - this.baseFov) > 1e-6) {
      // Presentation path may still pass the historical 75; prefer resolved rig.
      this.baseFov = this.resolvedFpvRig.baseVerticalFovDegrees;
    }
    this.replayMode = state.replayMode;
    this.chaseStiffness = state.chaseStiffness;
    this.chaseDistanceScale = state.chaseDistanceScale;
    if (state.replayMode) {
      this.replayCameraMode = state.mode as ReplayCameraMode;
    }
  }

  /**
   * Install the session's canonical ResolvedFlightCameraRig.
   * FPV rendering consumes this for base mount/tilt/FOV; cosmetics remain frame-only.
   */
  setResolvedFlightCameraRig(rig: ResolvedFlightCameraRig): void {
    this.resolvedFpvRig = rig;
    this.baseFov = rig.baseVerticalFovDegrees;
    this.cfg.fpvCameraTilt = rig.localCameraTiltRad;
    if (this.camera) {
      this.camera.near = rig.nearMeters;
      this.camera.far = rig.farMeters;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  getResolvedFlightCameraRig(): ResolvedFlightCameraRig {
    return this.resolvedFpvRig;
  }

  setReplayCameraMode(mode: ReplayCameraMode): void {
    this.replayCameraMode = mode;
    this.replayMode = true;
    this.lastVisualKey = '';
  }

  clearReplayMode(): void {
    this.replayMode = false;
    this.replayCameraMode = 'fpv';
  }

  /** Update propeller / lights / particles (call from onFrame). */
  updateDroneVisuals(state: RenderDroneVisualState, dt: number): void {
    this.updatePropellers(state, dt);
    this.updateNavLights(state, dt);
    this.updateGroundDust(state, dt);
    this.sparkPool?.update(dt);
    this.dustPool?.update(dt);
    this.updateGatePulses(dt);
  }

  pulseGate(gateIndex: number): void {
    if (!this.gatePulseEnabled) {
      return;
    }
    const handle = this.gateHandles[gateIndex];
    if (handle) {
      handle.pulse = 1;
    }
    // Subtle nearby flag nudge
    for (const flag of this.flagAnims) {
      flag.amp = Math.min(0.35, flag.amp + 0.08);
    }
  }

  emitCrashBurst(intensity: number): void {
    if (!this.visualEffects.crashParticlesEnabled || this.quality === 'low') {
      return;
    }
    if (!this.drone || !this.sparkPool) {
      return;
    }
    const count = Math.min(28, Math.max(6, Math.round(intensity * 22)));
    this.sparkPool.emit(
      {
        x: this.drone.position.x,
        y: this.drone.position.y,
        z: this.drone.position.z,
      },
      count,
      2.2 + intensity * 2.5,
      0.45 + intensity * 0.25,
      0.8,
    );
    this.crashFlash = Math.min(1, 0.35 + intensity * 0.5);
  }

  setFlightTrail(
    points: Array<{ x: number; y: number; z: number }>,
    enabled: boolean,
  ): void {
    this.clearFlightTrail();
    if (!enabled || !this.scene || points.length < 2) {
      return;
    }
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }
    this.trailPositions = positions;
    this.trailPointCount = points.length;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setDrawRange(0, points.length);
    const mat = new LineBasicMaterial({
      color: 0x5ec8ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.disposables.push(geo, mat);
    this.trailLine = new Line(geo, mat);
    this.trailLine.frustumCulled = false;
    this.scene.add(this.trailLine);
    this.trailProgress = 1;
  }

  setFlightTrailProgress(progress01: number): void {
    if (!this.trailLine || this.trailPointCount < 2) {
      return;
    }
    this.trailProgress = Math.min(1, Math.max(0, progress01));
    const count = Math.max(
      2,
      Math.floor(this.trailPointCount * this.trailProgress),
    );
    this.trailLine.geometry.setDrawRange(0, count);
  }

  /** Visual-only ghost drone (no physics / shadows). */
  setGhostVisible(visible: boolean): void {
    this.ghostRenderer.setVisible(visible);
  }

  upsertGhost(id: string, style: GhostStyle = 'personal_best'): void {
    this.ghostRenderer.upsertGhost(id, style);
  }

  setGhostVisibleById(id: string, visible: boolean): void {
    this.ghostRenderer.setGhostVisible(id, visible);
  }

  setMaxVisibleGhosts(max: number): void {
    this.ghostRenderer.setMaxVisible(max);
  }

  setGhostOpacity(opacity: number): void {
    this.ghostRenderer.setOpacity(opacity);
  }

  updateGhostSample(
    sample: InterpolatedReplaySample | null,
    dt: number,
  ): void {
    this.ghostRenderer.applySample(sample, dt);
  }

  updateGhostSampleById(id: string, sample: InterpolatedReplaySample | null, dt: number): void {
    this.ghostRenderer.updateGhostSample(id, sample, dt);
  }

  setGhostTrail(replay: FlightReplay | null, enabled: boolean): void {
    this.ghostRenderer.setTrailFromReplay(replay, enabled);
  }

  clearGhostTrail(): void {
    this.ghostRenderer.clearTrail();
  }

  clearGhost(id: string): void {
    this.ghostRenderer.clearGhost(id);
  }

  clearAllGhosts(): void {
    this.ghostRenderer.clearAll();
  }

  clearTrainingOverlays(): void {
    if (this.trainingOverlayGroup && this.scene) {
      this.scene.remove(this.trainingOverlayGroup);
    }
    this.trainingOverlayGroup = null;
    for (const item of this.trainingDisposables) {
      try {
        item.dispose();
      } catch {
        // ignore
      }
    }
    this.trainingDisposables.length = 0;
  }

  setTrainingOverlays(spec: TrainingOverlaySpec): void {
    this.clearTrainingOverlays();
    if (!this.scene || spec.kind === 'none') {
      return;
    }
    const opacity = Math.min(0.7, Math.max(0.1, spec.opacity ?? 0.35));
    const group = new Group();
    group.name = 'training-overlays';

    if (spec.kind === 'hover' && spec.hover) {
      const { center, radius, height } = spec.hover;
      const geo = new CylinderGeometry(radius, radius, height, 24, 1, true);
      const mat = new MeshStandardMaterial({
        color: 0x5ec8ff,
        emissive: new Color(0x2ec4b6),
        emissiveIntensity: 0.25,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(center.x, center.y, center.z);
      mesh.castShadow = false;
      group.add(mesh);
      const markerGeo = new SphereGeometry(0.15, 12, 12);
      const markerMat = new MeshStandardMaterial({
        color: 0xffffff,
        emissive: new Color(0x5ec8ff),
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: Math.min(0.9, opacity + 0.3),
        depthWrite: false,
      });
      const marker = new Mesh(markerGeo, markerMat);
      marker.position.set(center.x, center.y, center.z);
      group.add(marker);
      this.trainingDisposables.push(geo, mat, markerGeo, markerMat);
    }

    if (spec.kind === 'landing' && spec.landing) {
      const { center, radius } = spec.landing;
      const padGeo = new CylinderGeometry(radius, radius, 0.05, 32);
      const padMat = new MeshStandardMaterial({
        color: 0xf0c14a,
        emissive: new Color(0xf0c14a),
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: Math.min(0.85, opacity + 0.25),
        depthWrite: false,
      });
      const pad = new Mesh(padGeo, padMat);
      pad.position.set(center.x, 0.03, center.z);
      group.add(pad);
      const guideGeo = new CylinderGeometry(0.04, 0.04, 4, 8);
      const guideMat = new MeshStandardMaterial({
        color: 0x5ec8ff,
        emissive: new Color(0x5ec8ff),
        emissiveIntensity: 0.35,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const guide = new Mesh(guideGeo, guideMat);
      guide.position.set(center.x, 2, center.z);
      group.add(guide);
      this.trainingDisposables.push(padGeo, padMat, guideGeo, guideMat);
    }

    if (spec.kind === 'figureEight' && spec.figureEight) {
      const { center, left, right, radius } = spec.figureEight;
      const mkZone = (pos: Vec3, color: number): void => {
        const geo = new CylinderGeometry(radius, radius, 0.08, 24);
        const mat = new MeshStandardMaterial({
          color,
          emissive: new Color(color),
          emissiveIntensity: 0.3,
          transparent: true,
          opacity,
          depthWrite: false,
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(pos.x, 0.05, pos.z);
        group.add(mesh);
        this.trainingDisposables.push(geo, mat);
      };
      mkZone(center, 0xffffff);
      mkZone(left, 0x5ec8ff);
      mkZone(right, 0xf0c14a);
    }

    this.scene.add(group);
    this.trainingOverlayGroup = group;
  }

  clearFlightTrail(): void {
    if (this.trailLine) {
      this.trailLine.parent?.remove(this.trailLine);
      this.trailLine = null;
    }
    this.trailPositions = null;
    this.trailPointCount = 0;
  }

  applyCourseVisualState(state: CourseRenderState): void {
    const key = `${state.currentGateIndex}:${state.completedGateCount}:${state.runActive}`;
    if (key === this.lastVisualKey) {
      return;
    }
    this.lastVisualKey = key;

    for (const handle of this.gateHandles) {
      const gate = handle.group.userData['gate'] as CourseGate;
      const visual = resolveGateVisual(
        gate.index,
        state.currentGateIndex,
        state.completedGateCount,
        state.runActive,
      );
      applyGateMaterials(handle, visual);
      handle.baseEmissive = handle.frameMat.emissiveIntensity;
    }
  }

  dispose(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unbindOrbitControls();
    this.clearFlightTrail();
    this.clearTrainingOverlays();
    this.ghostRenderer.dispose();
    this.weatherRenderer.detach();
    this.weatherRenderer.dispose();
    this.dustPool?.dispose();
    this.sparkPool?.dispose();
    this.dustPool = null;
    this.sparkPool = null;
    this.props = [];
    this.droneLights = [];
    this.propRpm = 0;
    this.cameraEffects = null;
    this.replayMode = false;

    if (this.renderer) {
      this.renderer.dispose();
      try {
        this.renderer.forceContextLoss();
      } catch {
        // Some test / headless environments reject context loss.
      }
      this.renderer = null;
    }

    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;
    this.gateHandles = [];
    this.courseGroup = null;
    this.environmentGroup = null;
    this.sharedFrameGeo = null;
    this.sharedPostGeo = null;
    this.sharedChevronGeo = null;
    this.lastVisualKey = '';
    this.hemiLight = null;
    this.sunLight = null;
    this.ambientLight = null;
    this.sky = null;
    this.generated = null;
    this.flagAnims = [];
    this.towerMarker = null;
    this.oceanMesh = null;
    this.birds = [];
    this.windDirYaw = 0;
    this.windVisualSpeed = 0;
    this.weatherWindVelocity = { x: 0, y: 0, z: 0 };

    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }

    this.canvas = null;
    this.host = null;
    this.scene = null;
    this.camera = null;
    this.drone = null;
    this.onFixedStep = null;
    this.onBeforeSteps = null;
    this.onFrame = null;
    this.lastFrameMs = null;
    this.accumulator = 0;
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.running) {
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);

    if (typeof document !== 'undefined' && document.hidden) {
      this.lastFrameMs = nowMs;
      this.accumulator = 0;
      return;
    }

    if (this.lastFrameMs === null) {
      this.lastFrameMs = nowMs;
    }

    let frameDelta = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    frameDelta = Math.min(frameDelta, this.cfg.maxFrameDelta);
    this.accumulator += frameDelta;
    this.animTime += frameDelta;

    this.onBeforeSteps?.();

    const step = this.cfg.physicsStep;
    while (this.accumulator >= step) {
      this.onFixedStep?.(step);
      this.accumulator -= step;
    }

    this.updateEnvironmentAnims(frameDelta);
    if (this.camera) {
      this.weatherRenderer.update(
        frameDelta,
        {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        this.weatherWindVelocity,
      );
    }
    this.updateCamera(frameDelta);
    this.onFrame?.();

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateEnvironmentAnims(dt: number): void {
    const t = this.animTime;
    const windBias = Math.min(0.55, this.windVisualSpeed * 0.045);
    for (const flag of this.flagAnims) {
      const sway = Math.sin(t * 1.6 + flag.phase) * flag.amp;
      flag.mesh.rotation.y =
        flag.mesh.userData['baseYaw'] + sway + this.windDirYaw * windBias;
    }
    if (this.towerMarker) {
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4.2));
      const mat = this.towerMarker.material as MeshStandardMaterial;
      mat.emissiveIntensity = pulse;
    }
    for (const bird of this.birds) {
      bird.phase += dt * bird.speed;
      bird.mesh.position.set(
        Math.cos(bird.phase) * bird.radius,
        bird.y + Math.sin(bird.phase * 2.1) * 1.5,
        Math.sin(bird.phase) * bird.radius - 40,
      );
    }
  }

  /** Recalculate canvas size from the host element (e.g. after fullscreen). */
  requestResize(): void {
    this.resize();
  }

  private resize(): void {
    if (!this.host || !this.renderer || !this.camera) {
      return;
    }

    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.cfg.maxPixelRatio),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(frameDelta: number): void {
    if (!this.camera || !this.drone) {
      return;
    }

    const drone = this.drone;
    const fx = this.cameraEffects;
    const mode = this.replayMode
      ? this.replayCameraMode
      : this.cameraMode;

    // FOV
    const fovExtra = fx?.fovOffsetDegrees ?? 0;
    const nextFov = this.baseFov + fovExtra;
    if (Math.abs(this.camera.fov - nextFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    if (mode === 'orbit') {
      this.updateOrbitCamera();
      return;
    }

    if (mode === 'fpv') {
      const aircraftPosition = {
        x: drone.position.x,
        y: drone.position.y,
        z: drone.position.z,
      };
      const aircraftOrientation = {
        x: drone.quaternion.x,
        y: drone.quaternion.y,
        z: drone.quaternion.z,
        w: drone.quaternion.w,
      };
      const cosmetics = fx
        ? {
            positionOffset: fx.positionOffset,
            lookLagPitch: fx.lookLagPitch,
            lookLagYaw: fx.lookLagYaw,
            lookLagRoll: fx.lookLagRoll,
            fovOffsetDegrees: fx.fovOffsetDegrees,
          }
        : null;
      const applied = threeFlightCameraViewAdapter.applyFpvBaseThenCosmetics(
        this.camera,
        {
          aircraftPosition,
          aircraftOrientation,
          rig: this.resolvedFpvRig,
          cosmetics,
        },
        {
          offset: this.scratchOffset,
          forward: this.scratchForward,
          up: this.scratchUp,
          right: this.scratchRight,
          target: this.scratchTarget,
        },
      );
      this.baseFov = applied.baseFovDegrees;
      return;
    }

    // Chase (live or replay)
    const dist = this.chaseDistanceScale;
    this.scratchOffset
      .set(
        this.cfg.chaseOffset.x * dist,
        this.cfg.chaseOffset.y * dist,
        this.cfg.chaseOffset.z * dist,
      )
      .applyQuaternion(drone.quaternion);
    this.scratchTarget.copy(drone.position).add(this.scratchOffset);

    const stiffness = this.chaseStiffness > 0 ? this.chaseStiffness : this.cfg.chaseSmoothing;
    const alpha = 1 - Math.exp(-stiffness * frameDelta);
    this.chasePos.lerp(this.scratchTarget, alpha);
    this.camera.position.copy(this.chasePos);

    this.chaseLook.copy(drone.position);
    // Look slightly along travel / forward for stable framing
    this.scratchForward.set(0, 0, -1).applyQuaternion(drone.quaternion);
    this.chaseLook.addScaledVector(this.scratchForward, 1.2);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.chaseLook);
  }

  private updateOrbitCamera(): void {
    if (!this.camera || !this.drone) {
      return;
    }
    const target = this.drone.position;
    const cp = Math.cos(this.orbitPitch);
    const sp = Math.sin(this.orbitPitch);
    const cy = Math.cos(this.orbitYaw);
    const sy = Math.sin(this.orbitYaw);
    this.camera.position.set(
      target.x + this.orbitDistance * cp * sy,
      target.y + this.orbitDistance * sp + 0.5,
      target.z + this.orbitDistance * cp * cy,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
  }

  private applyFog(scene: Scene, env: GeneratedEnvironment): void {
    if (env.fog.enabled) {
      scene.fog = new Fog(env.fog.color, env.fog.near, env.fog.far);
    } else {
      scene.fog = null;
    }
  }

  private buildSkyAndLights(scene: Scene, env: GeneratedEnvironment): void {
    const sky = new Sky();
    sky.scale.setScalar(4500);
    scene.add(sky);
    this.sky = sky;
    const skyMat = sky.material;
    this.disposables.push(skyMat);
    this.disposables.push(sky.geometry);

    const hemi = new HemisphereLight(
      env.sun.hemisphereSky,
      env.sun.hemisphereGround,
      env.sun.hemisphereIntensity,
    );
    scene.add(hemi);
    this.hemiLight = hemi;

    const sun = new DirectionalLight(env.sun.color, env.sun.intensity);
    sun.castShadow = env.shadowsEnabled;
    if (env.shadowsEnabled) {
      sun.shadow.mapSize.set(env.shadowMapSize, env.shadowMapSize);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 220;
      sun.shadow.camera.left = -90;
      sun.shadow.camera.right = 90;
      sun.shadow.camera.top = 90;
      sun.shadow.camera.bottom = -90;
      sun.shadow.bias = -0.00025;
    }
    scene.add(sun);
    this.sunLight = sun;

    const ambient = new AmbientLight(0xffffff, env.sun.ambientIntensity);
    scene.add(ambient);
    this.ambientLight = ambient;

    this.applySunDirection(env);
  }

  private applySunDirection(env: GeneratedEnvironment): void {
    const phi = ((90 - env.sun.elevationDeg) * Math.PI) / 180;
    const theta = (env.sun.azimuthDeg * Math.PI) / 180;
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    if (this.sunLight) {
      this.sunLight.position.copy(this.sunDirection).multiplyScalar(120);
      this.sunLight.target.position.set(0, 0, -40);
      this.sunLight.target.updateMatrixWorld();
      if (this.scene && !this.sunLight.target.parent) {
        this.scene.add(this.sunLight.target);
      }
    }

    if (this.sky) {
      const uniforms = this.sky.material.uniforms;
      uniforms['turbidity'].value = env.sun.skyTurbidity;
      uniforms['rayleigh'].value = env.sun.skyRayleigh;
      uniforms['mieCoefficient'].value = env.sun.skyMieCoefficient;
      uniforms['mieDirectionalG'].value = env.sun.skyMieDirectionalG;
      uniforms['sunPosition'].value.copy(this.sunDirection);
    }

    if (this.renderer) {
      this.renderer.toneMappingExposure = env.sun.exposure;
    }
  }

  private buildTerrain(parent: Group, env: GeneratedEnvironment): void {
    const geo = new PlaneGeometry(
      env.worldSize,
      env.worldSize,
      env.segmentsX,
      env.segmentsZ,
    );
    const pos = geo.attributes['position'] as BufferAttribute;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const vertsX = env.segmentsX + 1;

    for (let i = 0; i < count; i++) {
      const ix = i % vertsX;
      const iy = Math.floor(i / vertsX);
      // PlaneGeometry Y becomes −Z after X rotation; flip rows to keep world Z aligned.
      const iz = env.segmentsZ - iy;
      const src = iz * vertsX + ix;
      const h = env.heights[src] ?? 0;
      pos.setZ(i, h);
      colors[i * 3] = env.colors[src * 3] ?? 0.35;
      colors[i * 3 + 1] = env.colors[src * 3 + 1] ?? 0.45;
      colors[i * 3 + 2] = env.colors[src * 3 + 2] ?? 0.3;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    this.disposables.push(geo);

    const mat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: false,
    });
    this.disposables.push(mat);

    const mesh = new Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = env.shadowsEnabled;
    mesh.castShadow = false;
    parent.add(mesh);
  }

  private buildVegetation(parent: Group, env: GeneratedEnvironment): void {
    this.addTreeInstances(parent, env.trees, env.shadowsEnabled);
    this.addBushInstances(parent, env.bushes);
    this.addGrassInstances(parent, env.grassPatches);
  }

  private addTreeInstances(
    parent: Group,
    trees: PlacementInstance[],
    shadows: boolean,
  ): void {
    if (trees.length === 0) {
      return;
    }
    const trunkGeo = new CylinderGeometry(0.12, 0.18, 1.2, 6);
    const canopyGeo = new ConeGeometry(0.85, 1.8, 7);
    const trunkMat = new MeshStandardMaterial({
      color: 0x4a3424,
      roughness: 0.9,
      metalness: 0.02,
    });
    const canopyMat = new MeshStandardMaterial({
      color: 0x2f4a32,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.disposables.push(trunkGeo, canopyGeo, trunkMat, canopyMat);

    const trunks = new InstancedMesh(trunkGeo, trunkMat, trees.length);
    const canopies = new InstancedMesh(canopyGeo, canopyMat, trees.length);
    trunks.castShadow = shadows;
    trunks.receiveShadow = false;
    canopies.castShadow = false;
    canopies.receiveShadow = false;
    trunks.frustumCulled = true;
    canopies.frustumCulled = true;

    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]!;
      const h = 1.2 * t.scale;
      this.scratchObject.position.set(t.x, t.y + h * 0.5, t.z);
      this.scratchObject.rotation.set(0, t.rotationY, 0);
      this.scratchObject.scale.set(t.scale, t.scale, t.scale);
      this.scratchObject.updateMatrix();
      trunks.setMatrixAt(i, this.scratchObject.matrix);

      this.scratchObject.position.set(t.x, t.y + h + 0.7 * t.scale, t.z);
      this.scratchObject.scale.set(t.scale, t.scale * (1 + t.variant * 0.08), t.scale);
      this.scratchObject.updateMatrix();
      canopies.setMatrixAt(i, this.scratchObject.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    parent.add(trunks);
    parent.add(canopies);
  }

  private addBushInstances(parent: Group, bushes: PlacementInstance[]): void {
    if (bushes.length === 0) {
      return;
    }
    const geo = new SphereGeometry(0.55, 6, 5);
    const mat = new MeshStandardMaterial({
      color: 0x3a5538,
      roughness: 0.95,
      metalness: 0.01,
    });
    this.disposables.push(geo, mat);
    const mesh = new InstancedMesh(geo, mat, bushes.length);
    mesh.castShadow = false;
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i]!;
      this.scratchObject.position.set(b.x, b.y + 0.35 * b.scale, b.z);
      this.scratchObject.rotation.set(0, b.rotationY, 0);
      this.scratchObject.scale.set(b.scale * 1.1, b.scale * 0.75, b.scale * 1.1);
      this.scratchObject.updateMatrix();
      mesh.setMatrixAt(i, this.scratchObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
  }

  private addGrassInstances(parent: Group, patches: PlacementInstance[]): void {
    if (patches.length === 0) {
      return;
    }
    const geo = new ConeGeometry(0.35, 0.55, 4);
    const mat = new MeshStandardMaterial({
      color: 0x4a6b3e,
      roughness: 1,
      metalness: 0,
    });
    this.disposables.push(geo, mat);
    const mesh = new InstancedMesh(geo, mat, patches.length);
    mesh.castShadow = false;
    for (let i = 0; i < patches.length; i++) {
      const g = patches[i]!;
      this.scratchObject.position.set(g.x, g.y + 0.2 * g.scale, g.z);
      this.scratchObject.rotation.set(0, g.rotationY, 0);
      this.scratchObject.scale.set(g.scale, g.scale, g.scale);
      this.scratchObject.updateMatrix();
      mesh.setMatrixAt(i, this.scratchObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
  }

  private buildProps(parent: Group, env: GeneratedEnvironment): void {
    this.addRockInstances(parent, env.rocks);
    this.addFlags(parent, env.flags);
    this.addBarriers(parent, env.barriers);
    if (env.cabin) {
      this.addCabin(parent, env.cabin);
    }
    if (env.radioTower) {
      this.addRadioTower(parent, env.radioTower);
    }
  }

  private buildIndustrialScenery(
    parent: Group,
    env: GeneratedEnvironment,
  ): void {
    const industrial = env.industrial;
    if (!industrial) {
      return;
    }

    const containerColors = [0x3d6b8a, 0x8a5a3a, 0x5a6b4a] as const;
    const containerGeo = new BoxGeometry(6, 2.6, 2.4);
    this.disposables.push(containerGeo);
    for (let variant = 0; variant < containerColors.length; variant++) {
      const items = industrial.containers.filter((c) => c.variant % 3 === variant);
      if (items.length === 0) {
        continue;
      }
      const mat = new MeshStandardMaterial({
        color: containerColors[variant],
        roughness: 0.55,
        metalness: 0.45,
      });
      this.disposables.push(mat);
      const mesh = new InstancedMesh(containerGeo, mat, items.length);
      mesh.castShadow = env.shadowsEnabled;
      mesh.receiveShadow = env.shadowsEnabled;
      for (let i = 0; i < items.length; i++) {
        const c = items[i]!;
        this.scratchObject.position.set(c.x, c.y + 1.3 * c.scale, c.z);
        this.scratchObject.rotation.set(0, c.rotationY, 0);
        this.scratchObject.scale.setScalar(c.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    const warehouseMat = new MeshStandardMaterial({
      color: 0x6a6e72,
      roughness: 0.85,
      metalness: 0.12,
    });
    const doorMat = new MeshStandardMaterial({
      color: 0x1e2226,
      roughness: 0.95,
      metalness: 0.05,
    });
    const warehouseBodyGeo = new BoxGeometry(14, 6, 10);
    const warehouseDoorGeo = new BoxGeometry(4.2, 3.6, 0.4);
    this.disposables.push(
      warehouseMat,
      doorMat,
      warehouseBodyGeo,
      warehouseDoorGeo,
    );
    for (const wh of industrial.warehouses) {
      const group = new Group();
      group.position.set(wh.x, wh.y, wh.z);
      group.rotation.y = wh.yaw;
      group.scale.setScalar(wh.scale);
      const body = new Mesh(warehouseBodyGeo, warehouseMat);
      body.position.y = 3;
      body.castShadow = env.shadowsEnabled;
      group.add(body);
      const door = new Mesh(warehouseDoorGeo, doorMat);
      door.position.set(0, 1.8, 5.05);
      group.add(door);
      parent.add(group);
    }

    const pipeMat = new MeshStandardMaterial({
      color: 0x7a828a,
      roughness: 0.4,
      metalness: 0.55,
    });
    const pipeGeo = new CylinderGeometry(0.35, 0.35, 10, 8);
    this.disposables.push(pipeMat, pipeGeo);
    if (industrial.pipes.length > 0) {
      const mesh = new InstancedMesh(pipeGeo, pipeMat, industrial.pipes.length);
      for (let i = 0; i < industrial.pipes.length; i++) {
        const p = industrial.pipes[i]!;
        const elevated = p.variant === 1;
        this.scratchObject.position.set(
          p.x,
          p.y + (elevated ? 4.5 : 0.4) * p.scale,
          p.z,
        );
        this.scratchObject.rotation.set(0, p.rotationY, Math.PI / 2);
        this.scratchObject.scale.set(p.scale, p.scale, p.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    const towerSteel = new MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.5,
      metalness: 0.5,
    });
    const mastGeo = new CylinderGeometry(0.22, 0.35, 16, 6);
    const crossGeo = new BoxGeometry(2.8, 0.12, 0.12);
    this.disposables.push(towerSteel, mastGeo, crossGeo);
    for (const tower of industrial.towers) {
      const group = new Group();
      group.position.set(tower.x, tower.y, tower.z);
      group.rotation.y = tower.yaw;
      group.scale.setScalar(tower.scale);
      const mast = new Mesh(mastGeo, towerSteel);
      mast.position.y = 8;
      group.add(mast);
      for (const y of [4, 8, 12]) {
        const cross = new Mesh(crossGeo, towerSteel);
        cross.position.y = y;
        group.add(cross);
      }
      parent.add(group);
    }

    if (industrial.concreteBarriers.length > 0) {
      const barrierGeo = new BoxGeometry(2.2, 0.9, 0.45);
      const barrierMat = new MeshStandardMaterial({
        color: 0x9a9ea4,
        roughness: 0.92,
        metalness: 0.05,
      });
      this.disposables.push(barrierGeo, barrierMat);
      const mesh = new InstancedMesh(
        barrierGeo,
        barrierMat,
        industrial.concreteBarriers.length,
      );
      for (let i = 0; i < industrial.concreteBarriers.length; i++) {
        const b = industrial.concreteBarriers[i]!;
        this.scratchObject.position.set(b.x, b.y + 0.45 * b.scale, b.z);
        this.scratchObject.rotation.set(0, b.rotationY, 0);
        this.scratchObject.scale.setScalar(b.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    if (industrial.crane) {
      const crane = industrial.crane;
      const craneMat = new MeshStandardMaterial({
        color: 0xc45c26,
        roughness: 0.55,
        metalness: 0.35,
      });
      const craneMastGeo = new BoxGeometry(1.2, 22, 1.2);
      const craneJibGeo = new BoxGeometry(18, 0.7, 0.7);
      this.disposables.push(craneMat, craneMastGeo, craneJibGeo);
      const group = new Group();
      group.position.set(crane.x, crane.y, crane.z);
      group.rotation.y = crane.yaw;
      group.scale.setScalar(crane.scale);
      const mast = new Mesh(craneMastGeo, craneMat);
      mast.position.y = 11;
      group.add(mast);
      const jib = new Mesh(craneJibGeo, craneMat);
      jib.position.set(7, 21, 0);
      group.add(jib);
      parent.add(group);
    }

    if (industrial.utilityPoles.length > 0) {
      const poleGeo = new CylinderGeometry(0.12, 0.16, 9, 6);
      const poleMat = new MeshStandardMaterial({
        color: 0x5a5048,
        roughness: 0.9,
        metalness: 0.05,
      });
      this.disposables.push(poleGeo, poleMat);
      const mesh = new InstancedMesh(
        poleGeo,
        poleMat,
        industrial.utilityPoles.length,
      );
      for (let i = 0; i < industrial.utilityPoles.length; i++) {
        const p = industrial.utilityPoles[i]!;
        this.scratchObject.position.set(p.x, p.y + 4.5 * p.scale, p.z);
        this.scratchObject.rotation.set(0, p.rotationY, 0);
        this.scratchObject.scale.setScalar(p.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    const padMat = new MeshStandardMaterial({
      color: 0xd4a017,
      emissive: new Color(0xb8860b),
      emissiveIntensity: 0.35,
      roughness: 0.7,
      metalness: 0.1,
    });
    const padGeo = new BoxGeometry(4, 0.06, 4);
    this.disposables.push(padMat, padGeo);
    for (const pad of industrial.landingMarkings) {
      const mesh = new Mesh(padGeo, padMat);
      mesh.position.set(pad.x, pad.y + 0.04, pad.z);
      mesh.rotation.y = pad.yaw;
      mesh.scale.setScalar(pad.scale);
      parent.add(mesh);
    }
  }

  private buildCoastalScenery(parent: Group, env: GeneratedEnvironment): void {
    const coastal = env.coastal;
    if (!coastal) {
      return;
    }

    if (coastal.walls.length > 0) {
      const wallGeo = new BoxGeometry(3.2, 2.4, 1.1);
      const wallMat = new MeshStandardMaterial({
        color: 0x8a8578,
        roughness: 0.95,
        metalness: 0.02,
      });
      this.disposables.push(wallGeo, wallMat);
      const mesh = new InstancedMesh(wallGeo, wallMat, coastal.walls.length);
      mesh.castShadow = env.shadowsEnabled;
      for (let i = 0; i < coastal.walls.length; i++) {
        const w = coastal.walls[i]!;
        this.scratchObject.position.set(w.x, w.y + 1.2 * w.scale, w.z);
        this.scratchObject.rotation.set(0, w.rotationY, 0);
        this.scratchObject.scale.setScalar(w.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    const stoneMat = new MeshStandardMaterial({
      color: 0x7a756c,
      roughness: 0.92,
      metalness: 0.04,
    });
    const pillarGeo = new BoxGeometry(1.1, 5.5, 1.1);
    const slabGeo = new BoxGeometry(5.5, 0.7, 1.4);
    this.disposables.push(stoneMat, pillarGeo, slabGeo);
    for (const arch of coastal.arches) {
      const group = new Group();
      group.position.set(arch.x, arch.y, arch.z);
      group.rotation.y = arch.yaw;
      group.scale.setScalar(arch.scale);
      const left = new Mesh(pillarGeo, stoneMat);
      left.position.set(-2, 2.75, 0);
      const right = new Mesh(pillarGeo, stoneMat);
      right.position.set(2, 2.75, 0);
      const top = new Mesh(slabGeo, stoneMat);
      top.position.set(0, 5.85, 0);
      group.add(left, right, top);
      parent.add(group);
    }

    if (coastal.columns.length > 0) {
      const colGeo = new CylinderGeometry(0.45, 0.55, 4.5, 8);
      this.disposables.push(colGeo);
      const mesh = new InstancedMesh(colGeo, stoneMat, coastal.columns.length);
      for (let i = 0; i < coastal.columns.length; i++) {
        const c = coastal.columns[i]!;
        this.scratchObject.position.set(c.x, c.y + 2.25 * c.scale, c.z);
        this.scratchObject.rotation.set(0, c.rotationY, 0);
        this.scratchObject.scale.setScalar(c.scale);
        this.scratchObject.updateMatrix();
        mesh.setMatrixAt(i, this.scratchObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
    }

    if (coastal.watchtower) {
      const wt = coastal.watchtower;
      const group = new Group();
      group.position.set(wt.x, wt.y, wt.z);
      group.rotation.y = wt.yaw;
      group.scale.setScalar(wt.scale);
      const baseGeo = new BoxGeometry(3.5, 8, 3.5);
      const roofGeo = new ConeGeometry(2.8, 2.2, 4);
      this.disposables.push(baseGeo, roofGeo);
      const base = new Mesh(baseGeo, stoneMat);
      base.position.y = 4;
      const roof = new Mesh(roofGeo, stoneMat);
      roof.position.y = 9.2;
      roof.rotation.y = Math.PI / 4;
      group.add(base, roof);
      parent.add(group);
    }

    if (coastal.brokenTower) {
      const bt = coastal.brokenTower;
      const group = new Group();
      group.position.set(bt.x, bt.y, bt.z);
      group.rotation.y = bt.yaw;
      group.scale.setScalar(bt.scale);
      const stumpGeo = new CylinderGeometry(1.4, 1.8, 4.5, 7);
      const rubbleGeo = new BoxGeometry(2.2, 1.1, 1.6);
      this.disposables.push(stumpGeo, rubbleGeo);
      const stump = new Mesh(stumpGeo, stoneMat);
      stump.position.y = 2.2;
      stump.rotation.z = 0.18;
      const rubble = new Mesh(rubbleGeo, stoneMat);
      rubble.position.set(1.6, 0.55, 0.4);
      rubble.rotation.y = 0.5;
      group.add(stump, rubble);
      parent.add(group);
    }

    if (coastal.lighthouse) {
      const lh = coastal.lighthouse;
      const group = new Group();
      group.position.set(lh.x, lh.y, lh.z);
      group.rotation.y = lh.yaw;
      group.scale.setScalar(lh.scale);
      const bodyMat = new MeshStandardMaterial({
        color: 0xe8e4dc,
        roughness: 0.75,
        metalness: 0.05,
      });
      const stripeMat = new MeshStandardMaterial({
        color: 0xb03030,
        roughness: 0.7,
        metalness: 0.05,
      });
      const beaconMat = new MeshStandardMaterial({
        color: 0xfff2a8,
        emissive: new Color(0xffcc55),
        emissiveIntensity: 0.9,
        roughness: 0.35,
        metalness: 0.1,
      });
      const shaftGeo = new CylinderGeometry(1.6, 2.2, 16, 10);
      const lanternGeo = new CylinderGeometry(1.3, 1.3, 2.2, 8);
      const beaconGeo = new SphereGeometry(0.85, 10, 10);
      this.disposables.push(
        bodyMat,
        stripeMat,
        beaconMat,
        shaftGeo,
        lanternGeo,
        beaconGeo,
      );
      const shaft = new Mesh(shaftGeo, bodyMat);
      shaft.position.y = 8;
      const stripe = new Mesh(
        new CylinderGeometry(1.65, 1.85, 2.4, 10),
        stripeMat,
      );
      this.disposables.push(stripe.geometry);
      stripe.position.y = 11;
      const lantern = new Mesh(lanternGeo, bodyMat);
      lantern.position.y = 17.2;
      const beacon = new Mesh(beaconGeo, beaconMat);
      beacon.position.y = 18.6;
      this.towerMarker = beacon;
      group.add(shaft, stripe, lantern, beacon);
      parent.add(group);
    }

    if (coastal.oceanEnabled) {
      const oceanGeo = new PlaneGeometry(
        coastal.oceanSize,
        coastal.oceanSize,
        1,
        1,
      );
      const oceanMat = new MeshStandardMaterial({
        color: 0x1a4a6a,
        roughness: 0.35,
        metalness: 0.15,
        side: DoubleSide,
      });
      this.disposables.push(oceanGeo, oceanMat);
      const ocean = new Mesh(oceanGeo, oceanMat);
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(
        coastal.oceanCenter.x,
        coastal.oceanCenter.y,
        coastal.oceanCenter.z,
      );
      ocean.receiveShadow = false;
      this.oceanMesh = ocean;
      parent.add(ocean);
    }
  }

  private addRockInstances(parent: Group, rocks: PlacementInstance[]): void {
    if (rocks.length === 0) {
      return;
    }
    const geo = new BoxGeometry(1, 0.8, 1.1);
    const mat = new MeshStandardMaterial({
      color: 0x6a6660,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.disposables.push(geo, mat);
    const mesh = new InstancedMesh(geo, mat, rocks.length);
    mesh.castShadow = false;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i]!;
      this.scratchObject.position.set(r.x, r.y + 0.3 * r.scale, r.z);
      this.scratchObject.rotation.set(
        0.2 * (r.variant - 1),
        r.rotationY,
        0.15 * (r.variant - 1),
      );
      this.scratchObject.scale.set(r.scale, r.scale * 0.85, r.scale * 1.1);
      this.scratchObject.updateMatrix();
      mesh.setMatrixAt(i, this.scratchObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
  }

  private addFlags(parent: Group, flags: PlacementInstance[]): void {
    const poleGeo = new CylinderGeometry(0.04, 0.05, 2.4, 6);
    const clothGeo = new BoxGeometry(0.7, 0.45, 0.04);
    const poleMat = new MeshStandardMaterial({
      color: 0xd8dde2,
      roughness: 0.55,
      metalness: 0.25,
    });
    const clothColors = [0x2ec4b6, 0xff6b35, 0xffc857];
    this.disposables.push(poleGeo, clothGeo, poleMat);

    for (const flag of flags) {
      const group = new Group();
      group.position.set(flag.x, flag.y, flag.z);
      group.rotation.y = flag.rotationY;
      group.scale.setScalar(flag.scale);

      const pole = new Mesh(poleGeo, poleMat);
      pole.position.y = 1.2;
      group.add(pole);

      const clothMat = new MeshStandardMaterial({
        color: clothColors[flag.variant % clothColors.length],
        roughness: 0.7,
        metalness: 0.05,
        emissive: clothColors[flag.variant % clothColors.length],
        emissiveIntensity: 0.12,
      });
      this.disposables.push(clothMat);
      const cloth = new Mesh(clothGeo, clothMat);
      cloth.position.set(0.38, 2.05, 0);
      cloth.userData['baseYaw'] = 0;
      group.add(cloth);
      this.flagAnims.push({
        mesh: cloth,
        phase: flag.x * 0.1 + flag.z * 0.07,
        amp: 0.08,
      });
      parent.add(group);
    }
  }

  private addBarriers(parent: Group, barriers: PlacementInstance[]): void {
    if (barriers.length === 0) {
      return;
    }
    const geo = new BoxGeometry(2.4, 1.1, 0.25);
    const mat = new MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.disposables.push(geo, mat);
    const mesh = new InstancedMesh(geo, mat, barriers.length);
    for (let i = 0; i < barriers.length; i++) {
      const b = barriers[i]!;
      this.scratchObject.position.set(b.x, b.y + 0.55, b.z);
      this.scratchObject.rotation.set(0, b.rotationY, 0);
      this.scratchObject.scale.set(1, 1, 1);
      this.scratchObject.updateMatrix();
      mesh.setMatrixAt(i, this.scratchObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
  }

  private addCabin(parent: Group, cabin: LandmarkPlacement): void {
    const group = new Group();
    group.position.set(cabin.x, cabin.y, cabin.z);
    group.rotation.y = cabin.yaw;
    group.scale.setScalar(cabin.scale);

    const wallMat = new MeshStandardMaterial({
      color: 0x6b4a32,
      roughness: 0.9,
      metalness: 0.02,
    });
    const roofMat = new MeshStandardMaterial({
      color: 0x3a3530,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.disposables.push(wallMat, roofMat);

    const bodyGeo = new BoxGeometry(4.2, 2.2, 3.2);
    const roofGeo = new ConeGeometry(3.4, 1.6, 4);
    this.disposables.push(bodyGeo, roofGeo);

    const body = new Mesh(bodyGeo, wallMat);
    body.position.y = 1.1;
    group.add(body);

    const roof = new Mesh(roofGeo, roofMat);
    roof.position.y = 2.9;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    parent.add(group);
  }

  private addRadioTower(parent: Group, tower: LandmarkPlacement): void {
    const group = new Group();
    group.position.set(tower.x, tower.y, tower.z);

    const steelMat = new MeshStandardMaterial({
      color: 0x8a929a,
      roughness: 0.55,
      metalness: 0.4,
    });
    const markerMat = new MeshStandardMaterial({
      color: 0xff4d4d,
      emissive: new Color(0xff2222),
      emissiveIntensity: 0.8,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.disposables.push(steelMat, markerMat);

    const mastGeo = new CylinderGeometry(0.18, 0.35, 18, 6);
    const crossGeo = new BoxGeometry(3.2, 0.12, 0.12);
    this.disposables.push(mastGeo, crossGeo);

    const mast = new Mesh(mastGeo, steelMat);
    mast.position.y = 9;
    group.add(mast);

    for (const y of [5, 9, 13]) {
      const cross = new Mesh(crossGeo, steelMat);
      cross.position.y = y;
      group.add(cross);
    }

    const markerGeo = new SphereGeometry(0.35, 8, 8);
    this.disposables.push(markerGeo);
    const marker = new Mesh(markerGeo, markerMat);
    marker.position.y = 18.4;
    group.add(marker);
    this.towerMarker = marker;

    parent.add(group);
  }

  private buildBirds(parent: Group, env: GeneratedEnvironment): void {
    if (env.quality === 'low' || env.theme === 'desert-industrial') {
      return;
    }
    const geo = new ConeGeometry(0.35, 0.9, 3);
    const mat = new MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 1,
      metalness: 0,
    });
    this.disposables.push(geo, mat);
    const count = env.quality === 'high' ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      parent.add(mesh);
      this.birds.push({
        mesh,
        phase: i * 1.1,
        radius: 55 + i * 8,
        speed: 0.12 + i * 0.02,
        y: 28 + i * 2.5,
      });
    }
  }

  private buildCourse(
    scene: Scene,
    course: Course,
    env: GeneratedEnvironment,
  ): void {
    const group = new Group();
    this.courseGroup = group;
    scene.add(group);

    this.sharedFrameGeo = new BoxGeometry(1, 1, 1);
    this.sharedPostGeo = new CylinderGeometry(0.08, 0.1, 1, 8);
    this.sharedChevronGeo = new BoxGeometry(0.35, 0.08, 0.55);
    this.disposables.push(
      this.sharedFrameGeo,
      this.sharedPostGeo,
      this.sharedChevronGeo,
    );

    this.buildStartPad(group, course, env.shadowsEnabled);

    for (const gate of course.gates) {
      const handle = this.createGate(gate, env.shadowsEnabled);
      group.add(handle.group);
      this.gateHandles.push(handle);
    }

    this.applyCourseVisualState({
      course,
      currentGateIndex: 0,
      completedGateCount: 0,
      runActive: false,
    });
  }

  private buildStartPad(
    group: Group,
    course: Course,
    shadows: boolean,
  ): void {
    const padMat = new MeshStandardMaterial({
      color: 0x1f3a4a,
      roughness: 0.85,
      metalness: 0.05,
      emissive: new Color(0x0a3040),
      emissiveIntensity: 0.35,
    });
    const lineMat = new MeshStandardMaterial({
      color: 0x2ec4b6,
      roughness: 0.5,
      metalness: 0.1,
      emissive: new Color(0x2ec4b6),
      emissiveIntensity: 0.4,
    });
    this.disposables.push(padMat, lineMat);

    const padGeo = new BoxGeometry(3.6, 0.06, 3.6);
    const lineGeo = new BoxGeometry(3.2, 0.04, 0.18);
    this.disposables.push(padGeo, lineGeo);

    const pad = new Mesh(padGeo, padMat);
    pad.position.set(course.startPosition.x, 0.03, course.startPosition.z);
    pad.receiveShadow = shadows;
    group.add(pad);

    const line = new Mesh(lineGeo, lineMat);
    line.position.set(
      course.startPosition.x,
      0.07,
      course.startPosition.z - 1.45,
    );
    group.add(line);

    // Branding strip via canvas texture.
    try {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(10, 24, 32, 0.0)';
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(46, 196, 182, 0.85)';
        ctx.font = 'bold 36px Barlow, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FPV TRAINER', size / 2, size / 2);
        const tex = new CanvasTexture(canvas);
        this.disposables.push(tex);
        const brandMat = new MeshStandardMaterial({
          map: tex,
          transparent: true,
          roughness: 0.6,
          metalness: 0.05,
        });
        this.disposables.push(brandMat);
        const brandGeo = new PlaneGeometry(2.6, 0.55);
        this.disposables.push(brandGeo);
        const brand = new Mesh(brandGeo, brandMat);
        brand.rotation.x = -Math.PI / 2;
        brand.position.set(
          course.startPosition.x,
          0.08,
          course.startPosition.z + 0.9,
        );
        group.add(brand);
      }
    } catch {
      // Headless / canvas unavailable.
    }
  }

  private createGate(gate: CourseGate, shadows: boolean): GateHandle {
    const group = new Group();
    group.position.set(gate.position.x, gate.position.y, gate.position.z);
    group.quaternion.set(
      gate.rotation.x,
      gate.rotation.y,
      gate.rotation.z,
      gate.rotation.w,
    );
    group.userData['gate'] = gate;

    const frameMat = new MeshStandardMaterial({
      color: 0xb0b8c0,
      roughness: 0.55,
      metalness: 0.15,
      emissive: new Color(0x000000),
      emissiveIntensity: 0,
    });
    const chevronMat = new MeshStandardMaterial({
      color: 0xffc857,
      roughness: 0.45,
      metalness: 0.1,
      emissive: new Color(0xffc857),
      emissiveIntensity: 0.25,
    });
    this.disposables.push(frameMat, chevronMat);

    const halfW = gate.width * 0.5;
    const halfH = gate.height * 0.5;
    const thickness = 0.18;
    const depth = Math.max(0.2, gate.depth);

    const top = new Mesh(this.sharedFrameGeo!, frameMat);
    top.scale.set(gate.width + thickness * 2, thickness, depth);
    top.position.set(0, halfH + thickness * 0.5, 0);
    top.castShadow = shadows;
    group.add(top);

    const bottom = new Mesh(this.sharedFrameGeo!, frameMat);
    bottom.scale.set(gate.width + thickness * 2, thickness, depth);
    bottom.position.set(0, -halfH - thickness * 0.5, 0);
    group.add(bottom);

    const left = new Mesh(this.sharedFrameGeo!, frameMat);
    left.scale.set(thickness, gate.height, depth);
    left.position.set(-halfW - thickness * 0.5, 0, 0);
    left.castShadow = shadows;
    group.add(left);

    const right = new Mesh(this.sharedFrameGeo!, frameMat);
    right.scale.set(thickness, gate.height, depth);
    right.position.set(halfW + thickness * 0.5, 0, 0);
    right.castShadow = shadows;
    group.add(right);

    const postHeight = Math.max(0.4, gate.position.y - halfH);
    const leftPost = new Mesh(this.sharedPostGeo!, frameMat);
    leftPost.scale.set(1, postHeight, 1);
    leftPost.position.set(-halfW, -gate.position.y + postHeight * 0.5, 0);
    group.add(leftPost);

    const rightPost = new Mesh(this.sharedPostGeo!, frameMat);
    rightPost.scale.set(1, postHeight, 1);
    rightPost.position.set(halfW, -gate.position.y + postHeight * 0.5, 0);
    group.add(rightPost);

    for (const y of [-0.55, 0.55]) {
      const chevron = new Mesh(this.sharedChevronGeo!, chevronMat);
      chevron.position.set(0, y, depth * 0.55 + 0.25);
      chevron.rotation.y = Math.PI;
      group.add(chevron);
    }

    const label = this.createGateLabel(gate.index + 1);
    if (label) {
      label.position.set(0, halfH + 0.85, 0);
      group.add(label);
    }

    return { group, frameMat, chevronMat, label, pulse: 0, baseEmissive: 0 };
  }

  private createGateLabel(number: number): Sprite | null {
    try {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(8, 16, 24, 0.55)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e7eef4';
      ctx.font = 'bold 64px Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), size / 2, size / 2 + 2);

      const texture = new CanvasTexture(canvas);
      this.disposables.push(texture);
      const mat = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        sizeAttenuation: true,
      });
      this.disposables.push(mat);
      const sprite = new Sprite(mat);
      sprite.scale.set(1.2, 1.2, 1);
      return sprite;
    } catch {
      return null;
    }
  }

  private buildDrone(shadows: boolean): Group {
    this.props = [];
    this.droneLights = [];
    this.droneMaterials = null;
    this.propAnim.reset();
    this.damageVisual.reset();
    this.damageState = 'pristine';

    if (this.activeAircraft) {
      const built = createAircraftVisual(this.activeAircraft, {
        shadows,
        lod: 'full',
        liveryId: this.activeLiveryId ?? undefined,
      });
      this.disposables.push(...built.disposables);
      this.props = built.props;
      this.droneLights = built.lights;
      // Adapt aircraft materials into the damage-visual shared shape.
      this.droneMaterials = {
        carbon: built.damageCompat.carbon,
        carbonDark: built.damageCompat.carbonDark,
        motor: built.materials.metal,
        motorBell: built.materials.metal,
        prop: built.damageCompat.prop,
        battery: built.materials.battery,
        batteryStrap: built.materials.rubber,
        cameraBody: built.materials.primary,
        cameraLens: built.materials.cameraGlass,
        cameraCage: built.materials.accent,
        antenna: built.materials.rubber,
        wire: built.materials.rubber,
        fcPcb: built.materials.secondary,
        fcSilk: built.materials.accent,
        ledFront: built.damageCompat.ledFront,
        ledRear: built.damageCompat.ledRear,
        actionCam: built.materials.primary,
        actionCamLens: built.materials.cameraGlass,
      };
      return built.group;
    }

    const built = createRealisticDroneModel({
      shadows,
      lod: 'full',
    });
    this.disposables.push(...built.disposables);
    this.props = built.props;
    this.droneLights = built.lights;
    this.droneMaterials = built.materials;
    return built.group;
  }

  /**
   * Swap aircraft visual + camera config without recreating the renderer/RAF.
   * Call before or during session setup; rebuilds the drone group in-scene.
   */
  applyAircraft(
    definition: AircraftDefinition | null,
    options?: {
      liveryId?: string;
      appliedConfig?: AppliedFlightConfig;
    },
  ): void {
    this.activeAircraft = definition;
    this.activeLiveryId = options?.liveryId ?? null;
    if (options?.appliedConfig) {
      this.cfg.fpvCameraTilt = options.appliedConfig.fpvCameraTilt;
      this.cfg.chaseOffset = { ...options.appliedConfig.chaseOffset };
      this.cfg.chaseSmoothing = options.appliedConfig.chaseSmoothing;
      // Keep tilt on the active resolved rig in sync with applied aircraft config.
      this.resolvedFpvRig = {
        ...this.resolvedFpvRig,
        localCameraTiltRad: options.appliedConfig.fpvCameraTilt,
      };
    }

    if (!this.scene || !this.drone) {
      return;
    }

    const shadows = true;
    const parent = this.drone.parent;
    const pos = this.drone.position.clone();
    const quat = this.drone.quaternion.clone();
    parent?.remove(this.drone);
    this.drone = this.buildDrone(shadows);
    this.drone.position.copy(pos);
    this.drone.quaternion.copy(quat);
    (parent ?? this.scene).add(this.drone);
  }

  /** Apply damage visual state from collision system (render-only). */
  setDroneDamageState(state: DroneDamageState, animTime = 0): void {
    this.damageState = state;
    if (this.droneMaterials) {
      this.damageVisual.apply(
        {
          materials: this.droneMaterials,
          props: this.props,
          lights: this.droneLights,
        },
        state,
        animTime,
        this.crashFlash,
      );
    }
  }

  private initParticlePools(scene: Scene, quality: EnvironmentQuality): void {
    this.dustPool?.dispose();
    this.sparkPool?.dispose();
    const dustMax = quality === 'low' ? 24 : quality === 'high' ? 64 : 40;
    const sparkMax = quality === 'low' ? 16 : quality === 'high' ? 48 : 32;
    this.dustPool = new ParticlePool({
      maxParticles: dustMax,
      color: 0xb8a078,
      size: 0.12,
      opacity: 0.4,
    });
    this.sparkPool = new ParticlePool({
      maxParticles: sparkMax,
      color: 0xffc857,
      size: 0.08,
      opacity: 0.7,
    });
    this.dustPool.addTo(scene);
    this.sparkPool.addTo(scene);
    this.quality = quality;
  }

  private updatePropellers(state: RenderDroneVisualState, dt: number): void {
    this.propRpm = this.propAnim.update(this.props, {
      throttle: state.throttle,
      armed: state.armed,
      crashed: state.crashed,
      paused: state.paused,
      propellerBlurEnabled: this.visualEffects.propellerBlurEnabled,
      quality: this.quality,
      dt,
    });
  }

  private updateNavLights(state: RenderDroneVisualState, dt: number): void {
    if (this.crashFlash > 0) {
      this.crashFlash = Math.max(0, this.crashFlash - dt * 2.5);
    }
    const flash =
      state.crashed && this.crashFlash > 0
        ? 0.5 + 0.5 * Math.sin(this.animTime * 28)
        : state.crashed
          ? 0.15 + 0.1 * Math.sin(this.animTime * 8)
          : 0;

    for (const light of this.droneLights) {
      let intensity = state.armed ? 0.85 : 0.25;
      if (light.kind === 'rear') {
        intensity *= state.armed ? 1 : 0.5;
      }
      if (flash > 0) {
        intensity = flash * 1.4;
        light.material.emissive.setHex(0xff5533);
      } else if (light.kind === 'front') {
        light.material.emissive.setHex(0xf2f6fa);
      } else {
        light.material.emissive.setHex(0xe04545);
      }
      light.material.emissiveIntensity = intensity;
    }
  }

  private updateGroundDust(state: RenderDroneVisualState, dt: number): void {
    this.dustEmitCooldown = Math.max(0, this.dustEmitCooldown - dt);
    if (
      !this.visualEffects.groundDustEnabled ||
      this.quality === 'low' ||
      !this.dustPool ||
      !this.drone ||
      state.paused ||
      !state.armed ||
      state.crashed
    ) {
      return;
    }
    const alt = state.altitude;
    if (alt > 1.6 || state.throttle < 0.35) {
      return;
    }
    const proximity = 1 - alt / 1.6;
    const airflow = state.throttle * proximity;
    if (airflow < 0.2 || this.dustEmitCooldown > 0) {
      return;
    }
    this.dustEmitCooldown = 0.05;
    const count = Math.min(6, Math.max(1, Math.round(airflow * 5)));
    this.dustPool.emit(
      {
        x: this.drone.position.x,
        y: 0.05,
        z: this.drone.position.z,
      },
      count,
      0.6 + airflow * 1.2,
      0.35,
      0.55,
    );
  }

  private updateGatePulses(dt: number): void {
    for (const handle of this.gateHandles) {
      if (handle.pulse <= 0) {
        continue;
      }
      handle.pulse = Math.max(0, handle.pulse - dt * 2.8);
      const boost = handle.pulse * 1.2;
      handle.frameMat.emissiveIntensity = handle.baseEmissive + boost;
      handle.chevronMat.emissiveIntensity =
        handle.chevronMat.emissiveIntensity * 0.9 + boost * 0.8;
    }
  }

  private bindOrbitControls(canvas: HTMLCanvasElement): void {
    this.unbindOrbitControls();
    this.canvasPointerDown = (e: PointerEvent) => {
      if (!this.replayMode || this.replayCameraMode !== 'orbit') {
        return;
      }
      this.orbitDragging = true;
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    this.canvasPointerMove = (e: PointerEvent) => {
      if (!this.orbitDragging) {
        return;
      }
      const dx = e.clientX - this.orbitLastX;
      const dy = e.clientY - this.orbitLastY;
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
      this.orbitYaw -= dx * 0.005;
      this.orbitPitch = Math.min(
        1.2,
        Math.max(0.05, this.orbitPitch + dy * 0.004),
      );
    };
    this.canvasPointerUp = (e: PointerEvent) => {
      this.orbitDragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    this.canvasWheel = (e: WheelEvent) => {
      if (!this.replayMode || this.replayCameraMode !== 'orbit') {
        return;
      }
      e.preventDefault();
      this.orbitDistance = Math.min(
        28,
        Math.max(3, this.orbitDistance + e.deltaY * 0.01),
      );
    };
    canvas.addEventListener('pointerdown', this.canvasPointerDown);
    canvas.addEventListener('pointermove', this.canvasPointerMove);
    canvas.addEventListener('pointerup', this.canvasPointerUp);
    canvas.addEventListener('wheel', this.canvasWheel, { passive: false });
  }

  private unbindOrbitControls(): void {
    const canvas = this.canvas;
    if (!canvas) {
      this.canvasPointerDown = null;
      this.canvasPointerMove = null;
      this.canvasPointerUp = null;
      this.canvasWheel = null;
      return;
    }
    if (this.canvasPointerDown) {
      canvas.removeEventListener('pointerdown', this.canvasPointerDown);
    }
    if (this.canvasPointerMove) {
      canvas.removeEventListener('pointermove', this.canvasPointerMove);
    }
    if (this.canvasPointerUp) {
      canvas.removeEventListener('pointerup', this.canvasPointerUp);
    }
    if (this.canvasWheel) {
      canvas.removeEventListener('wheel', this.canvasWheel);
    }
    this.canvasPointerDown = null;
    this.canvasPointerMove = null;
    this.canvasPointerUp = null;
    this.canvasWheel = null;
    this.orbitDragging = false;
  }
}

function resolveGateVisual(
  gateIndex: number,
  currentGateIndex: number,
  completedGateCount: number,
  runActive: boolean,
): GateVisualState {
  if (!runActive) {
    return 'upcoming';
  }
  if (gateIndex < completedGateCount) {
    return 'completed';
  }
  if (gateIndex === currentGateIndex) {
    return 'active';
  }
  return 'upcoming';
}

function applyGateMaterials(handle: GateHandle, visual: GateVisualState): void {
  if (visual === 'active') {
    handle.frameMat.color.setHex(0xff6b35);
    handle.frameMat.emissive.setHex(0xff6b35);
    handle.frameMat.emissiveIntensity = 0.75;
    handle.chevronMat.emissiveIntensity = 0.85;
    handle.chevronMat.color.setHex(0xffe066);
  } else if (visual === 'completed') {
    handle.frameMat.color.setHex(0x3ddc97);
    handle.frameMat.emissive.setHex(0x1a5c40);
    handle.frameMat.emissiveIntensity = 0.25;
    handle.chevronMat.emissiveIntensity = 0.15;
    handle.chevronMat.color.setHex(0x8fd6b0);
  } else {
    handle.frameMat.color.setHex(0x8a93a0);
    handle.frameMat.emissive.setHex(0x000000);
    handle.frameMat.emissiveIntensity = 0;
    handle.chevronMat.emissiveIntensity = 0.2;
    handle.chevronMat.color.setHex(0xd4a84b);
  }
  handle.frameMat.needsUpdate = true;
  handle.chevronMat.needsUpdate = true;
}

function createDefaultLegacyResolvedRig(tiltRad: number): ResolvedFlightCameraRig {
  return {
    rigId: 'legacy-fpv:default',
    rigVersion: RESOLVED_FLIGHT_CAMERA_RIG_VERSION,
    resolutionStrategy: 'legacy-renderer-compatible-v1',
    localMountPosition: { ...LEGACY_FPV_MOUNT_POSITION },
    localCameraTiltRad: tiltRad,
    baseVerticalFovDegrees: LEGACY_FPV_BASE_FOV_DEGREES,
    missionCaptureAspectRatio: DEFAULT_MISSION_CAPTURE_ASPECT,
    nearMeters: LEGACY_FPV_NEAR_METERS,
    farMeters: LEGACY_FPV_FAR_METERS,
    projectionModelVersion: DEFAULT_PROJECTION_MODEL_VERSION,
    sourceCameraProfile: {
      profileId: null,
      profileVersion: null,
      sourceLocalPosition: null,
      sourceCameraAngleDeg: null,
      sourceDefaultFov: null,
      mismatchDiagnostics: ['default renderer bootstrap rig'],
    },
    legacyCompatibilityUsed: true,
    templateDerivedCamera: false,
    cosmeticEffectsExcluded: true,
  };
}
