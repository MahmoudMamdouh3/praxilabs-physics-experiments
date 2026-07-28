import * as THREE from 'three';
import './style.css';
import { Engine } from './core/Engine.ts';
import { Physics } from './core/Physics.ts';
import type { IExperiment, ParameterSchema } from './experiments/IExperiment.ts';

// 1. Create a dummy cartridge to test the Master Scene
class DummyExperiment implements IExperiment {
  id = 'dummy';
  name = 'Test Cube';
  description = 'A static cube to test the Engine lighting and renderer.';
  schema: Record<string, ParameterSchema> = {};

  private cube: THREE.Mesh | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private geometry: THREE.BoxGeometry | null = null;

  setup(scene: THREE.Scene): void {
    this.geometry = new THREE.BoxGeometry(2, 2, 2);
    // Using a standard material so it reacts to the 3-point lighting rig
    this.material = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
    this.cube = new THREE.Mesh(this.geometry, this.material);

    // Rotate slightly so we can see the 3D edges and lighting
    this.cube.rotation.set(0.5, 0.5, 0);
    scene.add(this.cube);
  }

  update(dt: number, _params: Record<string, number>): void {
    // Rotate the cube each fixed tick to visually confirm the physics loop fires.
    // dt is always FIXED_DT (~0.01667 s), so the speed is frame-rate independent.
    if (this.cube !== null) {
      this.cube.rotation.x += dt;
      this.cube.rotation.y += dt;
    }
  }

  reset(): void { }
  getMeasurements(): Record<string, number> { return {}; }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
  }
}

// 2. Boot the Core Engine and Physics loop
const engine = new Engine();
const physics = new Physics();

// 3. Connect Physics to Engine.
//    Every RAF tick, Engine calls physics.step(dt) which runs the
//    fixed-timestep accumulator and dispatches update() to the active experiment.
engine.setPhysicsTickCallback((dt: number) => {
  physics.step(dt, engine.getActiveExperiment());
});

// 4. Load the dummy experiment
engine.loadExperiment(new DummyExperiment());

// 5. Start the render + physics loop
engine.start();