import type * as THREE from 'three';

// ---------------------------------------------------------------------------
// ParameterSchema
// ---------------------------------------------------------------------------
// Describes a single numeric parameter that an experiment exposes.
// The core UI module reads this schema to auto-generate sliders/inputs
// without any knowledge of the experiment that owns them.
// ---------------------------------------------------------------------------

/**
 * Defines the shape and constraints of a single numeric control parameter.
 * Every field except `unit` is required so that the UI can construct a fully
 * functional slider with validated bounds out of the box.
 */
export interface ParameterSchema {
  /** Human-readable label shown next to the control. */
  readonly description: string;

  /** Physical or dimensional unit displayed alongside the value (e.g. "m/s²", "kg", "°"). */
  readonly unit: string;

  /** Minimum value the parameter may take (inclusive). */
  readonly min: number;

  /** Maximum value the parameter may take (inclusive). */
  readonly max: number;

  /** Value the experiment starts with and resets to. Must satisfy: min ≤ default ≤ max. */
  readonly default: number;

  /**
   * Granularity of the control (e.g. 0.1, 1, 0.01).
   * The UI uses this as the `step` attribute of the generated range input.
   */
  readonly step: number;

  /** Optional detailed explanation of what this parameter does, shown on hover. */
  readonly tooltip?: string;
}

// ---------------------------------------------------------------------------
// IExperiment
// ---------------------------------------------------------------------------
// The canonical contract every physics experiment must satisfy.
// Engine.ts drives the lifecycle; experiments must never call
// renderer.render() or manipulate the camera directly.
// ---------------------------------------------------------------------------

/**
 * The core framework contract for all physics experiments.
 *
 * **Lifecycle:**
 * 1. `setup(scene)`  — called once when the experiment is made active.
 *                      Add meshes/lights to the provided master scene.
 * 2. `update(dt, params)` — called every fixed physics tick (decoupled from rAF).
 *                           `dt` is in seconds. `params` values are already
 *                           clamped to their schema bounds by the engine.
 * 3. `reset()`       — restore all internal state and mesh transforms to their
 *                      initial conditions without re-creating GPU resources.
 * 4. `getMeasurements()` — polled by the UI each render frame to display
 *                          live readouts (e.g. velocity, energy, angle).
 * 5. `dispose()`     — called when switching away from the experiment.
 *                      MUST free every geometry and material to prevent
 *                      WebGL memory leaks (see Architectural Mandate #2).
 *
 * **Rules for implementors:**
 * - Do NOT create a `THREE.Scene`, `THREE.Camera`, or `THREE.WebGLRenderer`.
 * - Do NOT import or use any external physics engine.
 * - Use Semi-Implicit Euler integration unless the experiment explicitly
 *   states otherwise.
 * - Adding a new experiment requires only a single new file in
 *   `src/experiments/`; Engine.ts, Physics.ts, and UI.ts must not be touched.
 */
export interface IExperiment {
  // ── Identity ──────────────────────────────────────────────────────────────

  /** Unique, URL-safe identifier (e.g. `"pendulum"`, `"projectile"`). */
  readonly id: string;

  /** Display name shown in the experiment selector (e.g. `"Simple Pendulum"`). */
  readonly name: string;

  /** One- or two-sentence description of the physical system being modelled. */
  readonly description: string;

  // ── Parameter Contract ────────────────────────────────────────────────────

  /**
   * Declares every numeric parameter this experiment accepts.
   * The engine reads this once at activation time to:
   *   - Build the dynamic UI controls (sliders / number inputs).
   *   - Clamp incoming `params` values before forwarding them to `update`.
   *
   * Keys must be stable identifiers (e.g. `"gravity"`, `"mass"`, `"length"`).
   */
  readonly schema: Record<string, ParameterSchema>;

  // ── Lifecycle Methods ─────────────────────────────────────────────────────

  /**
   * Initialise the experiment.
   * Create all `THREE.Mesh`, `THREE.Line`, and helper objects then add them
   * to `scene`. Called exactly once per activation.
   *
   * @param scene - The master Three.js scene owned by Engine.ts.
   */
  setup(scene: THREE.Scene): void;

  /**
   * Advance the simulation by one fixed physics step.
   * Advance the simulation by one fixed timestep.
   * Do NOT mutate Three.js objects here; only update mathematical state.
   *
   * @param dt     - Elapsed time in **seconds** for this physics tick.
   * @param params - Current parameter values, keyed by the same identifiers
   *                 used in `schema`. Values are pre-clamped by the engine.
   */
  update(dt: number, params: Record<string, number>): void;

  /**
   * Sync the Three.js scene meshes to match the current mathematical state.
   * Called exactly once per render frame by the Engine.
   */
  render(): void;

  /**
   * Restore the experiment to its initial conditions.
   * Reuse existing GPU resources — do NOT dispose and re-create meshes.
   * Called when the user clicks the Reset button or changes a parameter
   * that requires a full restart.
   *
   * @param params - Optional current parameter snapshot. When provided,
   *                 the experiment should use `params["initialAngle"]` etc.
   *                 rather than hard-coded schema defaults, so the reset
   *                 respects the user's current slider positions.
   */
  reset(params?: Record<string, number>): void;

  /**
   * Return a snapshot of observable quantities for the current simulation state.
   * The UI polls this every render frame and displays the values as live readouts.
   *
   * Examples: `{ velocity_ms: 3.14, kineticEnergy_J: 0.98, angle_deg: 45 }`
   *
   * @returns A flat key-value map where keys are stable identifiers and
   *          values are plain numbers in SI units (or documented alternatives).
   */
  getMeasurements(): Record<string, number>;

  /**
   * Tear down all GPU resources owned by this experiment.
   * Must call `.dispose()` on every `THREE.BufferGeometry` and
   * `THREE.Material` (including those inside `THREE.Mesh` children).
   * Must also remove all owned objects from the scene.
   * Called by the engine before activating a different experiment.
   */
  dispose(): void;
}
