# Physics Experiments Suite

A modular, browser-based physics laboratory built with Three.js and TypeScript. This platform features a shared core framework capable of running interchangeable physics experiments seamlessly.

## Quick Start
To run this project locally, you will need Node.js. If you do not have it installed, please download and install the recommended LTS version from the [official Node.js website](https://nodejs.org/).

Once Node.js is installed, open your terminal in the project root and run:

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

## Architecture Overview
The platform is built on a **Modular Plugin Architecture** that utilizes the **Strategy Pattern** to ensure strict separation of concerns and flawless AI extensibility. *(To simplify: think of the core engine as a video game console, and the individual experiments as interchangeable cartridges).*

*   **Core Engine (The Host):** Resides in `src/core/`. It acts as the context, handling the fixed-timestep physics loop and dynamically auto-generating UI sliders based on the active experiment's parameter schema.
    *   **The Master Scene Strategy:** To prevent memory hemorrhaging and WebGL crashes during experiment swaps, `Engine.ts` owns one single, persistent Three.js master scene, camera, and renderer. 
*   **Experiments (The Strategies):** Reside in `src/experiments/`. Each experiment strictly implements the `IExperiment` interface. 
    *   When loaded, an experiment is passed the master scene (e.g., `pendulum.setup(scene)`) and only adds its specific meshes into the room. When swapped out, the core calls `dispose()`, forcing the experiment to delete its shapes, geometries, and materials before the next experiment loads.
*   **Decoupled Logic:** The core engine is completely blind to which experiment is running. Adding a new experiment requires only dropping a new class file into the directory and registering it, touching zero core rendering or UI files.

## Tech Stack & Integrator Choice
*   **Frontend & Bundling:** Vanilla TypeScript powered by Vite. No heavy frontend frameworks (React/Vue) were used to minimize unnecessary dependencies. HTML/CSS is overlaid directly on the canvas.
*   **3D Engine:** Three.js.
*   **Graphing:** Chart.js is used for plotting real-time 2D measurement data with high-DPI canvas scaling.
*   **Testing:** Vitest for isolated testing of pure physics functions.
*   **Physics Integrator:** Semi-Implicit Euler. 
    *   *Justification:* Explicit Euler is inherently unstable for oscillating systems (like springs and pendulums) because mathematical errors accumulate, adding artificial energy to the system. Semi-Implicit Euler calculates the new velocity first, then uses it to calculate position. It is computationally lightweight, simple to implement, and symplectic (it naturally conserves energy in oscillating systems), making it ideal for this scope.

## Project Structure
```text
/
├── .agents/                # AI workflow rules and persistent configuration
├── docs/                   # Documentation and user guides
├── helpers/                # Utility scripts
├── public/                 # Static assets
├── src/
│    ├── core/              # Master scene rendering, dynamic UI, and fixed-timestep loop
│    ├── experiments/       # Individual experiment modules and IExperiment contract
│    └── main.ts            # Entry point wiring the engine and active experiment
├── tests/                  # Vitest unit tests for physics logic
├── AI_USAGE.md             # Documentation of AI prompts, workflows, and corrections
└── package.json            
```

## Known Limitations & Future Work
If I had more time outside of the 2-3 day timebox, I would implement the following:
1.  **Runge-Kutta 4 (RK4) Integrator Option:** While Semi-Implicit Euler is fantastic for energy conservation in simple oscillators, an RK4 integration option would provide higher baseline precision for more complex, non-linear chaotic systems (like a double pendulum).
2.  **Comparison Mode:** Implementing the bonus requirement to run two parameter sets side-by-side. This would require abstracting the `Engine.ts` to manage an array of active experiments rather than a singleton, and splitting the Three.js viewport / UI panel.
3.  **Advanced 3D Interactivity:** Currently, the parameter schema completely drives the physics state. I would add `THREE.Raycaster` support so users could click and drag the pendulum bob or spring mass directly in the 3D canvas to set the initial displacement, which would natively bi-directionally sync back to the HTML sliders.