import { Injectable, inject } from '@angular/core';

import type { PhysicsTelemetry } from '../../physics/models/collision.models';
import { PhysicsWorldService } from '../../physics/services/physics-world.service';

/**
 * Development-oriented debug state for environment / Rapier collision.
 * Does not render Three.js meshes — intended for a future debug panel.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentCollisionDebugService {
  private readonly physicsWorld = inject(PhysicsWorldService);

  showColliders = false;
  showCenters = false;
  showSleeping = false;
  showContacts = false;

  get paused(): boolean {
    return this.physicsWorld.isPaused();
  }

  set paused(value: boolean) {
    this.physicsWorld.setPaused(value);
  }

  toggleShowColliders(): void {
    this.showColliders = !this.showColliders;
  }

  resetDynamicProps(): void {
    this.physicsWorld.resetDynamicProps();
  }

  singleStep(): void {
    this.physicsWorld.debugStepOnce();
  }

  getTelemetrySnapshot(): PhysicsTelemetry {
    return this.physicsWorld.telemetry();
  }
}
