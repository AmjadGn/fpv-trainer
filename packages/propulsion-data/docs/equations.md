# Propulsion interpolation & voltage equations (v1.1.2)

## Piecewise-linear interpolation (`1.1.2-piecewise-linear`)

### Primary path

Independent variable: `normalizedDriveCommand` ∈ [0, 1].

Given adjacent validated points `(c0, y0)` and `(c1, y1)` with `c0 ≤ c ≤ c1`:

```text
t = (c − c0) / (c1 − c0)          (dimensionless)
y(c) = y0 + (y1 − y0) · t         (same SI unit as y)
```

Applied independently to: static thrust (N), current (A), electrical power (W),
RPM, torque (N·m), efficiency (dimensionless), voltage (V).

| Item | Value |
|---|---|
| Inputs | Ordered operating points; query command |
| Outputs | SI fields listed above |
| Valid range | `[min(c), max(c)]` of dataset |
| Assumptions | Linear segments; no hidden smoothing |
| Failure | Empty points → throw; outside envelope → clamp (default) |
| Confidence | high interior/exact; medium when clamped |
| Extrapolation | Disabled by default |

Quantization: `quantize(n)` at 1e9 scale after each interpolated scalar.

## Voltage model (`1.1.2-exact-voltage`)

Exact match when `|V_battery_nominal − V_dataset_test| ≤ tolerance` (default 0.05 V).

Voltage interpolation between datasets is **not** enabled in v1.1.2 presets.

### Legacy peakThrustHint voltage factor (fallback only)

```text
voltageFactor = clamp(V_nominal / 14.8, 0.5, 1.6)
thrust ≈ peakThrustHintNewtons · (0.85 + Ct) · voltageFactor
```

This is an explicit low-confidence approximation, not a measured voltage model.
