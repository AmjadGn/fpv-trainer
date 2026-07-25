export interface AxisState {
  index: number;
  rawValue: number;
  normalizedValue: number;
  active: boolean;
}

export interface ButtonState {
  index: number;
  value: number;
  pressed: boolean;
  touched: boolean;
}

export interface ControllerSnapshot {
  connected: boolean;
  controllerName: string | null;
  controllerIndex: number | null;
  mapping: string | null;
  axes: AxisState[];
  buttons: ButtonState[];
  lastUpdated: number | null;
  apiAvailable: boolean;
}
