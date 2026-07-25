/** Visual dimensions aligned with `DRONE_COLLIDER_DIMENSIONS` (meters). */
export const DRONE_VISUAL_DIMENSIONS = {
  body: { x: 0.18, y: 0.07, z: 0.22 },
  bodyHalfExtents: { x: 0.09, y: 0.035, z: 0.11 },
  armHalfExtents: { x: 0.018, y: 0.012, z: 0.14 },
  motorRadius: 0.035,
  motorHeight: 0.028,
  motorOffset: 0.155,
  propRadius: 0.13,
  propBladeWidth: 0.022,
  propBladeThickness: 0.004,
  propHubRadius: 0.012,
  battery: { x: 0.1, y: 0.04, z: 0.15 },
  batteryOffset: { x: 0, y: -0.03, z: 0.02 },
  plateThickness: 0.006,
  plateMargin: 0.012,
  cameraBody: { x: 0.028, y: 0.024, z: 0.032 },
  cameraOffset: { x: 0, y: -0.008, z: -0.1 },
  antennaRadius: 0.003,
  antennaHeight: 0.065,
  rxAntennaRadius: 0.002,
  rxAntennaLength: 0.045,
  wireRadius: 0.0012,
  fcStack: { x: 0.036, y: 0.018, z: 0.036 },
  ledRadius: 0.008,
  actionCam: { x: 0.034, y: 0.022, z: 0.028 },
} as const;

export const DRONE_ARM_LAYOUT: ReadonlyArray<{
  x: number;
  y: number;
  z: number;
  yaw: number;
}> = [
  { x: 0.09, y: 0, z: -0.09, yaw: Math.PI / 4 },
  { x: -0.09, y: 0, z: -0.09, yaw: -Math.PI / 4 },
  { x: 0.09, y: 0, z: 0.09, yaw: -Math.PI / 4 },
  { x: -0.09, y: 0, z: 0.09, yaw: Math.PI / 4 },
] as const;

export const DRONE_MOTOR_LAYOUT: ReadonlyArray<{
  x: number;
  y: number;
  z: number;
  spinDir: number;
}> = [
  { x: 0.155, y: 0.02, z: -0.155, spinDir: 1 },
  { x: -0.155, y: 0.02, z: -0.155, spinDir: -1 },
  { x: 0.155, y: 0.02, z: 0.155, spinDir: -1 },
  { x: -0.155, y: 0.02, z: 0.155, spinDir: 1 },
] as const;

export const DRONE_VISUAL_COLORS = {
  carbon: 0x141820,
  carbonWeave: 0x1a222c,
  motor: 0x5a6068,
  motorBell: 0x707880,
  prop: 0xc8d4e0,
  propBlur: 0xb8c4d0,
  battery: 0x2a3038,
  batteryLabel: 0x3a424c,
  batteryStrap: 0x1e2428,
  cameraBody: 0x101418,
  cameraLens: 0x182028,
  cameraCage: 0x282e36,
  antenna: 0x303840,
  wire: 0x181c20,
  fcPcb: 0x1a4030,
  fcSilk: 0x2a5848,
  ledFront: 0xf2f6fa,
  ledRear: 0xe04545,
  actionCam: 0x222830,
  actionCamLens: 0x101820,
} as const;

export const DRONE_MATERIAL_PARAMS = {
  carbon: { roughness: 0.55, metalness: 0.15 },
  motor: { roughness: 0.35, metalness: 0.72 },
  prop: { roughness: 0.65, metalness: 0.05, opacity: 0.82 },
  battery: { roughness: 0.6, metalness: 0.1 },
  camera: { roughness: 0.45, metalness: 0.2 },
  antenna: { roughness: 0.5, metalness: 0.35 },
  wire: { roughness: 0.7, metalness: 0.05 },
  fc: { roughness: 0.55, metalness: 0.12 },
  led: { roughness: 0.4, metalness: 0.1 },
} as const;
