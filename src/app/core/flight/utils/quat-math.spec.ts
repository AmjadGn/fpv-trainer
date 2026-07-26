import {
  bodyForwardWorld,
  bodyRatesToOmega,
  bodyRightWorld,
  bodyUpWorld,
  hamiltonProductAlloc,
  headingYawRad,
  integrateBodyRates,
  normalizeQuat,
  quatFromAxisAngle,
  quatLength,
  rotateVecByQuat,
  rotateVecByQuatAlloc,
  worldRotationAxisBetween,
} from './quat-math';
import type { Quat, Vec3 } from '../models/flight-state.model';

/**
 * Layer 1 — pure quaternion math.
 *
 * Analytic expectations use explicit rotation matrices / axis-angle formulas.
 * Expected vectors are NEVER produced by rotateVecByQuat / integrateBodyRates.
 */

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** R_y(+θ): (x,y,z) → (c x + s z, y, −s x + c z) */
function rotateYawPositiveY(v: Vec3, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: c * v.x + s * v.z,
    y: v.y,
    z: -s * v.x + c * v.z,
  };
}

function expectVecClose(actual: Vec3, expected: Vec3, tol = 1e-9): void {
  expect(actual.x).toBeCloseTo(expected.x, tolDigits(tol));
  expect(actual.y).toBeCloseTo(expected.y, tolDigits(tol));
  expect(actual.z).toBeCloseTo(expected.z, tolDigits(tol));
}

function tolDigits(tol: number): number {
  return Math.max(0, Math.ceil(-Math.log10(tol)) - 1);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

describe('quat-math Layer 1 — Hamilton / basis / integration', () => {
  describe('hamiltonProduct', () => {
    it('multiplies identity as a no-op', () => {
      const q = quatFromAxisAngle(0, 1, 0, Math.PI / 5);
      const left = hamiltonProductAlloc(IDENTITY, q);
      const right = hamiltonProductAlloc(q, IDENTITY);
      expect(left.x).toBeCloseTo(q.x, 12);
      expect(left.y).toBeCloseTo(q.y, 12);
      expect(left.z).toBeCloseTo(q.z, 12);
      expect(left.w).toBeCloseTo(q.w, 12);
      expect(right.w).toBeCloseTo(q.w, 12);
    });

    it('is non-commutative: q⊗ω ≠ ω⊗q for general values', () => {
      const q = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
      normalizeQuat(q);
      const w: Quat = { x: 0.4, y: -0.1, z: 0.2, w: 0 };
      const qw = hamiltonProductAlloc(q, w);
      const wq = hamiltonProductAlloc(w, q);
      expect(Math.hypot(qw.x - wq.x, qw.y - wq.y, qw.z - wq.z, qw.w - wq.w)).toBeGreaterThan(
        0.05,
      );
    });

    it('composition q2⊗q1 matches successive axis-angle about Y then X analytically', () => {
      // R = R_x(α) R_y(β) applied to vectors as q_total ⊗ v ⊗ q*
      // with q_total = q_x ⊗ q_y (body yaw then pitch about updated axes uses different order;
      // here we only check Hamilton composition equals axis-angle product formula).
      const beta = Math.PI / 6;
      const alpha = Math.PI / 7;
      const qY = quatFromAxisAngle(0, 1, 0, beta);
      const qX = quatFromAxisAngle(1, 0, 0, alpha);
      const composed = hamiltonProductAlloc(qX, qY);

      // Direct axis-angle for pure Y then pure X as quaternion multiply formula:
      // qX ⊗ qY closed form
      const hy = Math.sin(beta / 2);
      const cy = Math.cos(beta / 2);
      const hx = Math.sin(alpha / 2);
      const cx = Math.cos(alpha / 2);
      // (hx,0,0,cx) ⊗ (0,hy,0,cy)
      const expected: Quat = {
        x: cx * 0 + hx * cy + 0 * 0 - 0 * hy,
        y: cx * hy - hx * 0 + 0 * cy + 0 * 0,
        z: cx * 0 + hx * hy - 0 * 0 + 0 * cy,
        w: cx * cy - hx * 0 - 0 * hy - 0 * 0,
      };
      // Expand properly:
      // a⊗b: x=aw bx + ax bw + ay bz − az by
      expected.x = cx * 0 + hx * cy + 0 * 0 - 0 * hy; // hx*cy
      expected.y = cx * hy - hx * 0 + 0 * cy + 0 * 0; // cx*hy
      expected.z = cx * 0 + hx * hy - 0 * 0 + 0 * cy; // hx*hy
      expected.w = cx * cy - hx * 0 - 0 * hy - 0 * 0; // cx*cy

      expect(composed.x).toBeCloseTo(hx * cy, 12);
      expect(composed.y).toBeCloseTo(cx * hy, 12);
      expect(composed.z).toBeCloseTo(hx * hy, 12);
      expect(composed.w).toBeCloseTo(cx * cy, 12);
    });
  });

  describe('rotateVecByQuat vs analytic matrices', () => {
    it('identity maps local basis to world basis', () => {
      expectVecClose(rotateVecByQuatAlloc(0, 0, -1, IDENTITY), {
        x: 0,
        y: 0,
        z: -1,
      });
      expectVecClose(rotateVecByQuatAlloc(1, 0, 0, IDENTITY), {
        x: 1,
        y: 0,
        z: 0,
      });
      expectVecClose(rotateVecByQuatAlloc(0, 1, 0, IDENTITY), {
        x: 0,
        y: 1,
        z: 0,
      });
    });

    it('matches q⊗v⊗q* Hamilton sandwich (independent expansion)', () => {
      const q = quatFromAxisAngle(0, 1, 0, Math.PI / 3);
      const v = { x: 0.2, y: -0.5, z: 0.8 };
      const pure: Quat = { x: v.x, y: v.y, z: v.z, w: 0 };
      const conj: Quat = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      const sandwich = hamiltonProductAlloc(
        hamiltonProductAlloc(q, pure),
        conj,
      );
      const runtime = rotateVecByQuatAlloc(v.x, v.y, v.z, q);
      expect(runtime.x).toBeCloseTo(sandwich.x, 10);
      expect(runtime.y).toBeCloseTo(sandwich.y, 10);
      expect(runtime.z).toBeCloseTo(sandwich.z, 10);
    });

    it('does NOT match conjugate(q)⊗v⊗q (world→body form)', () => {
      const q = quatFromAxisAngle(0, 1, 0, Math.PI / 2);
      const conj: Quat = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      const pure: Quat = { x: 0, y: 0, z: -1, w: 0 };
      const wrongWay = hamiltonProductAlloc(
        hamiltonProductAlloc(conj, pure),
        q,
      );
      const runtime = rotateVecByQuatAlloc(0, 0, -1, q);
      // Analytic R_y(+π/2) on forward (0,0,-1) → (-1,0,0)
      expectVecClose(runtime, { x: -1, y: 0, z: 0 });
      // Conjugate form yields the opposite yaw sense.
      expect(wrongWay.x).toBeCloseTo(1, 10);
      expect(Math.abs(runtime.x - wrongWay.x)).toBeGreaterThan(1);
    });

    it('yaw +90° (analytic R_y(+π/2)) maps basis vectors', () => {
      // Positive-yaw convention for axis-angle about +Y (right-hand).
      // Repository stick "+yaw = turn right" uses ω_y = −yaw, so a +90° *heading*
      // right turn is R_y(−π/2). This test proves the *math helper* for +Y rotation.
      const q = quatFromAxisAngle(0, 1, 0, Math.PI / 2);
      const fwd = { x: 0, y: 0, z: -1 };
      const right = { x: 1, y: 0, z: 0 };
      const up = { x: 0, y: 1, z: 0 };
      expectVecClose(
        rotateVecByQuatAlloc(fwd.x, fwd.y, fwd.z, q),
        rotateYawPositiveY(fwd, Math.PI / 2),
      );
      expectVecClose(
        rotateVecByQuatAlloc(right.x, right.y, right.z, q),
        rotateYawPositiveY(right, Math.PI / 2),
      );
      expectVecClose(
        rotateVecByQuatAlloc(up.x, up.y, up.z, q),
        rotateYawPositiveY(up, Math.PI / 2),
      );
      // Documented numeric targets for R_y(+π/2):
      expectVecClose(rotateYawPositiveY(fwd, Math.PI / 2), {
        x: -1,
        y: 0,
        z: 0,
      });
      expectVecClose(rotateYawPositiveY(right, Math.PI / 2), {
        x: 0,
        y: 0,
        z: -1,
      });
      expectVecClose(rotateYawPositiveY(up, Math.PI / 2), { x: 0, y: 1, z: 0 });
    });

    it('yaw 180° maps forward/right opposite spawn', () => {
      const q = quatFromAxisAngle(0, 1, 0, Math.PI);
      expectVecClose(rotateVecByQuatAlloc(0, 0, -1, q), { x: 0, y: 0, z: 1 });
      expectVecClose(rotateVecByQuatAlloc(1, 0, 0, q), { x: -1, y: 0, z: 0 });
      expectVecClose(rotateVecByQuatAlloc(0, 1, 0, q), { x: 0, y: 1, z: 0 });
    });
  });

  describe('body rate signs and integration order', () => {
    it('maps stick rates to ω with documented nose-down / turn-right / bank-right', () => {
      const p = bodyRatesToOmega(2, 0, 0);
      expect(p.wx).toBe(-2);
      expect(p.wy).toBeCloseTo(0, 12);
      expect(p.wz).toBeCloseTo(0, 12);
      const y = bodyRatesToOmega(0, 3, 0);
      expect(y.wx).toBeCloseTo(0, 12);
      expect(y.wy).toBe(-3);
      expect(y.wz).toBeCloseTo(0, 12);
      const r = bodyRatesToOmega(0, 0, 4);
      expect(r.wx).toBeCloseTo(0, 12);
      expect(r.wy).toBeCloseTo(0, 12);
      expect(r.wz).toBe(-4);
    });

    it('+pitch from identity tips thrust toward world −Z (course / nose forward)', () => {
      const q: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      // 0.4 rad nose-down about −X
      integrateBodyRates(q, 0.4 / (1 / 120), 0, 0, 1 / 120, scratch);
      const up = bodyUpWorld(q);
      // Analytic R_x(−0.4) on (0,1,0) ≈ (0, cos, −sin)
      expect(up.z).toBeLessThan(-0.3);
      expect(up.y).toBeGreaterThan(0.8);
      expect(Math.abs(up.x)).toBeLessThan(0.05);
    });

    it('+yaw from identity turns nose toward +X (right)', () => {
      const q: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      const dt = 1 / 120;
      const rate = 2;
      const steps = Math.round(Math.PI / 2 / rate / dt);
      for (let i = 0; i < steps; i++) {
        integrateBodyRates(q, 0, rate, 0, dt, scratch);
      }
      const f = bodyForwardWorld(q);
      // Analytic R_y(−π/2) on (0,0,-1) → (+1,0,0)
      expect(f.x).toBeGreaterThan(0.95);
      expect(Math.abs(f.z)).toBeLessThan(0.1);
      expect(headingYawRad(q)).toBeCloseTo(Math.PI / 2, 1);
    });

    it('after yaw +90° right, +pitch world axis equals current body-right', () => {
      const q: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      const dt = 1 / 120;
      const yawRate = 2;
      const yawSteps = Math.round(Math.PI / 2 / yawRate / dt);
      for (let i = 0; i < yawSteps; i++) {
        integrateBodyRates(q, 0, yawRate, 0, dt, scratch);
      }
      const qBefore: Quat = { ...q };
      const right = bodyRightWorld(qBefore);
      for (let i = 0; i < 25; i++) {
        integrateBodyRates(q, 3, 0, 0, dt, scratch);
      }
      const axis = worldRotationAxisBetween(qBefore, q);
      expect(axis).not.toBeNull();
      // Nose-down is about −body-right; world axis may be ±right depending on delta sign.
      expect(Math.abs(dot(axis!, right))).toBeGreaterThan(0.98);
    });

    it('after yaw +90° right, +pitch tilts thrust along new nose (+X), not spawn −Z', () => {
      const q: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      const dt = 1 / 120;
      const yawRate = 2;
      for (let i = 0; i < Math.round(Math.PI / 2 / yawRate / dt); i++) {
        integrateBodyRates(q, 0, yawRate, 0, dt, scratch);
      }
      for (let i = 0; i < 30; i++) {
        integrateBodyRates(q, 3, 0, 0, dt, scratch);
      }
      const up = bodyUpWorld(q);
      expect(up.x).toBeGreaterThan(0.5);
      expect(Math.abs(up.z)).toBeLessThan(Math.abs(up.x) * 0.35);
    });

    it('q⊗ω (used) differs from ω⊗q after yaw-then-pitch', () => {
      const dt = 1 / 120;
      const yawRate = 2;
      const steps = Math.round(Math.PI / 2 / yawRate / dt);

      const qBody: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      for (let i = 0; i < steps; i++) {
        integrateBodyRates(qBody, 0, yawRate, 0, dt, scratch);
      }
      for (let i = 0; i < 30; i++) {
        integrateBodyRates(qBody, 3, 0, 0, dt, scratch);
      }

      // Hand-rolled world-rate integrator (ω⊗q) for contrast.
      let qWorld: Quat = { ...IDENTITY };
      const integWorld = (pitch: number, yaw: number, roll: number) => {
        const { wx, wy, wz } = bodyRatesToOmega(pitch, yaw, roll);
        const halfDt = 0.5 * dt;
        const dq = {
          x: halfDt * (wy * qWorld.z - wz * qWorld.y + wx * qWorld.w),
          y: halfDt * (wz * qWorld.x - wx * qWorld.z + wy * qWorld.w),
          z: halfDt * (wx * qWorld.y - wy * qWorld.x + wz * qWorld.w),
          w: halfDt * (-wx * qWorld.x - wy * qWorld.y - wz * qWorld.z),
        };
        qWorld = {
          x: qWorld.x + dq.x,
          y: qWorld.y + dq.y,
          z: qWorld.z + dq.z,
          w: qWorld.w + dq.w,
        };
        normalizeQuat(qWorld);
      };
      for (let i = 0; i < steps; i++) integWorld(0, yawRate, 0);
      for (let i = 0; i < 30; i++) integWorld(3, 0, 0);

      const upBody = bodyUpWorld(qBody);
      const upWorld = bodyUpWorld(qWorld);
      // Body-frame thrusts along +X; world-rate form stays near spawn −Z.
      expect(Math.abs(upBody.x)).toBeGreaterThan(0.5);
      expect(Math.abs(upWorld.z)).toBeGreaterThan(0.5);
      expect(Math.abs(upBody.x - upWorld.x)).toBeGreaterThan(0.4);
    });

    it('keeps unit length under mixed rates', () => {
      const q: Quat = { ...IDENTITY };
      const scratch: Quat = { x: 0, y: 0, z: 0, w: 1 };
      for (let i = 0; i < 500; i++) {
        integrateBodyRates(q, 2.1, -1.4, 0.8, 1 / 120, scratch);
      }
      expect(quatLength(q)).toBeCloseTo(1, 6);
    });
  });

  describe('basis helpers', () => {
    it('bodyForwardWorld / right / up match rotate of basis', () => {
      const q = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
      const out: Vec3 = { x: 0, y: 0, z: 0 };
      rotateVecByQuat(0, 0, -1, q, out);
      expectVecClose(bodyForwardWorld(q), out);
      expectVecClose(bodyRightWorld(q), rotateVecByQuatAlloc(1, 0, 0, q));
      expectVecClose(bodyUpWorld(q), rotateVecByQuatAlloc(0, 1, 0, q));
    });
  });
});
