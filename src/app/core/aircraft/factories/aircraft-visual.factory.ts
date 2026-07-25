import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';

import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type {
  AircraftLivery,
  AircraftSilhouette,
} from '../models/visual-profile.model';
import type {
  DroneNavLight,
  DronePropVisual,
} from '../../drone/visual/drone-model.factory';

export interface AircraftVisualMaterials {
  primary: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  secondary: MeshStandardMaterial;
  canopy: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  battery: MeshStandardMaterial;
  cameraGlass: MeshStandardMaterial;
  prop: MeshStandardMaterial;
  ledFront: MeshStandardMaterial;
  ledRear: MeshStandardMaterial;
}

export interface AircraftVisualResult {
  group: Group;
  props: DronePropVisual[];
  lights: DroneNavLight[];
  disposables: Array<BufferGeometry | Material>;
  materials: AircraftVisualMaterials;
  silhouette: AircraftSilhouette;
  /** Compatible with existing damage visual service via adapter fields. */
  damageCompat: {
    carbon: MeshStandardMaterial;
    carbonDark: MeshStandardMaterial;
    prop: MeshStandardMaterial;
    ledFront: MeshStandardMaterial;
    ledRear: MeshStandardMaterial;
  };
}

export interface CreateAircraftVisualOptions {
  shadows: boolean;
  lod?: 'full' | 'chase' | 'fpv';
  liveryId?: string;
  forceSilhouette?: AircraftSilhouette;
}

export function createAircraftVisual(
  def: AircraftDefinition,
  options: CreateAircraftVisualOptions,
): AircraftVisualResult {
  const silhouette =
    options.forceSilhouette ?? def.visualProfile.proceduralModelKey;
  const livery =
    def.visualProfile.supportedLiveries.find(
      (l) => l.id === (options.liveryId ?? def.visualProfile.defaultLiveryId),
    ) ?? def.visualProfile.supportedLiveries[0];

  const materials = createMaterials(livery);
  const disposables: Array<BufferGeometry | Material> = [
    materials.primary,
    materials.accent,
    materials.secondary,
    materials.canopy,
    materials.metal,
    materials.rubber,
    materials.battery,
    materials.cameraGlass,
    materials.prop,
    materials.ledFront,
    materials.ledRear,
  ];

  const group = new Group();
  group.name = `aircraft:${def.id}`;
  const props: DronePropVisual[] = [];
  const lights: DroneNavLight[] = [];
  const full = options.lod !== 'fpv';
  const scale = def.visualProfile.scale;

  switch (silhouette) {
    case 'protected-cinewhoop':
      buildCinewhoop(group, materials, props, lights, disposables, options.shadows, full);
      break;
    case 'hybrid-speed':
      buildHybrid(group, materials, props, lights, disposables, options.shadows, full);
      break;
    case 'micro-protected':
      buildMicro(group, materials, props, lights, disposables, options.shadows, full);
      break;
    case 'racing-x':
      buildRacing(group, materials, props, lights, disposables, options.shadows, full);
      break;
    case 'long-range':
      buildLongRange(group, materials, props, lights, disposables, options.shadows, full);
      break;
    case 'freestyle-x':
    default:
      buildFreestyle(group, materials, props, lights, disposables, options.shadows, full);
      break;
  }

  group.scale.setScalar(scale);

  return {
    group,
    props,
    lights,
    disposables,
    materials,
    silhouette,
    damageCompat: {
      carbon: materials.primary,
      carbonDark: materials.secondary,
      prop: materials.prop,
      ledFront: materials.ledFront,
      ledRear: materials.ledRear,
    },
  };
}

export function disposeAircraftVisual(result: AircraftVisualResult): void {
  result.group.removeFromParent();
  for (const d of result.disposables) {
    d.dispose();
  }
}

function createMaterials(livery: AircraftLivery): AircraftVisualMaterials {
  const mk = (
    color: number,
    roughness: number,
    metalness: number,
    opacity = 1,
  ): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness, metalness });
    if (opacity < 1) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
      m.side = DoubleSide;
    }
    return m;
  };

  const ledFront = mk(livery.ledFront, 0.4, 0.1);
  ledFront.emissive = new Color(livery.ledFront);
  ledFront.emissiveIntensity = 0.35;
  const ledRear = mk(livery.ledRear, 0.4, 0.1);
  ledRear.emissive = new Color(livery.ledRear);
  ledRear.emissiveIntensity = 0.35;

  return {
    primary: mk(livery.primaryColor, 0.55, 0.15),
    accent: mk(livery.accentColor, 0.45, 0.25),
    secondary: mk(livery.secondaryColor, 0.6, 0.12),
    canopy: mk(livery.canopyColor, 0.35, 0.2),
    metal: mk(0x707880, 0.35, 0.72),
    rubber: mk(0x1e2428, 0.85, 0.02),
    battery: mk(0x2a3038, 0.6, 0.1),
    cameraGlass: mk(0x182028, 0.2, 0.4),
    prop: mk(0xc8d4e0, 0.65, 0.05, 0.82),
    ledFront,
    ledRear,
  };
}

function mesh(
  geo: BufferGeometry,
  mat: Material,
  shadows: boolean,
  disposables: Array<BufferGeometry | Material>,
): Mesh {
  disposables.push(geo);
  const m = new Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

function addProp(
  parent: Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  spinDir: number,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  bladeCount = 3,
): void {
  const group = new Group();
  group.position.set(x, y, z);
  const blades: Mesh[] = [];
  const bladeGeo = new BoxGeometry(radius * 0.95, 0.003, radius * 0.18);
  disposables.push(bladeGeo);
  for (let i = 0; i < bladeCount; i++) {
    const blade = new Mesh(bladeGeo, materials.prop);
    blade.rotation.y = (i * Math.PI * 2) / bladeCount;
    blade.castShadow = shadows;
    group.add(blade);
    blades.push(blade);
  }
  const hub = mesh(
    new CylinderGeometry(radius * 0.1, radius * 0.1, 0.008, 8),
    materials.metal,
    shadows,
    disposables,
  );
  group.add(hub);

  const blurGeo = new CylinderGeometry(radius, radius, 0.002, 24);
  const blurMat = materials.prop.clone();
  blurMat.transparent = true;
  blurMat.opacity = 0.35;
  blurMat.depthWrite = false;
  disposables.push(blurGeo, blurMat);
  const blur = new Mesh(blurGeo, blurMat);
  blur.visible = false;
  group.add(blur);

  parent.add(group);
  props.push({ group, blades, blur, spinDir });
}

function addLeds(
  parent: Group,
  materials: AircraftVisualMaterials,
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  frontZ: number,
  rearZ: number,
  y = 0.02,
  r = 0.008,
): void {
  const geo = new SphereGeometry(r, 8, 8);
  disposables.push(geo);
  const front = new Mesh(geo, materials.ledFront);
  front.position.set(0, y, frontZ);
  parent.add(front);
  lights.push({ mesh: front, material: materials.ledFront, kind: 'front' });
  const rear = new Mesh(geo, materials.ledRear);
  rear.position.set(0, y, rearZ);
  parent.add(rear);
  lights.push({ mesh: rear, material: materials.ledRear, kind: 'rear' });
}

/** Rounded protected ducts — compact cinewhoop. */
function buildCinewhoop(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  group.add(
    mesh(new BoxGeometry(0.12, 0.06, 0.14), materials.canopy, shadows, disposables),
  );
  group.add(
    mesh(new BoxGeometry(0.16, 0.035, 0.16), materials.primary, shadows, disposables),
  );
  if (full) {
    const vent = mesh(
      new BoxGeometry(0.04, 0.01, 0.08),
      materials.accent,
      shadows,
      disposables,
    );
    vent.position.set(0.04, 0.035, 0.02);
    group.add(vent);
  }

  const offsets: Array<[number, number]> = [
    [0.11, -0.11],
    [-0.11, -0.11],
    [0.11, 0.11],
    [-0.11, 0.11],
  ];
  const spins = [1, -1, -1, 1];
  offsets.forEach(([x, z], i) => {
    const ring = mesh(
      new TorusGeometry(0.09, 0.012, 8, 20),
      materials.secondary,
      shadows,
      disposables,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.01, z);
    group.add(ring);
    const motor = mesh(
      new CylinderGeometry(0.022, 0.022, 0.02, 10),
      materials.metal,
      shadows,
      disposables,
    );
    motor.position.set(x, 0.02, z);
    group.add(motor);
    addProp(group, x, 0.035, z, 0.08, spins[i], materials, props, disposables, shadows);
  });

  const cam = mesh(
    new BoxGeometry(0.04, 0.03, 0.045),
    materials.primary,
    shadows,
    disposables,
  );
  cam.position.set(0, -0.01, -0.1);
  group.add(cam);
  const lens = mesh(
    new CylinderGeometry(0.012, 0.012, 0.01, 10),
    materials.cameraGlass,
    shadows,
    disposables,
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.01, -0.125);
  group.add(lens);
  addLeds(group, materials, lights, disposables, -0.08, 0.08);
}

/** Angular aerodynamic hybrid shell. */
function buildHybrid(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  const shell = mesh(
    new BoxGeometry(0.18, 0.08, 0.32),
    materials.canopy,
    shadows,
    disposables,
  );
  group.add(shell);
  const nose = mesh(
    new BoxGeometry(0.1, 0.05, 0.1),
    materials.primary,
    shadows,
    disposables,
  );
  nose.position.set(0, 0, -0.18);
  group.add(nose);
  if (full) {
    const batt = mesh(
      new BoxGeometry(0.12, 0.05, 0.14),
      materials.battery,
      shadows,
      disposables,
    );
    batt.position.set(0, -0.02, 0.12);
    group.add(batt);
    const fin = mesh(
      new BoxGeometry(0.02, 0.06, 0.08),
      materials.accent,
      shadows,
      disposables,
    );
    fin.position.set(0, 0.06, 0.14);
    group.add(fin);
  }

  const arms: Array<[number, number, number]> = [
    [0.12, -0.12, Math.PI / 4],
    [-0.12, -0.12, -Math.PI / 4],
    [0.12, 0.12, -Math.PI / 4],
    [-0.12, 0.12, Math.PI / 4],
  ];
  const motors: Array<[number, number]> = [
    [0.2, -0.2],
    [-0.2, -0.2],
    [0.2, 0.2],
    [-0.2, 0.2],
  ];
  const spins = [1, -1, -1, 1];
  arms.forEach(([x, z, yaw]) => {
    const arm = mesh(
      new BoxGeometry(0.04, 0.025, 0.28),
      materials.secondary,
      shadows,
      disposables,
    );
    arm.position.set(x, 0, z);
    arm.rotation.y = yaw;
    group.add(arm);
  });
  motors.forEach(([x, z], i) => {
    const motor = mesh(
      new CylinderGeometry(0.035, 0.032, 0.03, 12),
      materials.metal,
      shadows,
      disposables,
    );
    motor.position.set(x, 0.025, z);
    group.add(motor);
    const guard = mesh(
      new TorusGeometry(0.05, 0.006, 6, 14),
      materials.accent,
      shadows,
      disposables,
    );
    guard.rotation.x = Math.PI / 2;
    guard.position.set(x, 0.03, z);
    group.add(guard);
    addProp(group, x, 0.045, z, 0.1, spins[i], materials, props, disposables, shadows);
  });

  const cam = mesh(
    new BoxGeometry(0.05, 0.04, 0.06),
    materials.primary,
    shadows,
    disposables,
  );
  cam.position.set(0, 0, -0.22);
  group.add(cam);
  addLeds(group, materials, lights, disposables, -0.14, 0.16, 0.03, 0.01);
}

/** Tiny micro with small rings. */
function buildMicro(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  group.add(
    mesh(new BoxGeometry(0.07, 0.035, 0.09), materials.canopy, shadows, disposables),
  );
  if (full) {
    const batt = mesh(
      new BoxGeometry(0.05, 0.025, 0.06),
      materials.battery,
      shadows,
      disposables,
    );
    batt.position.set(0, -0.025, 0.01);
    group.add(batt);
  }
  const offsets: Array<[number, number]> = [
    [0.065, -0.065],
    [-0.065, -0.065],
    [0.065, 0.065],
    [-0.065, 0.065],
  ];
  const spins = [1, -1, -1, 1];
  offsets.forEach(([x, z], i) => {
    const ring = mesh(
      new TorusGeometry(0.048, 0.007, 6, 14),
      materials.accent,
      shadows,
      disposables,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.008, z);
    group.add(ring);
    addProp(group, x, 0.022, z, 0.042, spins[i], materials, props, disposables, shadows, 3);
  });
  const cam = mesh(
    new SphereGeometry(0.018, 10, 10),
    materials.cameraGlass,
    shadows,
    disposables,
  );
  cam.position.set(0, 0, -0.055);
  group.add(cam);
  addLeds(group, materials, lights, disposables, -0.04, 0.045, 0.015, 0.005);
}

/** Narrow exposed racing X. */
function buildRacing(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  group.add(
    mesh(new BoxGeometry(0.08, 0.035, 0.12), materials.canopy, shadows, disposables),
  );
  if (full) {
    const plate = mesh(
      new BoxGeometry(0.1, 0.006, 0.14),
      materials.primary,
      shadows,
      disposables,
    );
    plate.position.y = 0.02;
    group.add(plate);
    const ant = mesh(
      new CylinderGeometry(0.002, 0.002, 0.07, 6),
      materials.rubber,
      shadows,
      disposables,
    );
    ant.position.set(0.03, 0.05, 0.06);
    ant.rotation.z = 0.3;
    group.add(ant);
  }
  const arms: Array<[number, number, number]> = [
    [0.07, -0.07, Math.PI / 4],
    [-0.07, -0.07, -Math.PI / 4],
    [0.07, 0.07, -Math.PI / 4],
    [-0.07, 0.07, Math.PI / 4],
  ];
  const motors: Array<[number, number]> = [
    [0.14, -0.14],
    [-0.14, -0.14],
    [0.14, 0.14],
    [-0.14, 0.14],
  ];
  const spins = [1, -1, -1, 1];
  arms.forEach(([x, z, yaw]) => {
    const arm = mesh(
      new BoxGeometry(0.02, 0.014, 0.2),
      materials.secondary,
      shadows,
      disposables,
    );
    arm.position.set(x, 0, z);
    arm.rotation.y = yaw;
    group.add(arm);
  });
  motors.forEach(([x, z], i) => {
    const motor = mesh(
      new CylinderGeometry(0.025, 0.023, 0.025, 10),
      materials.metal,
      shadows,
      disposables,
    );
    motor.position.set(x, 0.02, z);
    group.add(motor);
    addProp(group, x, 0.035, z, 0.075, spins[i], materials, props, disposables, shadows);
  });
  const cage = mesh(
    new BoxGeometry(0.03, 0.028, 0.035),
    materials.accent,
    shadows,
    disposables,
  );
  cage.position.set(0, -0.005, -0.09);
  group.add(cage);
  addLeds(group, materials, lights, disposables, -0.06, 0.07);
}

/** Wider freestyle with top battery strap. */
function buildFreestyle(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  group.add(
    mesh(new BoxGeometry(0.18, 0.07, 0.22), materials.primary, shadows, disposables),
  );
  if (full) {
    const batt = mesh(
      new BoxGeometry(0.1, 0.04, 0.15),
      materials.battery,
      shadows,
      disposables,
    );
    batt.position.set(0, 0.05, 0.02);
    group.add(batt);
    const strap = mesh(
      new BoxGeometry(0.12, 0.008, 0.02),
      materials.rubber,
      shadows,
      disposables,
    );
    strap.position.set(0, 0.075, 0.02);
    group.add(strap);
  }
  const arms: Array<[number, number, number]> = [
    [0.09, -0.09, Math.PI / 4],
    [-0.09, -0.09, -Math.PI / 4],
    [0.09, 0.09, -Math.PI / 4],
    [-0.09, 0.09, Math.PI / 4],
  ];
  const motors: Array<[number, number]> = [
    [0.155, -0.155],
    [-0.155, -0.155],
    [0.155, 0.155],
    [-0.155, 0.155],
  ];
  const spins = [1, -1, -1, 1];
  arms.forEach(([x, z, yaw]) => {
    const arm = mesh(
      new BoxGeometry(0.036, 0.024, 0.28),
      materials.secondary,
      shadows,
      disposables,
    );
    arm.position.set(x, 0, z);
    arm.rotation.y = yaw;
    group.add(arm);
  });
  motors.forEach(([x, z], i) => {
    const motor = mesh(
      new CylinderGeometry(0.035, 0.032, 0.028, 12),
      materials.metal,
      shadows,
      disposables,
    );
    motor.position.set(x, 0.02, z);
    group.add(motor);
    addProp(group, x, 0.04, z, 0.09, spins[i], materials, props, disposables, shadows);
  });
  const cage = mesh(
    new BoxGeometry(0.045, 0.04, 0.05),
    materials.accent,
    shadows,
    disposables,
  );
  cage.position.set(0, -0.008, -0.1);
  group.add(cage);
  addLeds(group, materials, lights, disposables, -0.1, 0.1);
}

/** Long arms, large props, GPS-style module. */
function buildLongRange(
  group: Group,
  materials: AircraftVisualMaterials,
  props: DronePropVisual[],
  lights: DroneNavLight[],
  disposables: Array<BufferGeometry | Material>,
  shadows: boolean,
  full: boolean,
): void {
  group.add(
    mesh(new BoxGeometry(0.14, 0.07, 0.26), materials.primary, shadows, disposables),
  );
  if (full) {
    const batt = mesh(
      new BoxGeometry(0.1, 0.05, 0.18),
      materials.battery,
      shadows,
      disposables,
    );
    batt.position.set(0, -0.02, 0.14);
    group.add(batt);
    const gps = mesh(
      new BoxGeometry(0.04, 0.015, 0.04),
      materials.accent,
      shadows,
      disposables,
    );
    gps.position.set(0, 0.05, 0.02);
    group.add(gps);
    const ant = mesh(
      new CylinderGeometry(0.004, 0.004, 0.12, 6),
      materials.rubber,
      shadows,
      disposables,
    );
    ant.position.set(0.05, 0.1, 0.08);
    group.add(ant);
  }
  const arms: Array<[number, number, number]> = [
    [0.14, -0.14, Math.PI / 4],
    [-0.14, -0.14, -Math.PI / 4],
    [0.14, 0.14, -Math.PI / 4],
    [-0.14, 0.14, Math.PI / 4],
  ];
  const motors: Array<[number, number]> = [
    [0.26, -0.26],
    [-0.26, -0.26],
    [0.26, 0.26],
    [-0.26, 0.26],
  ];
  const spins = [1, -1, -1, 1];
  arms.forEach(([x, z, yaw]) => {
    const arm = mesh(
      new BoxGeometry(0.04, 0.025, 0.36),
      materials.secondary,
      shadows,
      disposables,
    );
    arm.position.set(x, 0, z);
    arm.rotation.y = yaw;
    group.add(arm);
  });
  motors.forEach(([x, z], i) => {
    const motor = mesh(
      new CylinderGeometry(0.042, 0.04, 0.032, 12),
      materials.metal,
      shadows,
      disposables,
    );
    motor.position.set(x, 0.025, z);
    group.add(motor);
    addProp(group, x, 0.05, z, 0.12, spins[i], materials, props, disposables, shadows);
  });
  const cam = mesh(
    new BoxGeometry(0.04, 0.035, 0.045),
    materials.canopy,
    shadows,
    disposables,
  );
  cam.position.set(0, 0, -0.15);
  group.add(cam);
  addLeds(group, materials, lights, disposables, -0.12, 0.14, 0.03, 0.01);
}
