# Experiment API Contract

This document provides the definitive guide for AI agents and human developers on how to extend the PraxiLabs Physics platform by creating a new physics experiment.

> [!IMPORTANT]
> **The Zero-Touch Core Mandate**
> The platform is designed around interchangeable modules. You are strictly forbidden from modifying `Engine.ts`, `Physics.ts`, or `UI.ts` when adding a new experiment. All new logic must reside entirely within a single new file in the `src/experiments/` directory.

## 1. The `IExperiment` Interface
Every new experiment must implement the `IExperiment` interface (found in `src/experiments/IExperiment.ts`). The platform architecture strictly decouples mathematical simulation from visual rendering.

### Defining the Parameter Schema
The core UI automatically generates sliders and control inputs based on the `schema` getter you define. 

```typescript
// Example Schema Definition
readonly schema: Record<string, ParameterSchema> = {
  mass: { description: 'Mass', unit: 'kg', min: 0.1, max: 10, default: 1, step: 0.1 },
  length: { description: 'String Length', unit: 'm', min: 0.5, max: 5, default: 2, step: 0.1 }
};
```
- **Rule:** Do NOT attempt to build HTML sliders manually. The `UI.ts` module handles this entirely using the schema.

### Lifecycle & Decoupling

#### A. `setup(scene: THREE.Scene)`
Called exactly once when the user selects your experiment.
- **Rule:** Do NOT create a `THREE.Scene`, `THREE.Camera`, or `THREE.WebGLRenderer`. The engine owns the master scene. You simply create your `THREE.Mesh` objects and `scene.add()` them to the provided scene.

#### B. `update(dt: number, params: Record<string, number>)`
This is the **math loop**. It runs on a fixed physics timestep (Semi-Implicit Euler), decoupled from the monitor's refresh rate.
- **Rule:** Do NOT mutate Three.js objects (like `mesh.position`) inside `update()`.
- **Rule:** Mutate only internal math variables (e.g., `this.theta`, `this.velocity`).
- **Rule:** `dt` is provided in seconds. `params` provides the current slider values (already clamped to your schema bounds).

#### C. `render()`
This is the **visual loop**. It runs every time the browser requests an animation frame (e.g., 60fps or 144fps).
- **Rule:** Copy your internal math state to the Three.js meshes here.
```typescript
render(): void {
  // Sync the math to the visuals
  this.bobMesh.position.x = this.length * Math.sin(this.theta);
  this.bobMesh.position.y = -this.length * Math.cos(this.theta);
}
```

#### D. `getMeasurements()`
Returns a flat dictionary of live readout values polled by the UI every frame.
- **Rule:** You must provide `time_s`.
- **Rule:** If you provide `kinetic_energy`, `potential_energy`, and `total_energy`, the UI's Energy Plot bonus feature will automatically chart them.

```typescript
getMeasurements(): Record<string, number> {
  return {
    time_s: this.time,
    angle_deg: (this.theta * 180) / Math.PI,
    kinetic_energy: this.kineticEnergy,
    potential_energy: this.potentialEnergy,
    total_energy: this.kineticEnergy + this.potentialEnergy
  };
}
```

#### E. `dispose()`
Called when the user switches to a different experiment.
> [!CAUTION]
> **WebGL Memory Leaks**
> You must manually call `.dispose()` on **every single** `THREE.BufferGeometry` and `THREE.Material` your experiment created. You must also `scene.remove()` them. Failure to do so violates Architectural Mandate #2.

## 2. Registering the Experiment

Once you have created your new experiment class (e.g., `src/experiments/FrictionPlane.ts`), you must register it so the application knows it exists.

Open `src/main.ts` and look for the Registration block at the top of the file:

```typescript
import { Pendulum } from './experiments/Pendulum.ts';
import { Projectile } from './experiments/Projectile.ts';
import { Spring } from './experiments/Spring.ts';
// 1. Import your new experiment here:
import { FrictionPlane } from './experiments/FrictionPlane.ts';

// 2. Add it to the registry using the unique URL-safe ID, the Display Name, and a factory function:
registerExperiment('pendulum', 'Simple Pendulum', () => new Pendulum());
registerExperiment('projectile', 'Projectile Motion', () => new Projectile());
registerExperiment('spring', 'Spring-Mass System', () => new Spring());
registerExperiment('friction', 'Friction Plane', () => new FrictionPlane());
```

By following this contract, a new experiment will effortlessly snap into the platform, automatically gaining dynamic UI controls, graphing capabilities, comparison mode support, and decoupled numerical stability.

## 3. Extension Checklist
Before considering a new experiment complete, verify the following:

- The experiment implements `setup`, `update`, `render`, `reset`, `getMeasurements`, and `dispose` in the expected lifecycle order.
- The experiment uses a parameter schema so the UI can generate controls automatically.
- The physics state is kept separate from Three.js mesh updates, and the render loop only syncs visuals.
- The experiment disposes all geometries, materials, and scene nodes it creates.
- The repository still passes `npx tsc --noEmit` and `npm test` after the change.
