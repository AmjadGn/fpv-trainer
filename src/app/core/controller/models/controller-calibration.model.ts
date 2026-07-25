export type FlightChannel = 'throttle' | 'yaw' | 'pitch' | 'roll';

export const FLIGHT_CHANNELS: readonly FlightChannel[] = [
  'throttle',
  'yaw',
  'pitch',
  'roll',
] as const;

export interface AxisCalibration {
  axisIndex: number;
  min: number;
  center: number;
  max: number;
  inverted: boolean;
  deadzone: number;
}

export interface ControllerCalibration {
  version: number;
  controllerId: string;
  controllerMapping: string;
  createdAt: string;
  updatedAt: string;
  channels: Record<FlightChannel, AxisCalibration>;
}

export interface CalibratedFlightInput {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export type CalibrationStep =
  | 'welcome'
  | 'center'
  | 'identify-throttle'
  | 'identify-yaw'
  | 'identify-pitch'
  | 'identify-roll'
  | 'range'
  | 'direction'
  | 'complete';

export type CalibrationStatus =
  | 'uncalibrated'
  | 'calibrating'
  | 'calibrated'
  | 'error';

export interface AxisRangeStats {
  axisIndex: number;
  min: number;
  current: number;
  max: number;
  span: number;
  adequate: boolean;
}

export interface ChannelRangeStats {
  channel: FlightChannel;
  stats: AxisRangeStats;
}

export const CALIBRATION_STORAGE_KEY =
  'fpv-trainer.controller-calibration.v1';

export const CALIBRATION_VERSION = 1;

export const DEFAULT_CENTERED_DEADZONE = 0.03;

export const CENTER_CAPTURE_MS = 800;

export const MOVEMENT_THRESHOLD = 0.35;

export const MIN_RANGE_SPAN = 0.45;

export const CENTER_STABILITY_MAX_DEVIATION = 0.025;

export const CHANNEL_INSTRUCTIONS: Record<FlightChannel, string> = {
  throttle:
    'Move the left stick fully from its lowest position to its highest position, then return it to the lowest position.',
  yaw: 'Move the left stick fully left and right, then release it.',
  pitch: 'Move the right stick fully forward and backward, then release it.',
  roll: 'Move the right stick fully left and right, then release it.',
};

export const STEP_TITLES: Record<CalibrationStep, string> = {
  welcome: 'Controller Calibration',
  center: 'Center Capture',
  'identify-throttle': 'Identify Throttle',
  'identify-yaw': 'Identify Yaw',
  'identify-pitch': 'Identify Pitch',
  'identify-roll': 'Identify Roll',
  range: 'Range Capture',
  direction: 'Direction Confirmation',
  complete: 'Calibration Complete',
};

export const WORKFLOW_STEPS: readonly CalibrationStep[] = [
  'welcome',
  'center',
  'identify-throttle',
  'identify-yaw',
  'identify-pitch',
  'identify-roll',
  'range',
  'direction',
  'complete',
] as const;
