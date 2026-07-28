import * as THREE from 'three';
import type { IExperiment, ParameterSchema } from './IExperiment.ts';

// ---------------------------------------------------------------------------
// Projectile — Stub (not yet implemented)
// ---------------------------------------------------------------------------
// This class satisfies the IExperiment interface with no-op implementations
// so the experiment switcher can reference it before the real implementation
// is written.  Zero-Touch Core rule: no Engine/UI changes needed when the real
// implementation replaces this stub.
// ---------------------------------------------------------------------------

export class Projectile implements IExperiment {
  readonly id = 'projectile';
  readonly name = 'Projectile Motion';
  readonly description = 'Projectile motion under gravity. (Coming soon)';

  readonly schema: Record<string, ParameterSchema> = {
    initialSpeed: {
      description: 'Initial Speed',
      unit: 'm/s',
      min: 0,
      max: 100,
      default: 20,
      step: 0.5,
    },
    launchAngle: {
      description: 'Launch Angle',
      unit: '°',
      min: 0,
      max: 90,
      default: 45,
      step: 1,
    },
    gravity: {
      description: 'Gravity',
      unit: 'm/s²',
      min: 0,
      max: 20,
      default: 9.81,
      step: 0.01,
    },
  };

  setup(_scene: THREE.Scene): void { }

  update(_dt: number, _params: Record<string, number>): void { }

  reset(_params?: Record<string, number>): void { }

  getMeasurements(): Record<string, number> {
    return { time_s: 0 };
  }

  dispose(): void { }
}
