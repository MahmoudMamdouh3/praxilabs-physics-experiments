import type { IExperiment } from '../experiments/IExperiment.ts';

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
// Manages the fixed-timestep accumulator simulation loop.
//
// Design constraints (enforced here):
//  • Zero DOM or Three.js imports — this file is purely mathematical logic
//    so it can be exercised in Vitest without a browser canvas.
//  • The accumulator pattern decouples physics from the render framerate,
//    satisfying Architectural Mandate #5.
//  • All integration happens inside IExperiment.update(); Physics.ts only
//    decides *when* to call it and *how many times* per frame.
// ---------------------------------------------------------------------------

/** Fixed physics timestep: 60 Hz (~16.667 ms per tick). */
export const FIXED_DT: number = 1 / 60;

/**
 * Maximum elapsed wall-clock time accepted per `step()` call (in seconds).
 *
 * If a frame takes longer than this (e.g. tab was backgrounded), we cap the
 * delta rather than running hundreds of ticks to "catch up" — avoiding the
 * classic "spiral of death" where physics work causes longer frames which
 * cause more work.
 */
const MAX_DELTA: number = 0.25; // 250 ms — four physics steps max per frame

export class Physics {
  // ── Fixed-step accumulator ─────────────────────────────────────────────────

  /** Unsimulated time that has not yet been consumed by a physics tick (seconds). */
  private accumulator: number = 0;

  // ── Playback controls ──────────────────────────────────────────────────────

  /** When `true`, `step()` is a no-op — the simulation is frozen. */
  isPaused: boolean = false;

  /**
   * Multiplier applied to the wall-clock delta before it enters the accumulator.
   * - `1.0`  → real-time
   * - `0.5`  → half speed (slow-motion)
   * - `2.0`  → double speed
   * - `0.0`  → effectively paused (but `isPaused` is preferred for clarity)
   *
   * Clamped to `[0, 10]` by `setTimeScale()`.
   */
  timeScale: number = 1.0;

  // ── Parameter store ────────────────────────────────────────────────────────

  /**
   * The current set of experiment parameters forwarded to every `update()` call.
   * Updated externally by the UI via `setParams()`.
   */
  currentParams: Record<string, number> = {};

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Advance the simulation by one render frame worth of real time.
   *
   * Called each RAF tick by Engine.ts (via the registered physics callback).
   * Internally performs as many fixed-dt ticks as the accumulated time allows.
   *
   * @param dt               - Wall-clock delta since the last frame (seconds).
   *                           Typically provided by Engine's render loop.
   * @param activeExperiment - The currently loaded experiment, or `null`.
   */
  step(dt: number, activeExperiment: IExperiment | null): void {
    if (this.isPaused || activeExperiment === null) return;

    // Scale by timeScale, then cap to prevent the spiral of death.
    const scaledDt = Math.min(dt * this.timeScale, MAX_DELTA);

    this.accumulator += scaledDt;

    // Consume the accumulated time in fixed-size chunks.
    while (this.accumulator >= FIXED_DT) {
      activeExperiment.update(FIXED_DT, this.currentParams);
      this.accumulator -= FIXED_DT;
    }
  }

  /**
   * Replace the stored parameter map with a fresh snapshot.
   * Called by the UI whenever the user moves a slider or changes an input.
   *
   * The provided object is shallow-copied so external mutations don't
   * silently corrupt the physics state.
   *
   * @param params - New parameter values keyed by schema identifier.
   */
  setParams(params: Record<string, number>): void {
    this.currentParams = { ...params };
  }

  /**
   * Update a single parameter by key without replacing the entire map.
   * Useful for hot-updating one slider without re-reading all controls.
   *
   * @param key   - Schema identifier (e.g. `"gravity"`, `"mass"`).
   * @param value - New value (caller is responsible for range clamping).
   */
  setParam(key: string, value: number): void {
    this.currentParams[key] = value;
  }

  /** Freeze the simulation. `step()` becomes a no-op until `play()` is called. */
  pause(): void {
    this.isPaused = true;
  }

  /** Resume the simulation. Clears any accumulated time to avoid a burst of ticks. */
  play(): void {
    // Drain the accumulator so that un-pausing does not cause a tick burst
    // representing the time that elapsed while paused.
    this.accumulator = 0;
    this.isPaused = false;
  }

  /** Toggle between paused and playing. */
  togglePause(): void {
    if (this.isPaused) {
      this.play();
    } else {
      this.pause();
    }
  }

  /**
   * Advance the simulation by exactly **one** fixed tick — even if paused.
   *
   * Intended for frame-by-frame debugging.  Does not modify `isPaused` or the
   * accumulator, so the simulation can be stepped through tick-by-tick while
   * remaining in the paused state.
   *
   * @param activeExperiment - The currently loaded experiment, or `null`.
   */
  stepOnce(activeExperiment: IExperiment | null): void {
    if (activeExperiment === null) return;
    activeExperiment.update(FIXED_DT, this.currentParams);
  }

  /**
   * Set the time-scale multiplier.
   *
   * @param scale - Desired multiplier, clamped to the range `[0, 10]`.
   *                Pass `0` for a "soft pause" that still counts as playing
   *                (prefer `pause()` for intent clarity).
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(scale, 10));
  }

  /**
   * Reset the accumulator to zero.
   *
   * Call this whenever an experiment is reset or switched so that leftover
   * partial-tick debt from the old simulation does not bleed into the new one.
   *
   * Does NOT change `isPaused` or `timeScale` — those are user preferences
   * that should survive an experiment reload.
   */
  reset(): void {
    this.accumulator = 0;
  }

  // ── Diagnostic helpers (useful in tests) ───────────────────────────────────

  /**
   * Read the current accumulator value.
   * Exposed for testing/debugging; do not use to drive game logic.
   */
  getAccumulator(): number {
    return this.accumulator;
  }
}
