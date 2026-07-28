import './style.css';
import { Engine } from './core/Engine.ts';
import { Physics } from './core/Physics.ts';
import { UI, registerExperiment } from './core/UI.ts';
import { Pendulum } from './experiments/Pendulum.ts';
import { Projectile } from './experiments/Projectile.ts';
import { Spring } from './experiments/Spring.ts';

// ---------------------------------------------------------------------------
// 1. Register all experiments in the switcher.
//    Strictly additive — no Engine/UI/Physics modifications required.
// ---------------------------------------------------------------------------
registerExperiment('pendulum', 'Simple Pendulum', () => new Pendulum());
registerExperiment('projectile', 'Projectile Motion', () => new Projectile());
registerExperiment('spring', 'Spring-Mass System', () => new Spring());

// ---------------------------------------------------------------------------
// 2. Boot core systems
// ---------------------------------------------------------------------------
const engine = new Engine();
const physics = new Physics();
const ui = new UI(physics, engine);

// ---------------------------------------------------------------------------
// 3. Connect Physics accumulator into the RAF render loop.
//    The callback also drives the per-frame UI readout & graph updates.
// ---------------------------------------------------------------------------
engine.setPhysicsTickCallback((dt: number) => {
  // Run the fixed-timestep accumulator for the active experiment
  physics.step(dt, engine.getActiveExperiment());

  // Poll measurements and push to UI every render frame
  const exp = engine.getActiveExperiment();
  if (exp !== null) {
    const measurements = exp.getMeasurements();
    ui.updateReadouts(measurements);
    ui.updateGraph(measurements);
  }
});

// ---------------------------------------------------------------------------
// 4. Load the initial experiment (Pendulum) and build UI around its schema
// ---------------------------------------------------------------------------
const initialExperiment = new Pendulum();

// Seed physics params with schema defaults before first update()
const defaultParams: Record<string, number> = {};
for (const [key, s] of Object.entries(initialExperiment.schema)) {
  defaultParams[key] = s.default;
}
physics.setParams(defaultParams);

engine.loadExperiment(initialExperiment);
ui.buildParameterPanel(initialExperiment.schema);
ui.updateHeader(initialExperiment);

// Sync the switcher dropdown to 'pendulum'
const switcher = document.getElementById('ui-exp-switcher') as HTMLSelectElement | null;
if (switcher !== null) switcher.value = 'pendulum';

// ---------------------------------------------------------------------------
// 5. Start the render + physics loop
// ---------------------------------------------------------------------------
engine.start();