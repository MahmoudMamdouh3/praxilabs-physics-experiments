import { describe, it, expect, beforeEach } from 'vitest';
import { Pendulum } from '../src/experiments/Pendulum.ts';

describe('Pendulum Physics Integration', () => {
  let pendulum: Pendulum;

  beforeEach(() => {
    pendulum = new Pendulum();
    // Do NOT call setup(scene) -> proves true headless physics separation!
    // We only reset state and tick the mathematical accumulator.
  });

  it('initializes to schema defaults correctly', () => {
    pendulum.reset();
    const measurements = pendulum.getMeasurements();
    
    // Default angle is 45 degrees
    expect(measurements.angle_deg).toBeCloseTo(45, 1);
    expect(measurements.omega_rads).toBe(0);
    expect(measurements.time_s).toBe(0);
  });

  it('updates position and velocity using Semi-Implicit Euler', () => {
    pendulum.reset({ length: 10, gravity: 9.81, damping: 0, initialAngle: 10 });
    
    // Tick 1 second
    pendulum.update(1, { length: 10, gravity: 9.81, damping: 0 });
    
    const measurements = pendulum.getMeasurements();
    
    // Because gravity pulls it down, omega should be negative
    expect(measurements.omega_rads).toBeLessThan(0);
    // Angle should decrease
    expect(measurements.angle_deg).toBeLessThan(10);
    // Time should be exactly 1
    expect(measurements.time_s).toBe(1);
  });

  it('conserves total energy over time (symplectic nature)', () => {
    pendulum.reset({ length: 2, gravity: 9.81, damping: 0, initialAngle: 45 });
    
    const m0 = pendulum.getMeasurements();
    const initialEnergy = m0.total_energy;
    
    // Run for exactly 200 fixed ticks (e.g. ~3.3 seconds at 60Hz)
    const dt = 1 / 60;
    for (let i = 0; i < 200; i++) {
      pendulum.update(dt, { length: 2, gravity: 9.81, damping: 0 });
    }
    
    const mN = pendulum.getMeasurements();
    const finalEnergy = mN.total_energy;
    
    // Semi-implicit Euler bounds the energy error (symplectic).
    // Total energy should remain very close to the initial energy despite 200 steps.
    const difference = Math.abs(finalEnergy - initialEnergy);
    expect(difference).toBeLessThan(1.0); // Allow small bounded fluctuation
  });
});
