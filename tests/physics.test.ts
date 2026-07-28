import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Physics, FIXED_DT } from '../src/core/Physics.ts';
import type { IExperiment } from '../src/experiments/IExperiment.ts';

// ---------------------------------------------------------------------------
// Minimal stub that satisfies IExperiment without any Three.js dependency.
// ---------------------------------------------------------------------------
function makeExperiment(): IExperiment & { updateCallCount: number; lastDt: number } {
  const stub = {
    id: 'test',
    name: 'Test Experiment',
    description: 'Stub for unit tests',
    schema: {},
    updateCallCount: 0,
    lastDt: 0,
    setup: vi.fn(),
    update(_dt: number, _params: Record<string, number>): void {
      stub.updateCallCount++;
      stub.lastDt = _dt;
    },
    reset: vi.fn(),
    getMeasurements: () => ({}),
    dispose: vi.fn(),
  };
  return stub;
}

// ---------------------------------------------------------------------------

describe('Physics — fixed-timestep accumulator', () => {
  let physics: Physics;
  let experiment: ReturnType<typeof makeExperiment>;

  beforeEach(() => {
    physics = new Physics();
    experiment = makeExperiment();
  });

  // ── Basic tick count ───────────────────────────────────────────────────────

  it('calls update() exactly once when dt equals FIXED_DT', () => {
    physics.step(FIXED_DT, experiment);
    expect(experiment.updateCallCount).toBe(1);
  });

  it('calls update() the correct integer number of times for larger dt', () => {
    // 3× FIXED_DT should produce exactly 3 update calls.
    physics.step(FIXED_DT * 3, experiment);
    expect(experiment.updateCallCount).toBe(3);
  });

  it('passes FIXED_DT as the dt argument to update()', () => {
    physics.step(FIXED_DT, experiment);
    expect(experiment.lastDt).toBeCloseTo(FIXED_DT);
  });

  it('does NOT call update() when dt is smaller than FIXED_DT', () => {
    physics.step(FIXED_DT * 0.5, experiment);
    expect(experiment.updateCallCount).toBe(0);
  });

  it('carries over sub-tick remainder into the next step() call', () => {
    // Each call adds 0.75 × FIXED_DT — tick fires on the second call.
    physics.step(FIXED_DT * 0.75, experiment);
    expect(experiment.updateCallCount).toBe(0);
    physics.step(FIXED_DT * 0.75, experiment);
    expect(experiment.updateCallCount).toBe(1);
  });

  // ── Spiral-of-death cap ────────────────────────────────────────────────────

  it('caps excessive dt to prevent a spiral of death (max 250 ms)', () => {
    // 1 second of wall-clock time would produce 60 ticks uncapped.
    // With MAX_DELTA = 0.25 s, we get at most floor(0.25 / FIXED_DT) = 15 ticks.
    physics.step(1.0, experiment);
    const maxTicks = Math.floor(0.25 / FIXED_DT);
    expect(experiment.updateCallCount).toBeLessThanOrEqual(maxTicks);
  });

  // ── Null experiment guard ──────────────────────────────────────────────────

  it('does nothing when activeExperiment is null', () => {
    expect(() => physics.step(FIXED_DT, null)).not.toThrow();
  });

  // ── Pause / Play ───────────────────────────────────────────────────────────

  it('does not call update() while paused', () => {
    physics.pause();
    physics.step(FIXED_DT * 5, experiment);
    expect(experiment.updateCallCount).toBe(0);
  });

  it('resumes calling update() after play()', () => {
    physics.pause();
    physics.step(FIXED_DT * 5, experiment);
    physics.play();
    physics.step(FIXED_DT, experiment);
    expect(experiment.updateCallCount).toBe(1);
  });

  it('drains the accumulator on play() to prevent a tick burst', () => {
    // Pause, then fire a big step (normally 10 ticks).  After play() the
    // accumulator should be 0, so the *next* step with FIXED_DT gives 1 tick.
    physics.pause();
    physics.step(FIXED_DT * 10, experiment); // no-op while paused
    physics.play();
    physics.step(FIXED_DT, experiment);
    expect(experiment.updateCallCount).toBe(1); // not 11
  });

  it('togglePause() alternates between paused and playing', () => {
    expect(physics.isPaused).toBe(false);
    physics.togglePause();
    expect(physics.isPaused).toBe(true);
    physics.togglePause();
    expect(physics.isPaused).toBe(false);
  });

  // ── stepOnce ──────────────────────────────────────────────────────────────

  it('stepOnce() fires exactly one update tick even while paused', () => {
    physics.pause();
    physics.stepOnce(experiment);
    expect(experiment.updateCallCount).toBe(1);
  });

  it('stepOnce() does nothing when experiment is null', () => {
    expect(() => physics.stepOnce(null)).not.toThrow();
  });

  // ── timeScale ─────────────────────────────────────────────────────────────

  it('timeScale 0.5 halves the effective dt (half as many ticks)', () => {
    physics.setTimeScale(0.5);
    // With scale 0.5, 4× FIXED_DT wall time ≈ 2× scaled time → 2 ticks.
    physics.step(FIXED_DT * 4, experiment);
    expect(experiment.updateCallCount).toBe(2);
  });

  it('setTimeScale() clamps to [0, 10]', () => {
    physics.setTimeScale(-5);
    expect(physics.timeScale).toBe(0);
    physics.setTimeScale(100);
    expect(physics.timeScale).toBe(10);
  });

  // ── setParams / setParam ──────────────────────────────────────────────────

  it('setParams() stores a shallow copy (external mutation does not affect internal state)', () => {
    const params = { mass: 1.0 };
    physics.setParams(params);
    params['mass'] = 999;
    expect(physics.currentParams['mass']).toBe(1.0);
  });

  it('setParam() updates a single key without affecting others', () => {
    physics.setParams({ mass: 1.0, gravity: 9.81 });
    physics.setParam('gravity', 1.62); // moon gravity
    expect(physics.currentParams['gravity']).toBeCloseTo(1.62);
    expect(physics.currentParams['mass']).toBeCloseTo(1.0);
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  it('reset() zeroes the accumulator', () => {
    // Accumulate half a tick worth without consuming it.
    physics.step(FIXED_DT * 0.5, experiment);
    physics.reset();
    expect(physics.getAccumulator()).toBeCloseTo(0);
  });

  it('reset() preserves isPaused and timeScale', () => {
    physics.pause();
    physics.setTimeScale(2);
    physics.reset();
    expect(physics.isPaused).toBe(true);
    expect(physics.timeScale).toBe(2);
  });
});
