import { Injectable, signal } from '@angular/core';
import type RAPIER from '@dimforge/rapier3d-compat';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import {
  didRapierInitFail,
  getRapierInitError,
  getRapierModule,
  initRapier,
  type RapierModule,
} from '../adapters/rapier.adapter';
import type {
  EnvironmentColliderDefinition,
  PhysicsTelemetry,
} from '../models/collision.models';
import { buildColliderDesc } from '../utils/collider-builders';
import { interactionGroups } from '../models/collision-groups';

export interface RegisteredBody {
  id: string;
  handle: number;
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  definition: EnvironmentColliderDefinition;
  isDynamic: boolean;
  isDebris: boolean;
  resetPose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

const EMPTY_TELEMETRY: PhysicsTelemetry = {
  stepMs: 0,
  activeBodies: 0,
  sleepingBodies: 0,
  colliderCount: 0,
  contactsThisStep: 0,
  dynamicProps: 0,
  debrisCount: 0,
  particleCount: 0,
  enabled: false,
  fallbackLegacyGround: true,
};

/**
 * Owns a single Rapier World. Stepped from the existing fixed-timestep loop.
 * No requestAnimationFrame inside this service.
 *
 * Strategy: hybrid — custom flight remains authoritative; this world provides
 * colliders, contact queries, and dynamic prop simulation.
 */
@Injectable({ providedIn: 'root' })
export class PhysicsWorldService {
  private world: RAPIER.World | null = null;
  private R: RapierModule | null = null;
  private readonly bodies = new Map<string, RegisteredBody>();
  private droneBody: RAPIER.RigidBody | null = null;
  private droneColliders: RAPIER.Collider[] = [];
  private eventQueue: RAPIER.EventQueue | null = null;
  private paused = false;
  private enabled = false;
  private initAttempted = false;
  private lastStepMs = 0;
  private contactsThisStep = 0;
  private maxDynamicProps = 48;
  private maxDebris = 24;
  private particleCount = 0;

  private readonly _ready = signal(false);
  private readonly _fallback = signal(true);
  private readonly _warning = signal<string | null>(null);
  private readonly _telemetry = signal<PhysicsTelemetry>({ ...EMPTY_TELEMETRY });

  readonly ready = this._ready.asReadonly();
  readonly fallbackLegacyGround = this._fallback.asReadonly();
  readonly warning = this._warning.asReadonly();
  readonly telemetry = this._telemetry.asReadonly();

  /** Fixed timestep matching flight simulation. */
  readonly fixedDt = FLIGHT_CONFIG.physicsStep;

  async initialize(): Promise<boolean> {
    if (this.world) {
      return true;
    }
    if (this.initAttempted && didRapierInitFail()) {
      this._fallback.set(true);
      this._warning.set(
        getRapierInitError() ??
          'Collision physics unavailable — using legacy ground collision.',
      );
      this.enabled = false;
      this.publishTelemetry();
      return false;
    }
    this.initAttempted = true;

    const R = await initRapier();
    if (!R) {
      this._fallback.set(true);
      this._warning.set(
        getRapierInitError() ??
          'Rapier failed to initialize. World-object collisions disabled.',
      );
      this.enabled = false;
      this._ready.set(false);
      this.publishTelemetry();
      return false;
    }

    this.R = R;
    this.world = new R.World({ x: 0, y: -FLIGHT_CONFIG.gravity, z: 0 });
    this.world.timestep = this.fixedDt;
    this.eventQueue = new R.EventQueue(true);
    this.enabled = true;
    this._fallback.set(false);
    this._ready.set(true);
    this._warning.set(null);
    this.publishTelemetry();
    return true;
  }

  isEnabled(): boolean {
    return this.enabled && !!this.world && !this.paused;
  }

  isInitialized(): boolean {
    return !!this.world;
  }

  getWorld(): RAPIER.World | null {
    return this.world;
  }

  getRapier(): RapierModule | null {
    return this.R ?? getRapierModule();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && !!this.world;
    if (!this.enabled) {
      this._fallback.set(true);
    } else {
      this._fallback.set(false);
      this._warning.set(null);
    }
    this.publishTelemetry();
  }

  setParticleCount(count: number): void {
    this.particleCount = count;
  }

  setDynamicCaps(props: number, debris: number): void {
    this.maxDynamicProps = Math.max(0, props);
    this.maxDebris = Math.max(0, debris);
  }

  getMaxDynamicProps(): number {
    return this.maxDynamicProps;
  }

  getMaxDebris(): number {
    return this.maxDebris;
  }

  /**
   * Advance Rapier by one fixed step. Call from the existing onFixedStep path.
   * Never call from a separate RAF.
   */
  step(fixedDt?: number): void {
    if (!this.world || !this.enabled || this.paused) {
      return;
    }
    const dt = fixedDt ?? this.fixedDt;
    if (!(dt > 0) || !Number.isFinite(dt)) {
      return;
    }
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      this.world.timestep = dt;
      if (this.eventQueue) {
        this.world.step(this.eventQueue);
      } else {
        this.world.step();
      }
      this.contactsThisStep = this.countContacts();
    } catch (err) {
      this._warning.set(
        err instanceof Error
          ? `Physics step error: ${err.message}`
          : 'Physics step error — collisions disabled.',
      );
      this.enabled = false;
      this._fallback.set(true);
    }
    this.lastStepMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this.publishTelemetry();
  }

  /** Debug: single step even when paused. */
  debugStepOnce(): void {
    if (!this.world) {
      return;
    }
    const was = this.paused;
    this.paused = false;
    this.step(this.fixedDt);
    this.paused = was;
  }

  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  getBody(id: string): RegisteredBody | undefined {
    return this.bodies.get(id);
  }

  getAllBodies(): readonly RegisteredBody[] {
    return [...this.bodies.values()];
  }

  getDroneBody(): RAPIER.RigidBody | null {
    return this.droneBody;
  }

  getDroneColliders(): readonly RAPIER.Collider[] {
    return this.droneColliders;
  }

  registerBody(
    definition: EnvironmentColliderDefinition,
    options?: { isDebris?: boolean },
  ): RegisteredBody | null {
    if (!this.world || !this.R) {
      return null;
    }
    if (this.bodies.has(definition.id)) {
      this._warning.set(`Duplicate collider id skipped: ${definition.id}`);
      return this.bodies.get(definition.id) ?? null;
    }

    const dynamicCount = [...this.bodies.values()].filter(
      (b) => b.isDynamic && !b.isDebris,
    ).length;
    const debrisCount = [...this.bodies.values()].filter((b) => b.isDebris).length;
    if (
      definition.bodyType === 'dynamic' &&
      !options?.isDebris &&
      dynamicCount >= this.maxDynamicProps
    ) {
      return null;
    }
    if (options?.isDebris && debrisCount >= this.maxDebris) {
      return null;
    }

    try {
      const R = this.R;
      let rbDesc: RAPIER.RigidBodyDesc;
      if (definition.bodyType === 'dynamic') {
        rbDesc = R.RigidBodyDesc.dynamic();
        const mass = definition.dynamicProperties?.mass ?? 1;
        rbDesc.setAdditionalMass(mass);
        rbDesc.setLinearDamping(
          definition.dynamicProperties?.linearDamping ?? 0.4,
        );
        rbDesc.setAngularDamping(
          definition.dynamicProperties?.angularDamping ?? 0.5,
        );
        if (definition.dynamicProperties?.canSleep !== false) {
          rbDesc.setCanSleep(true);
        }
      } else if (definition.bodyType === 'kinematic') {
        rbDesc = R.RigidBodyDesc.kinematicPositionBased();
      } else {
        rbDesc = R.RigidBodyDesc.fixed();
      }

      rbDesc.setTranslation(
        definition.position.x,
        definition.position.y,
        definition.position.z,
      );
      rbDesc.setRotation({
        x: definition.rotation.x,
        y: definition.rotation.y,
        z: definition.rotation.z,
        w: definition.rotation.w,
      });

      const body = this.world.createRigidBody(rbDesc);
      const colliders: RAPIER.Collider[] = [];
      const shapes = [definition.shape, ...(definition.additionalShapes ?? [])];
      const groups = interactionGroups(
        definition.collisionGroup,
        definition.collidesWith,
      );

      for (const shape of shapes) {
        const built = buildColliderDesc(
          R,
          shape,
          definition.material,
          !!definition.sensor,
        );
        if (!built) {
          continue;
        }
        built.desc.setCollisionGroups(groups);
        built.desc.setSolverGroups(groups);
        if (definition.sensor) {
          built.desc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
        } else {
          built.desc.setActiveEvents(
            R.ActiveEvents.COLLISION_EVENTS |
              R.ActiveEvents.CONTACT_FORCE_EVENTS,
          );
        }
        const col = this.world.createCollider(built.desc, body);
        colliders.push(col);
      }

      if (colliders.length === 0) {
        this.world.removeRigidBody(body);
        return null;
      }

      const registered: RegisteredBody = {
        id: definition.id,
        handle: body.handle,
        body,
        colliders,
        definition,
        isDynamic: definition.bodyType === 'dynamic',
        isDebris: !!options?.isDebris,
        resetPose: {
          position: { ...definition.position },
          rotation: { ...definition.rotation },
        },
      };
      this.bodies.set(definition.id, registered);
      this.publishTelemetry();
      return registered;
    } catch (err) {
      this._warning.set(
        err instanceof Error
          ? `Collider create failed (${definition.id}): ${err.message}`
          : `Collider create failed: ${definition.id}`,
      );
      return null;
    }
  }

  removeBody(id: string): void {
    const entry = this.bodies.get(id);
    if (!entry || !this.world) {
      return;
    }
    try {
      this.world.removeRigidBody(entry.body);
    } catch {
      // Body may already be removed during contact teardown.
    }
    this.bodies.delete(id);
    this.publishTelemetry();
  }

  setDroneBody(
    body: RAPIER.RigidBody | null,
    colliders: RAPIER.Collider[] = [],
  ): void {
    if (this.droneBody && this.world && body !== this.droneBody) {
      try {
        this.world.removeRigidBody(this.droneBody);
      } catch {
        /* ignore */
      }
    }
    this.droneBody = body;
    this.droneColliders = colliders;
  }

  clearEnvironment(): void {
    if (!this.world) {
      this.bodies.clear();
      this.droneBody = null;
      this.droneColliders = [];
      this.publishTelemetry();
      return;
    }
    for (const id of [...this.bodies.keys()]) {
      this.removeBody(id);
    }
    if (this.droneBody) {
      try {
        this.world.removeRigidBody(this.droneBody);
      } catch {
        /* ignore */
      }
      this.droneBody = null;
      this.droneColliders = [];
    }
    this.publishTelemetry();
  }

  resetDynamicProps(): void {
    for (const entry of this.bodies.values()) {
      if (!entry.isDynamic) {
        continue;
      }
      if (entry.isDebris) {
        this.removeBody(entry.id);
        continue;
      }
      try {
        entry.body.setTranslation(entry.resetPose.position, true);
        entry.body.setRotation(entry.resetPose.rotation, true);
        entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        entry.body.wakeUp();
        entry.body.sleep();
      } catch {
        /* ignore */
      }
    }
    this.publishTelemetry();
  }

  drainCollisionEvents(): Array<{
    handle1: number;
    handle2: number;
    started: boolean;
  }> {
    const out: Array<{ handle1: number; handle2: number; started: boolean }> =
      [];
    if (!this.eventQueue) {
      return out;
    }
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      out.push({ handle1: h1, handle2: h2, started });
    });
    return out;
  }

  findBodyByColliderHandle(handle: number): RegisteredBody | undefined {
    for (const b of this.bodies.values()) {
      if (b.colliders.some((c) => c.handle === handle)) {
        return b;
      }
    }
    return undefined;
  }

  dispose(): void {
    this.clearEnvironment();
    if (this.eventQueue) {
      try {
        this.eventQueue.free();
      } catch {
        /* ignore */
      }
      this.eventQueue = null;
    }
    if (this.world) {
      try {
        this.world.free();
      } catch {
        /* ignore */
      }
      this.world = null;
    }
    this.R = null;
    this.enabled = false;
    this._ready.set(false);
    this._fallback.set(true);
    this.publishTelemetry();
  }

  private countContacts(): number {
    if (!this.world || !this.droneBody) {
      return 0;
    }
    let n = 0;
    try {
      for (const col of this.droneColliders) {
        this.world.contactPairsWith(col, () => {
          n++;
        });
      }
    } catch {
      return n;
    }
    return n;
  }

  private publishTelemetry(): void {
    let active = 0;
    let sleeping = 0;
    let dynamic = 0;
    let debris = 0;
    let colliders = 0;
    for (const b of this.bodies.values()) {
      colliders += b.colliders.length;
      if (b.isDynamic) {
        dynamic++;
        if (b.isDebris) {
          debris++;
        }
      }
      try {
        if (b.body.isSleeping()) {
          sleeping++;
        } else {
          active++;
        }
      } catch {
        active++;
      }
    }
    if (this.droneBody) {
      colliders += this.droneColliders.length;
      active++;
    }
    this._telemetry.set({
      stepMs: this.lastStepMs,
      activeBodies: active,
      sleepingBodies: sleeping,
      colliderCount: colliders,
      contactsThisStep: this.contactsThisStep,
      dynamicProps: dynamic - debris,
      debrisCount: debris,
      particleCount: this.particleCount,
      enabled: this.enabled,
      fallbackLegacyGround: this._fallback(),
    });
  }
}
