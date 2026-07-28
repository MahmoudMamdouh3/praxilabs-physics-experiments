import * as THREE from 'three';
import './style.css';
import { Engine } from './core/Engine.ts';
import { Physics } from './core/Physics.ts';
import { Pendulum } from './experiments/Pendulum.ts';

// 1. Boot the Core Engine and Physics loop
const engine = new Engine();
const physics = new Physics();

// 2. Connect Physics to Engine.
//    Every RAF tick, Engine calls physics.step(dt) which runs the
//    fixed-timestep accumulator and dispatches update() to the active experiment.
engine.setPhysicsTickCallback((dt: number) => {
  physics.step(dt, engine.getActiveExperiment());
});

// 3. Load the REAL experiment
engine.loadExperiment(new Pendulum());

// 4. Start the render + physics loop
engine.start();

// Suppress unused import — THREE is re-exported from Engine/Pendulum but the
// import satisfies the module graph for Vite's tree-shaking.
void (THREE.REVISION);