import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Pendulum } from '../src/experiments/Pendulum.ts';

// Mock DOM
global.document = {
  createElement: () => ({
    style: {},
    classList: { add: () => {} },
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => ({ style: {} }),
    dataset: {}
  }),
  body: {
    appendChild: () => {}
  },
  dispatchEvent: () => {}
} as any;
global.window = {
  dispatchEvent: () => {}
} as any;
global.CustomEvent = class {} as any;

describe('Pendulum', () => {
  it('instantiates', () => {
    const scene = new THREE.Scene();
    const p = new Pendulum();
    p.setup(scene);
    p.reset();
    expect(p).toBeDefined();
  });
});
