import { Injectable, inject, signal } from '@angular/core';

import type { CollisionProfile } from '../../aircraft/models/collision-profile.model';
import type { GeneratedEnvironment } from '../../environment/models/environment.model';
import type { Course } from '../../course/models/course.model';
import { EnvironmentColliderBuilderService } from '../../environment/collision/collider-manifest.model';
import type { CollisionContactEvent, CollisionCorrection } from '../models/collision.models';
import {
  COLLISION_MODEL_VERSION,
  COLLIDER_MANIFEST_VERSION,
  DRONE_COLLIDER_VERSION,
  ENVIRONMENT_ART_VERSION,
  PHYSICS_ENGINE_VERSION,
  PHYSICS_STACK_VERSION,
} from '../config/physics-versions';
import { PhysicsWorldService } from './physics-world.service';
import { DroneCollisionService } from './drone-collision.service';
import { DynamicPropPhysicsService } from './dynamic-prop-physics.service';
import { CollisionAudioService } from './collision-audio.service';
import { ImpactParticleService } from './impact-particle.service';
import { CollisionMaterialService } from './collision-material.service';
import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

export interface PhysicsSessionOptions {
  environment: GeneratedEnvironment;
  /** Active course for gate-frame colliders (opening stays clear). */
  course?: Course | null;
  /** Ranked / competitive: static colliders only, deterministic. */
  competitive?: boolean;
  /** Free flight: allow dynamic + breakable props. */
  allowDynamicProps?: boolean;
  quality?: 'low' | 'medium' | 'high';
  /** Active aircraft collision profile (compound collider). */
  collisionProfile?: CollisionProfile | null;
  /** Per-aircraft collider version stamp for replays / ranked. */
  aircraftColliderVersion?: string;
}

/**
 * Orchestrates Rapier world lifecycle for a flight session.
 * Stepped only from the existing fixed-timestep path — no separate RAF.
 *
 * Integration strategy (hybrid):
 * 1. Custom FlightControllerService integrates thrust/torque/wind
 * 2. This session syncs kinematic drone → steps Rapier → resolves contacts
 * 3. Corrections feed back via FlightControllerService.applyCollisionCorrection
 */
@Injectable({ providedIn: 'root' })
export class PhysicsSessionService {
  private readonly world = inject(PhysicsWorldService);
  private readonly droneCollision = inject(DroneCollisionService);
  private readonly dynamicProps = inject(DynamicPropPhysicsService);
  private readonly colliderBuilder = inject(EnvironmentColliderBuilderService);
  private readonly collisionAudio = inject(CollisionAudioService);
  private readonly impactParticles = inject(ImpactParticleService);
  private readonly materials = inject(CollisionMaterialService);

  private active = false;
  private competitive = false;
  private scrapeActive = false;
  private quality: 'low' | 'medium' | 'high' = 'medium';
  private lastEvents: CollisionContactEvent[] = [];
  private collisionEventLog: CollisionContactEvent[] = [];
  private manifestVersion = COLLIDER_MANIFEST_VERSION;
  private aircraftColliderVersion = DRONE_COLLIDER_VERSION;

  private readonly _initWarning = signal<string | null>(null);
  private readonly _active = signal(false);

  readonly initWarning = this._initWarning.asReadonly();
  readonly sessionActive = this._active.asReadonly();

  getVersionMetadata(): Record<string, string> {
    return {
      physicsStackVersion: PHYSICS_STACK_VERSION,
      physicsEngineVersion: PHYSICS_ENGINE_VERSION,
      collisionModelVersion: COLLISION_MODEL_VERSION,
      colliderManifestVersion: this.manifestVersion,
      droneColliderVersion: this.aircraftColliderVersion || DRONE_COLLIDER_VERSION,
      environmentArtVersion: ENVIRONMENT_ART_VERSION,
    };
  }

  getCollisionEventLog(): readonly CollisionContactEvent[] {
    return this.collisionEventLog;
  }

  clearCollisionEventLog(): void {
    this.collisionEventLog = [];
  }

  async startSession(options: PhysicsSessionOptions): Promise<boolean> {
    await this.endSession();

    const ok = await this.world.initialize();
    if (!ok) {
      this._initWarning.set(
        this.world.warning() ??
          'Advanced collisions unavailable — legacy ground only.',
      );
      this.active = false;
      this._active.set(false);
      return false;
    }

    this.competitive = !!options.competitive;
    this.aircraftColliderVersion =
      options.aircraftColliderVersion ?? DRONE_COLLIDER_VERSION;
    const quality = options.quality ?? options.environment.quality ?? 'medium';
    this.quality = quality;
    const caps =
      quality === 'low'
        ? { props: 8, debris: 6 }
        : quality === 'high'
          ? { props: 48, debris: 24 }
          : { props: 24, debris: 12 };
    this.world.setDynamicCaps(caps.props, caps.debris);

    const allowDynamic =
      options.competitive === true
        ? false
        : options.allowDynamicProps !== false;

    const manifest = this.colliderBuilder.build(options.environment, {
      allowDynamicProps: allowDynamic,
      quality,
      competitive: options.competitive,
      course: options.course ?? null,
    });
    this.manifestVersion = manifest.version;

    this.droneCollision.clearColliderMeta();
    this.droneCollision.resetDamage();
    this.dynamicProps.resetAll();

    for (const def of manifest.colliders) {
      const registered = this.world.registerBody(def);
      if (!registered) {
        continue;
      }
      for (const col of registered.colliders) {
        this.droneCollision.registerColliderMeta(col.handle, {
          objectId: def.id,
          material: def.material,
          isWater: def.material === 'water',
          isGroundLike:
            def.id === 'terrain-ground' ||
            def.id === 'terrain-heightfield' ||
            def.material === 'grass' ||
            def.material === 'dirt',
          damageMultiplier: def.damageMultiplier,
          sensor: def.sensor,
        });
      }
    }

    if (!this.droneCollision.ensureDroneBody(options.collisionProfile ?? null)) {
      this._initWarning.set('Drone collider failed to create.');
      this.world.setEnabled(false);
      this.active = false;
      this._active.set(false);
      return false;
    }

    this.world.setEnabled(true);
    this.active = true;
    this._active.set(true);
    this._initWarning.set(null);
    this.collisionEventLog = [];
    return true;
  }

  async endSession(): Promise<void> {
    this.collisionAudio.stopScrape();
    this.scrapeActive = false;
    this.world.clearEnvironment();
    this.droneCollision.clearColliderMeta();
    this.droneCollision.resetDamage();
    this.dynamicProps.resetAll();
    this.active = false;
    this._active.set(false);
  }

  isActive(): boolean {
    return this.active && this.world.isEnabled();
  }

  /**
   * Fixed-step collision after custom flight integration.
   * Steps Rapier once inside drone collision processing.
   */
  processFixedStep(state: {
    position: Vec3;
    velocity: Vec3;
    orientation: Quat;
    angularVelocity: { pitch: number; yaw: number; roll: number };
    armed: boolean;
    crashed: boolean;
    timestampMs: number;
  }): CollisionCorrection | null {
    if (!this.isActive()) {
      return null;
    }

    const correction = this.droneCollision.processFixedStep({
      ...state,
      competitive: this.competitive,
    });

    if (!correction) {
      return null;
    }

    const impactHints: Array<{ objectId: string; impulse: number }> = [];
    for (const ev of correction.events) {
      this.collisionEventLog.push(ev);
      impactHints.push({
        objectId: ev.objectId,
        impulse: ev.impactStrength,
      });
      this.feedbackForEvent(ev);
    }

    this.dynamicProps.afterPhysicsStep(
      this.world.fixedDt,
      impactHints,
    );

    // Cap log size for memory.
    if (this.collisionEventLog.length > 500) {
      this.collisionEventLog.splice(0, this.collisionEventLog.length - 400);
    }

    this.lastEvents = correction.events;
    return correction;
  }

  resetDynamicProps(): void {
    this.dynamicProps.resetAll();
    this.droneCollision.resetDamage();
    this.collisionAudio.stopScrape();
    this.scrapeActive = false;
  }

  getDamageState() {
    return this.droneCollision.damageState();
  }

  getTelemetry() {
    return this.world.telemetry();
  }

  setPaused(paused: boolean): void {
    this.world.setPaused(paused);
  }

  private feedbackForEvent(ev: CollisionContactEvent): void {
    try {
      const quality = this.quality;
      if (ev.outcome === 'waterCrash') {
        this.collisionAudio.playSplash(ev.impactStrength);
        this.impactParticles.emit({
          type: 'splash',
          point: ev.collisionPoint,
          normal: ev.collisionNormal,
          velocity: ev.relativeVelocity,
          strength: ev.impactStrength,
          quality,
        });
        return;
      }
      if (
        ev.outcome === 'severe' ||
        ev.outcome === 'catastrophic' ||
        ev.outcome === 'hardLanding'
      ) {
        this.collisionAudio.playSevereCrash(ev.impactStrength);
        this.impactParticles.emit({
          type: 'debris',
          point: ev.collisionPoint,
          normal: ev.collisionNormal,
          velocity: ev.relativeVelocity,
          strength: ev.impactStrength,
          quality,
        });
      } else if (ev.propStrike || ev.outcome === 'propStrike') {
        this.collisionAudio.playPropStrike(ev.impactStrength);
      } else if (ev.outcome === 'scrape') {
        if (!this.scrapeActive) {
          this.collisionAudio.startScrape({
            material: ev.material,
            strength: ev.impactStrength,
          });
          this.scrapeActive = true;
        }
      } else if (ev.outcome !== 'none' && ev.outcome !== 'safeLanding') {
        this.collisionAudio.playImpact({
          material: ev.material,
          strength: ev.impactStrength,
          position: ev.collisionPoint,
        });
      }

      const profile = this.materials.get(ev.material);
      if (
        profile.particleEffect !== 'none' &&
        ev.outcome !== 'none' &&
        ev.outcome !== 'safeLanding'
      ) {
        this.impactParticles.emit({
          type: profile.particleEffect,
          point: ev.collisionPoint,
          normal: ev.collisionNormal,
          velocity: ev.relativeVelocity,
          strength: ev.impactStrength,
          quality,
        });
      }
    } catch {
      /* feedback must never break physics */
    }
  }

  /** Call from onFrame when no scrape contacts this step. */
  endScrapeIfIdle(): void {
    if (this.scrapeActive && this.lastEvents.every((e) => e.outcome !== 'scrape')) {
      this.collisionAudio.stopScrape();
      this.scrapeActive = false;
    }
    this.lastEvents = [];
  }
}
