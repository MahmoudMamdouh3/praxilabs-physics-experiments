import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Pendulum } from '../src/experiments/Pendulum.ts';
import { Spring } from '../src/experiments/Spring.ts';
import { Projectile } from '../src/experiments/Projectile.ts';
import { Physics, FIXED_DT } from '../src/core/Physics.ts';
import { RK4Integrator, SemiImplicitEulerIntegrator, ExplicitEulerIntegrator } from '../src/core/Integrator.ts';

// ── Mock DOM for setup() calls ───────────────────────────────────────────────
global.document = {
  createElement: () => ({
    style: {},
    classList: { add: () => {} },
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => ({ style: {} }),
    dataset: {}
  }),
  body: { appendChild: () => {} },
  dispatchEvent: () => {}
} as any;
global.window = { dispatchEvent: () => {} } as any;
global.CustomEvent = class {} as any;

describe('Physics Audit Suite', () => {
  const dummyScene = new THREE.Scene();

  describe('2. Closed-Form / Analytic Comparison', () => {
    it('Spring (Undamped): Matches analytic cosine solution', () => {
      const spring = new Spring();
      spring.setup(dummyScene);
      const params = { mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 };
      spring.reset(params);
      
      let m = spring.getMeasurements();
      const y0 = m.position_y ?? 2; // Default is usually 2
      // We must hack y since reset() uses schema defaults instead of params for initial position in Spring.ts. Actually it uses this.schema which defaults to 2.
      (spring as any).y = 2;
      (spring as any).vy = 0;
      
      const w = Math.sqrt(1 / 1); 
      
      const steps = 100;
      const dt = 0.01;
      for (let i = 0; i < steps; i++) {
        spring.update(dt, params);
      }
      
      const t = steps * dt;
      const analyticY = 2 * Math.cos(w * t);
      
      const finalY = (spring as any).y;
      expect(Math.abs(finalY - analyticY)).toBeLessThan(0.05);
    });

    it('Pendulum (Small Angle): Matches analytic cosine solution', () => {
      const p = new Pendulum();
      p.setup(dummyScene);
      const params = { length: 1, gravity: 9.81, damping: 0, initialAngle: 5, targetOscillations: 100 };
      p.reset(params);
      
      const theta0 = 5 * (Math.PI / 180);
      const w = Math.sqrt(9.81 / 1);
      
      const steps = 100;
      const dt = 0.01;
      for (let i = 0; i < steps; i++) {
        p.update(dt, params);
      }
      
      const t = steps * dt;
      const analyticTheta = theta0 * Math.cos(w * t);
      const finalTheta = (p as any).theta;
      
      expect(Math.abs(finalTheta - analyticTheta)).toBeLessThan(0.01);
    });

    it('Projectile (Drag-free): Matches exact parabolic trajectory', () => {
      const proj = new Projectile();
      proj.setup(dummyScene);
      const params = { initialSpeed: 10, launchAngle: 45, gravity: 9.81, dragCoefficient: 0 };
      proj.reset(params);
      
      const v0 = 10;
      const theta = 45 * (Math.PI / 180);
      const v0x = v0 * Math.cos(theta);
      const v0y = v0 * Math.sin(theta);
      const g = 9.81;
      
      const dt = 0.01;
      const steps = 50; 
      for (let i = 0; i < steps; i++) {
        proj.update(dt, params);
      }
      
      const t = steps * dt;
      const analyticX = v0x * t;
      const analyticY = v0y * t - 0.5 * g * t * t;
      
      const finalX = (proj as any).x;
      const finalY = (proj as any).y;
      expect(Math.abs(finalX - analyticX)).toBeLessThan(0.05);
      expect(Math.abs(finalY - analyticY)).toBeLessThan(0.05);
    });
  });

  describe('3. Conservation Law Checks', () => {
    it('Spring (Undamped): Total energy is bounded over time', () => {
      const spring = new Spring();
      spring.setup(dummyScene);
      const params = { mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 };
      spring.reset(params);
      
      // Force initial state
      (spring as any).y = 2;
      (spring as any).vy = 0;
      
      const initialEnergy = spring.getMeasurements().total_energy ?? 2;
      let maxEnergy = initialEnergy;
      let minEnergy = initialEnergy;
      
      for (let i = 0; i < 1000; i++) {
        spring.update(0.016, params);
        const e = spring.getMeasurements().total_energy ?? 0;
        if (e > maxEnergy) maxEnergy = e;
        if (e < minEnergy) minEnergy = e;
      }
      
      const drift = (maxEnergy - minEnergy) / initialEnergy;
      expect(drift).toBeLessThan(0.02);
    });

    it('Pendulum (Damped): Total energy monotonically decreases', () => {
      const p = new Pendulum();
      p.setup(dummyScene);
      const params = { length: 2, gravity: 9.81, damping: 0.5, initialAngle: 45, targetOscillations: 100 };
      p.reset(params);
      
      let prevEnergy = p.getMeasurements().total_energy;
      
      for (let i = 0; i < 50; i++) {
        p.update(0.016, params);
        const currentEnergy = p.getMeasurements().total_energy;
        expect(currentEnergy).toBeLessThanOrEqual(prevEnergy + 1e-5); 
        prevEnergy = currentEnergy;
      }
    });
  });

  describe('4. Convergence Order Verification', () => {
    it('Integrators demonstrate correct order of accuracy', () => {
      const rk4 = new RK4Integrator();
      const semi = new SemiImplicitEulerIntegrator();
      
      const deriv = (state: any) => ({ v: -state.y, y: state.v });
      const analyticY = (t: number) => Math.cos(t);
      
      let rk4_y_01 = 1, rk4_v_01 = 0;
      let rk4_y_005 = 1, rk4_v_005 = 0;
      let semi_y_01 = 1, semi_v_01 = 0;
      let semi_y_005 = 1, semi_v_005 = 0;
      
      for (let i = 0; i < 10; i++) {
        const res = rk4.step({ y: rk4_y_01, v: rk4_v_01 }, deriv, {}, 0.1);
        rk4_y_01 = res.y; rk4_v_01 = res.v;
        const resS = semi.step({ y: semi_y_01, v: semi_v_01 }, deriv, {}, 0.1);
        semi_y_01 = resS.y; semi_v_01 = resS.v;
      }
      for (let i = 0; i < 20; i++) {
        const res = rk4.step({ y: rk4_y_005, v: rk4_v_005 }, deriv, {}, 0.05);
        rk4_y_005 = res.y; rk4_v_005 = res.v;
        const resS = semi.step({ y: semi_y_005, v: semi_v_005 }, deriv, {}, 0.05);
        semi_y_005 = resS.y; semi_v_005 = resS.v;
      }
      
      const trueY = analyticY(1);
      const errRK4_01 = Math.abs(rk4_y_01 - trueY);
      const errRK4_005 = Math.abs(rk4_y_005 - trueY);
      const errSemi_01 = Math.abs(semi_y_01 - trueY);
      const errSemi_005 = Math.abs(semi_y_005 - trueY);
      
      const semiRatio = errSemi_01 / errSemi_005;
      expect(semiRatio).toBeGreaterThan(1.8);
      expect(semiRatio).toBeLessThan(2.2);
      
      const rk4Ratio = errRK4_01 / errRK4_005;
      expect(rk4Ratio).toBeGreaterThan(14);
      expect(rk4Ratio).toBeLessThan(18);
    });
  });

  describe('5. Frame-Rate Independence', () => {
    it('Physics accumulator guarantees identical state regardless of framerate', () => {
      const getFinalTheta = (deltas: number[]) => {
        const p = new Pendulum();
        p.setup(dummyScene);
        p.reset({ length: 2, gravity: 9.81, damping: 0, initialAngle: 45, targetOscillations: 100 });
        
        const physics = new Physics();
        physics.isPaused = false;
        physics.setParams({ length: 2, gravity: 9.81, damping: 0, initialAngle: 45, targetOscillations: 100 });
        
        for (const dt of deltas) {
          physics.step(dt, p);
        }
        return (p as any).theta;
      };
      
      const fps60 = Array(120).fill(1/60);
      const fps30 = Array(60).fill(1/30);
      
      const jitter = [];
      let sum = 0;
      while (sum < 2.0) {
        const r = 0.01 + Math.random() * 0.04;
        if (sum + r > 2.0) { jitter.push(2.0 - sum); break; }
        jitter.push(r);
        sum += r;
      }
      
      const t1 = getFinalTheta(fps60);
      const t2 = getFinalTheta(fps30);
      const t3 = getFinalTheta(jitter);
      
      expect(Math.abs(t1 - t2)).toBeLessThan(1e-9);
      expect(Math.abs(t1 - t3)).toBeLessThan(1e-9);
    });
  });

  describe('6. Symmetry & Sanity Invariants', () => {
    it('Pendulum: Mirror initial angles produce mirror trajectories', () => {
      const p1 = new Pendulum(); p1.setup(dummyScene);
      const p2 = new Pendulum(); p2.setup(dummyScene);
      
      p1.reset({ length: 2, gravity: 9.81, damping: 0, initialAngle: 45, targetOscillations: 100 });
      p2.reset({ length: 2, gravity: 9.81, damping: 0, initialAngle: -45, targetOscillations: 100 });
      
      for(let i = 0; i < 50; i++) {
        p1.update(0.016, { length: 2, gravity: 9.81, damping: 0, targetOscillations: 100 });
        p2.update(0.016, { length: 2, gravity: 9.81, damping: 0, targetOscillations: 100 });
      }
      
      const t1 = (p1 as any).theta;
      const t2 = (p2 as any).theta;
      expect(Math.abs(t1 + t2)).toBeLessThan(1e-9);
    });

    it('Spring: Period is independent of amplitude', () => {
      const s1 = new Spring(); s1.setup(dummyScene);
      const s2 = new Spring(); s2.setup(dummyScene);
      
      s1.reset({ mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 });
      s2.reset({ mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 });
      (s1 as any).y = 2;
      (s2 as any).y = 4;
      
      let crossings1: number[] = [];
      let crossings2: number[] = [];
      
      for(let i=0; i<300; i++) {
        s1.update(0.05, { mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 });
        s2.update(0.05, { mass: 1, springConstant: 1, damping: 0, targetOscillations: 100 });
        if ((s1 as any).hasCrossing && (s1 as any).prevCrossingTime > 0) crossings1.push((s1 as any).measuredPeriod);
        if ((s2 as any).hasCrossing && (s2 as any).prevCrossingTime > 0) crossings2.push((s2 as any).measuredPeriod);
      }
      
      const p1 = crossings1[crossings1.length - 1];
      const p2 = crossings2[crossings2.length - 1];
      expect(Math.abs(p1 - p2)).toBeLessThan(1e-9);
    });
  });

  describe('7. Edge Cases / Degenerate Inputs', () => {
    it('Projectile: Zero gravity does not crash and moves in straight line', () => {
      const proj = new Projectile();
      proj.setup(dummyScene);
      proj.reset({ initialSpeed: 10, launchAngle: 0, gravity: 0, dragCoefficient: 0 });
      
      for(let i=0; i<100; i++) proj.update(0.1, { gravity: 0, dragCoefficient: 0 });
      
      const finalX = (proj as any).x;
      const finalY = (proj as any).y;
      expect(Number.isNaN(finalX)).toBe(false);
      expect(Number.isNaN(finalY)).toBe(false);
      expect(finalY).toBeCloseTo(0, 5);
      expect(finalX).toBeCloseTo(100, 5);
    });

    it('Pendulum: Overdamped regime decays monotonically without crossing zero', () => {
      const p = new Pendulum();
      p.setup(dummyScene);
      p.reset({ length: 2, gravity: 1, damping: 20, initialAngle: 45, targetOscillations: 100 });
      
      let prevTheta = (p as any).theta;
      let crossedZero = false;
      
      for(let i=0; i<500; i++) {
        p.update(0.016, { length: 2, gravity: 1, damping: 20, targetOscillations: 100 });
        const currentTheta = (p as any).theta;
        
        if (currentTheta < 0) crossedZero = true;
        expect(Math.abs(currentTheta)).toBeLessThanOrEqual(Math.abs(prevTheta) + 1e-6);
        prevTheta = currentTheta;
      }
      
      expect(crossedZero).toBe(false);
    });
  });
});
