# Antigravity Agent Directives: Physics Experiments Suite

## Core Stack & Constraints
1. **Language:** Strict TypeScript. Do not output plain JavaScript.
2. **Frameworks:** Vite, Vanilla HTML/CSS, and Three.js. Do NOT introduce React, Vue, or Svelte under any circumstances.
3. **Physics Engines:** Do NOT use Cannon.js, Rapier, Ammo.js, or any other physics engine. All physics and math must be written manually.

## Architectural Mandates (Console & Cartridge)
1. **The Master Scene:** `src/core/Engine.ts` owns the SINGLE Three.js `Scene`, `Camera`, and `WebGLRenderer`. Experiments do NOT create their own scenes. They receive the master scene via their `setup(scene)` method and add/remove their specific `THREE.Mesh` objects to it.
2. **Experiment Disposal:** When switching experiments, the outgoing experiment must completely dispose of its geometries and materials to prevent WebGL memory leaks. 
3. **UI Generation:** Do not hardcode UI for specific experiments. The core UI module must automatically generate sliders and inputs dynamically by reading the `parameter schema` of the currently active experiment. 
4. **Design Language:** Style the overlaid HTML/CSS UI using a technical-industrial minimalist aesthetic—utilize deep grays, dark mode grids, frosted glass panels, and high-contrast accent colors for data visibility. 
5. **Decoupled Physics:** The simulation loop must use a fixed-timestep accumulator pattern and be completely decoupled from the rendering loop (requestAnimationFrame). Physics must be testable without a browser canvas. 
6. **Integrator:** Use Semi-Implicit Euler for numerical integration to ensure stability in oscillating systems, unless explicitly instructed otherwise.

## Extensibility Rule (Zero-Touch Core)
If asked to add a new experiment, you must create a single new file in `src/experiments/` that implements the `IExperiment` interface. You are strictly forbidden from modifying `Engine.ts`, `Physics.ts`, or `UI.ts` to accommodate the new experiment.