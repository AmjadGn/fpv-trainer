export interface ControllerProfile {
  id: string;
  displayName: string;
  gamepadIdPattern: string;
  axisMappings: Record<string, number>;
  buttonMappings: Record<string, number>;
  inversion: Record<string, boolean>;
  deadZones: Record<string, number>;
  sensitivity: Record<string, number>;
  throttleMode: 'mode1' | 'mode2' | 'custom';
  calibrationVersion: number;
  createdAt: string;
  updatedAt: string;
}

export const CONTROLLER_PROFILES_KEY = 'fpv-trainer.controller-profiles.v1';
export const ACTIVE_CONTROLLER_PROFILE_KEY = 'fpv-trainer.controller-profile-active.v1';
