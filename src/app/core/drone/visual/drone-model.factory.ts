import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';

import {
  DRONE_ARM_LAYOUT,
  DRONE_MATERIAL_PARAMS,
  DRONE_MOTOR_LAYOUT,
  DRONE_VISUAL_COLORS,
  DRONE_VISUAL_DIMENSIONS,
} from '../config/drone-visual.config';

export interface DronePropVisual {
  group: Group;
  blades: Mesh[];
  blur: Mesh;
  spinDir: number;
}

export interface DroneNavLight {
  mesh: Mesh;
  material: MeshStandardMaterial;
  kind: 'front' | 'rear';
}

export interface SharedDroneMaterials {
  carbon: MeshStandardMaterial;
  carbonDark: MeshStandardMaterial;
  motor: MeshStandardMaterial;
  motorBell: MeshStandardMaterial;
  prop: MeshStandardMaterial;
  battery: MeshStandardMaterial;
  batteryStrap: MeshStandardMaterial;
  cameraBody: MeshStandardMaterial;
  cameraLens: MeshStandardMaterial;
  cameraCage: MeshStandardMaterial;
  antenna: MeshStandardMaterial;
  wire: MeshStandardMaterial;
  fcPcb: MeshStandardMaterial;
  fcSilk: MeshStandardMaterial;
  ledFront: MeshStandardMaterial;
  ledRear: MeshStandardMaterial;
  actionCam: MeshStandardMaterial;
  actionCamLens: MeshStandardMaterial;
}

export interface DroneModelResult {
  group: Group;
  props: DronePropVisual[];
  lights: DroneNavLight[];
  disposables: Array<BufferGeometry | Material>;
  materials: SharedDroneMaterials;
}

export interface CreateDroneModelOptions {
  shadows: boolean;
  lod?: 'fpv' | 'chase' | 'full';
  showProps?: boolean;
}

export function createSharedDroneMaterials(): SharedDroneMaterials {
  const { carbon, motor, prop, battery, camera, antenna, wire, fc, led } =
    DRONE_MATERIAL_PARAMS;

  const mkStd = (
    color: number,
    params: { roughness: number; metalness: number; opacity?: number },
  ): MeshStandardMaterial => {
    const mat = new MeshStandardMaterial({
      color,
      roughness: params.roughness,
      metalness: params.metalness,
    });
    if (params.opacity !== undefined && params.opacity < 1) {
      mat.transparent = true;
      mat.opacity = params.opacity;
      mat.depthWrite = false;
    }
    return mat;
  };

  const ledFront = mkStd(DRONE_VISUAL_COLORS.ledFront, led);
  ledFront.emissive = new Color(DRONE_VISUAL_COLORS.ledFront);
  ledFront.emissiveIntensity = 0.35;

  const ledRear = mkStd(DRONE_VISUAL_COLORS.ledRear, led);
  ledRear.emissive = new Color(DRONE_VISUAL_COLORS.ledRear);
  ledRear.emissiveIntensity = 0.35;

  return {
    carbon: mkStd(DRONE_VISUAL_COLORS.carbon, carbon),
    carbonDark: mkStd(DRONE_VISUAL_COLORS.carbonWeave, carbon),
    motor: mkStd(DRONE_VISUAL_COLORS.motor, motor),
    motorBell: mkStd(DRONE_VISUAL_COLORS.motorBell, motor),
    prop: mkStd(DRONE_VISUAL_COLORS.prop, prop),
    battery: mkStd(DRONE_VISUAL_COLORS.battery, battery),
    batteryStrap: mkStd(DRONE_VISUAL_COLORS.batteryStrap, {
      roughness: 0.75,
      metalness: 0.02,
    }),
    cameraBody: mkStd(DRONE_VISUAL_COLORS.cameraBody, camera),
    cameraLens: mkStd(DRONE_VISUAL_COLORS.cameraLens, {
      roughness: 0.2,
      metalness: 0.4,
    }),
    cameraCage: mkStd(DRONE_VISUAL_COLORS.cameraCage, carbon),
    antenna: mkStd(DRONE_VISUAL_COLORS.antenna, antenna),
    wire: mkStd(DRONE_VISUAL_COLORS.wire, wire),
    fcPcb: mkStd(DRONE_VISUAL_COLORS.fcPcb, fc),
    fcSilk: mkStd(DRONE_VISUAL_COLORS.fcSilk, fc),
    ledFront,
    ledRear,
    actionCam: mkStd(DRONE_VISUAL_COLORS.actionCam, camera),
    actionCamLens: mkStd(DRONE_VISUAL_COLORS.actionCamLens, {
      roughness: 0.25,
      metalness: 0.35,
    }),
  };
}

export function createRealisticDroneModel(
  options: CreateDroneModelOptions,
): DroneModelResult {
  const { shadows, lod = 'full', showProps = true } = options;
  const fullDetail = lod !== 'fpv';
  const d = DRONE_VISUAL_DIMENSIONS;

  const group = new Group();
  const props: DronePropVisual[] = [];
  const lights: DroneNavLight[] = [];
  const disposables: Array<BufferGeometry | Material> = [];

  const materials = createSharedDroneMaterials();
  disposables.push(
    materials.carbon,
    materials.carbonDark,
    materials.motor,
    materials.motorBell,
    materials.prop,
    materials.battery,
    materials.batteryStrap,
    materials.cameraBody,
    materials.cameraLens,
    materials.cameraCage,
    materials.antenna,
    materials.wire,
    materials.fcPcb,
    materials.fcSilk,
    materials.ledFront,
    materials.ledRear,
    materials.actionCam,
    materials.actionCamLens,
  );

  const bodyGeo = new BoxGeometry(d.body.x, d.body.y, d.body.z);
  const armGeo = new BoxGeometry(
    d.armHalfExtents.x * 2,
    d.armHalfExtents.y * 2,
    d.armHalfExtents.z * 2,
  );
  const plateGeo = new BoxGeometry(
    d.body.x + d.plateMargin * 2,
    d.plateThickness,
    d.body.z + d.plateMargin * 2,
  );
  const motorGeo = new CylinderGeometry(
    d.motorRadius,
    d.motorRadius * 0.92,
    d.motorHeight,
    12,
  );
  const motorBellGeo = new CylinderGeometry(
    d.motorRadius * 0.55,
    d.motorRadius * 0.7,
    d.motorHeight * 0.35,
    10,
  );
  const propBladeGeo = new BoxGeometry(
    d.propRadius * 2,
    d.propBladeThickness,
    d.propBladeWidth,
  );
  const propHubGeo = new CylinderGeometry(
    d.propHubRadius,
    d.propHubRadius,
    d.propBladeThickness * 2,
    8,
  );
  const blurGeo = new CylinderGeometry(
    d.propRadius,
    d.propRadius,
    0.004,
    20,
  );
  const batteryGeo = new BoxGeometry(d.battery.x, d.battery.y, d.battery.z);
  const strapGeo = new BoxGeometry(d.battery.x + 0.008, 0.006, 0.012);
  const wireLeadGeo = new CylinderGeometry(0.002, 0.002, 0.035, 6);
  const cameraBodyGeo = new BoxGeometry(
    d.cameraBody.x,
    d.cameraBody.y,
    d.cameraBody.z,
  );
  const cameraLensGeo = new CylinderGeometry(0.009, 0.009, 0.008, 10);
  const cageBarGeo = new BoxGeometry(0.003, 0.003, 0.038);
  const fcGeo = new BoxGeometry(d.fcStack.x, d.fcStack.y, d.fcStack.z);
  const fcCapGeo = new BoxGeometry(d.fcStack.x * 0.85, 0.004, d.fcStack.z * 0.85);
  const antennaGeo = new CylinderGeometry(
    d.antennaRadius,
    d.antennaRadius * 0.7,
    d.antennaHeight,
    6,
  );
  const rxAntennaGeo = new CylinderGeometry(
    d.rxAntennaRadius,
    d.rxAntennaRadius,
    d.rxAntennaLength,
    6,
  );
  const wireGeo = new CylinderGeometry(d.wireRadius, d.wireRadius, 1, 4);
  const ledGeo = new SphereGeometry(d.ledRadius, 8, 8);
  const actionCamGeo = new BoxGeometry(
    d.actionCam.x,
    d.actionCam.y,
    d.actionCam.z,
  );
  const actionCamLensGeo = new CylinderGeometry(0.012, 0.012, 0.006, 10);

  disposables.push(
    bodyGeo,
    armGeo,
    plateGeo,
    motorGeo,
    motorBellGeo,
    propBladeGeo,
    propHubGeo,
    blurGeo,
    batteryGeo,
    strapGeo,
    wireLeadGeo,
    cameraBodyGeo,
    cameraLensGeo,
    cageBarGeo,
    fcGeo,
    fcCapGeo,
    antennaGeo,
    rxAntennaGeo,
    wireGeo,
    ledGeo,
    actionCamGeo,
    actionCamLensGeo,
  );

  const addMesh = (
    geo: BufferGeometry,
    mat: Material,
    castShadow = shadows,
  ): Mesh => {
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = shadows;
    return mesh;
  };

  const bottomPlate = addMesh(plateGeo, materials.carbonDark);
  bottomPlate.position.y = -d.body.y * 0.5 - d.plateThickness * 0.5;
  group.add(bottomPlate);

  const topPlate = addMesh(plateGeo, materials.carbon);
  topPlate.position.y = d.body.y * 0.5 + d.plateThickness * 0.5;
  group.add(topPlate);

  const body = addMesh(bodyGeo, materials.carbon);
  group.add(body);

  for (const arm of DRONE_ARM_LAYOUT) {
    const armMesh = addMesh(armGeo, materials.carbonDark);
    armMesh.position.set(arm.x, arm.y, arm.z);
    armMesh.rotation.y = arm.yaw;
    group.add(armMesh);
  }

  const battery = addMesh(batteryGeo, materials.battery);
  battery.position.set(
    d.batteryOffset.x,
    d.batteryOffset.y,
    d.batteryOffset.z,
  );
  group.add(battery);

  if (fullDetail) {
    const strap = addMesh(strapGeo, materials.batteryStrap, false);
    strap.position.set(
      d.batteryOffset.x,
      d.batteryOffset.y + d.battery.y * 0.5 + 0.003,
      d.batteryOffset.z - d.battery.z * 0.35,
    );
    group.add(strap);

    const lead = addMesh(wireLeadGeo, materials.wire, false);
    lead.rotation.x = Math.PI / 2;
    lead.position.set(0, d.batteryOffset.y, d.batteryOffset.z + d.battery.z * 0.42);
    group.add(lead);
  }

  const fc = addMesh(fcGeo, materials.fcPcb, false);
  fc.position.set(0, d.body.y * 0.5 + d.fcStack.y * 0.5 + 0.002, 0.01);
  fc.visible = fullDetail;
  group.add(fc);

  const fcCap = addMesh(fcCapGeo, materials.fcSilk, false);
  fcCap.position.copy(fc.position);
  fcCap.position.y += d.fcStack.y * 0.5 + 0.002;
  fcCap.visible = fullDetail;
  group.add(fcCap);

  const camGroup = new Group();
  camGroup.position.set(
    d.cameraOffset.x,
    d.cameraOffset.y,
    d.cameraOffset.z,
  );
  const camBody = addMesh(cameraBodyGeo, materials.cameraBody, false);
  camGroup.add(camBody);
  const camLens = addMesh(cameraLensGeo, materials.cameraLens, false);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 0, -d.cameraBody.z * 0.5 - 0.004);
  camGroup.add(camLens);

  if (fullDetail) {
    for (const [px, py, pz] of [
      [-0.014, 0.012, -0.01],
      [0.014, 0.012, -0.01],
      [-0.014, -0.012, -0.01],
      [0.014, -0.012, -0.01],
    ] as const) {
      const bar = addMesh(cageBarGeo, materials.cameraCage, false);
      bar.position.set(px, py, pz);
      camGroup.add(bar);
    }
  }
  group.add(camGroup);

  if (fullDetail) {
    const vtxAntenna = addMesh(antennaGeo, materials.antenna, false);
    vtxAntenna.position.set(0.04, d.body.y * 0.5 + 0.01, 0.06);
    vtxAntenna.rotation.z = -0.35;
    group.add(vtxAntenna);

    for (const sx of [-0.035, 0.035] as const) {
      const rx = addMesh(rxAntennaGeo, materials.antenna, false);
      rx.position.set(sx, d.body.y * 0.5, 0.08);
      rx.rotation.x = 0.55;
      rx.rotation.z = sx > 0 ? -0.25 : 0.25;
      group.add(rx);
    }
  }

  if (fullDetail) {
    const actionCam = addMesh(actionCamGeo, materials.actionCam, false);
    actionCam.position.set(0, d.body.y * 0.5 + d.actionCam.y * 0.5 + 0.014, -0.02);
    group.add(actionCam);

    const actionLens = addMesh(actionCamLensGeo, materials.actionCamLens, false);
    actionLens.rotation.x = Math.PI / 2;
    actionLens.position.set(0, actionCam.position.y, -0.02 - d.actionCam.z * 0.5);
    group.add(actionLens);
  }

  const mkLight = (
    kind: 'front' | 'rear',
    mat: MeshStandardMaterial,
    px: number,
    py: number,
    pz: number,
  ): void => {
    const mesh = addMesh(ledGeo, mat, false);
    mesh.position.set(px, py, pz);
    group.add(mesh);
    lights.push({ mesh, material: mat, kind });
  };
  mkLight('front', materials.ledFront, 0.05, 0.018, -d.body.z * 0.45);
  mkLight('front', materials.ledFront, -0.05, 0.018, -d.body.z * 0.45);
  mkLight('rear', materials.ledRear, 0.045, 0.018, d.body.z * 0.42);
  mkLight('rear', materials.ledRear, -0.045, 0.018, d.body.z * 0.42);

  const blurMatTemplate = new MeshBasicMaterial({
    color: DRONE_VISUAL_COLORS.propBlur,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  disposables.push(blurMatTemplate);

  for (const motor of DRONE_MOTOR_LAYOUT) {
    const motorMesh = addMesh(motorGeo, materials.motor);
    motorMesh.position.set(motor.x, motor.y, motor.z);
    group.add(motorMesh);

    const bell = addMesh(motorBellGeo, materials.motorBell, false);
    bell.position.set(motor.x, motor.y + d.motorHeight * 0.32, motor.z);
    group.add(bell);

    if (fullDetail) {
      const dx = motor.x;
      const dz = motor.z;
      const len = Math.hypot(dx, dz) || 1;
      const wire = addMesh(wireGeo, materials.wire, false);
      wire.scale.set(1, len * 0.55, 1);
      wire.position.set(dx * 0.45, motor.y - 0.008, dz * 0.45);
      wire.rotation.x = Math.PI / 2;
      wire.rotation.z = Math.atan2(dx, dz);
      group.add(wire);
    }

    if (!showProps) {
      continue;
    }

    const propGroup = new Group();
    propGroup.position.set(motor.x, motor.y + d.motorHeight * 0.55, motor.z);

    const hub = addMesh(propHubGeo, materials.prop, false);
    propGroup.add(hub);

    const blades: Mesh[] = [];
    for (let b = 0; b < 3; b++) {
      const blade = addMesh(propBladeGeo, materials.prop, false);
      blade.rotation.y = (b * Math.PI * 2) / 3;
      propGroup.add(blade);
      blades.push(blade);
    }

    const blurMat = blurMatTemplate.clone();
    disposables.push(blurMat);
    const blur = new Mesh(blurGeo, blurMat);
    blur.visible = false;
    propGroup.add(blur);

    group.add(propGroup);
    props.push({
      group: propGroup,
      blades,
      blur,
      spinDir: motor.spinDir,
    });
  }

  return { group, props, lights, disposables, materials };
}
