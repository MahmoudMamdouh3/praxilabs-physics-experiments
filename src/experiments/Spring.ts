import * as THREE from 'three';
import type { IExperiment, ParameterSchema } from './IExperiment.ts';

// ---------------------------------------------------------------------------
// Spring — Stub (not yet implemented)
// ---------------------------------------------------------------------------

export class Spring implements IExperiment {
  readonly id = 'spring';
  readonly name = 'Spring-Mass System';
  readonly description = 'Simple harmonic oscillator — spring-mass system. (Coming soon)';

  readonly schema: Record<string, ParameterSchema> = {
    mass: {
      description: 'Mass',
      unit: 'kg',
      min: 0.1,
      max: 20,
      default: 1,
      step: 0.1,
    },
    springConstant: {
      description: 'Spring Constant',
      unit: 'N/m',
      min: 0.1,
      max: 200,
      default: 10,
      step: 0.1,
    },
    damping: {
      description: 'Damping',
      unit: '',
      min: 0,
      max: 5,
      default: 0,
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
