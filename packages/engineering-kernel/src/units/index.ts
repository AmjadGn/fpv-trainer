/**
 * SI unit wrappers. All engineering math uses these internally.
 * UI conversions happen only at system boundaries.
 */

export type Kilograms = number & { readonly __unit: 'kg' };
export type Meters = number & { readonly __unit: 'm' };
export type Newtons = number & { readonly __unit: 'N' };
export type NewtonMeters = number & { readonly __unit: 'Nm' };
export type Volts = number & { readonly __unit: 'V' };
export type Amperes = number & { readonly __unit: 'A' };
export type AmpereHours = number & { readonly __unit: 'Ah' };
export type RadiansPerSecond = number & { readonly __unit: 'rad/s' };
export type KilogramMeterSquared = number & { readonly __unit: 'kg·m²' };
export type Watts = number & { readonly __unit: 'W' };
export type Ohms = number & { readonly __unit: 'Ω' };
export type Seconds = number & { readonly __unit: 's' };

export const kg = (n: number): Kilograms => n as Kilograms;
export const m = (n: number): Meters => n as Meters;
export const N = (n: number): Newtons => n as Newtons;
export const Nm = (n: number): NewtonMeters => n as NewtonMeters;
export const V = (n: number): Volts => n as Volts;
export const A = (n: number): Amperes => n as Amperes;
export const Ah = (n: number): AmpereHours => n as AmpereHours;
export const radPerS = (n: number): RadiansPerSecond => n as RadiansPerSecond;
export const kgm2 = (n: number): KilogramMeterSquared =>
  n as KilogramMeterSquared;
export const W = (n: number): Watts => n as Watts;
export const ohm = (n: number): Ohms => n as Ohms;
export const s = (n: number): Seconds => n as Seconds;

export const gramsToKg = (grams: number): Kilograms => kg(grams / 1000);
export const mmToM = (mm: number): Meters => m(mm / 1000);
export const mAhToAh = (mAh: number): AmpereHours => Ah(mAh / 1000);

export interface Vec3Si {
  readonly x: Meters;
  readonly y: Meters;
  readonly z: Meters;
}

export function vec3(x: number, y: number, z: number): Vec3Si {
  return { x: m(x), y: m(y), z: m(z) };
}
