import { describe, it, expect } from 'vitest';
import {
  type PhysicsState,
  ExplicitEulerIntegrator,
  SemiImplicitEulerIntegrator,
  RK4Integrator
} from '../src/core/Integrator.ts';

// ── Test System: Undamped Spring ─────────────────────────────────────────────
// m * y'' = -k * y
// state: { v, y }
// derivative: { v: - (k/m) * y, y: v }
// Analytic solution (y0 = 1, v0 = 0):
// w = sqrt(k/m)
// y(t) = cos(w * t)
// v(t) = -w * sin(w * t)
// Energy: E = 0.5 * m * v^2 + 0.5 * k * y^2
// ─────────────────────────────────────────────────────────────────────────────

describe('Numerical Integrator Divergence', () => {
  const m = 1;
  const k = 1; // w = 1
  const dt = 0.05; // Relatively large dt to exaggerate numerical errors
  const steps = 1000;

  const derivative = (state: PhysicsState, params: Record<string, number>): PhysicsState => {
    return {
      v: -(k / m) * state.y,
      y: state.v
    };
  };

  const getEnergy = (state: PhysicsState) => {
    return 0.5 * m * state.v * state.v + 0.5 * k * state.y * state.y;
  };

  const analyticY = (t: number) => Math.cos(t);

  it('proves integrators exhibit genuinely different numerical divergence patterns', () => {
    const euler = new ExplicitEulerIntegrator();
    const semiImplicit = new SemiImplicitEulerIntegrator();
    const rk4 = new RK4Integrator();

    // Order matters for Semi-Implicit Euler to be Symplectic (Velocity first)
    let stateEuler: PhysicsState = { v: 0, y: 1 };
    let stateSemi: PhysicsState = { v: 0, y: 1 };
    let stateRK4: PhysicsState = { v: 0, y: 1 };

    const initialEnergy = getEnergy(stateEuler);
    
    let eulerEnergy10 = 0;
    let maxSemiEnergyDev = 0;

    let eulerTotalError = 0;
    let rk4TotalError = 0;

    for (let i = 1; i <= steps; i++) {
      const t = i * dt;

      // ── Step ───────────────────────────────────────────────────────────────
      stateEuler = euler.step(stateEuler, derivative, {}, dt);
      stateSemi = semiImplicit.step(stateSemi, derivative, {}, dt);
      stateRK4 = rk4.step(stateRK4, derivative, {}, dt);

      // ── Energy Tracking ────────────────────────────────────────────────────
      const eulerE = getEnergy(stateEuler);
      const semiE = getEnergy(stateSemi);
      
      if (i === 10) eulerEnergy10 = eulerE;
      
      const semiDev = Math.abs(semiE - initialEnergy) / initialEnergy;
      if (semiDev > maxSemiEnergyDev) maxSemiEnergyDev = semiDev;

      // ── Accuracy Tracking ──────────────────────────────────────────────────
      const trueY = analyticY(t);
      eulerTotalError += Math.abs(stateEuler.y - trueY);
      rk4TotalError += Math.abs(stateRK4.y - trueY);

      // ── Midpoint check to prove they aren't generating identical paths ───
      if (i === 500) {
        expect(Math.abs(stateEuler.y - stateRK4.y)).toBeGreaterThan(1e-9);
        expect(Math.abs(stateSemi.y - stateRK4.y)).toBeGreaterThan(1e-9);
      }
    }

    const eulerFinalE = getEnergy(stateEuler);

    // Assertion 1: Explicit Euler's energy STRICTLY INCREASES over time (diverges)
    // Expect final energy to be >5% larger than energy at step 10
    expect(eulerFinalE).toBeGreaterThan(eulerEnergy10 * 1.05);

    // Assertion 2: Semi-Implicit Euler's energy stays BOUNDED
    // Expect maximum energy deviation across 1000 steps to stay within 5%
    expect(maxSemiEnergyDev).toBeLessThan(0.05);

    // Assertion 3: RK4 tracks the analytic curve much more tightly than Explicit Euler
    expect(rk4TotalError).toBeLessThan(eulerTotalError);

    // Assertion 4: RK4 error is extremely small (it's 4th order)
    expect(rk4TotalError / steps).toBeLessThan(1e-4);
  });
});
