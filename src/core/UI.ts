import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Filler,
  Tooltip,
  type ChartDataset,
} from 'chart.js';
import type { Engine } from './Engine.ts';
import type { Physics } from './Physics.ts';
import type { IExperiment, ParameterSchema } from '../experiments/IExperiment.ts';

// Register only the Chart.js components we actually use (tree-shaking friendly).
Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

// ---------------------------------------------------------------------------
// Design tokens — Technical-Industrial Minimalist palette
// ---------------------------------------------------------------------------
const TOKEN = {
  bg: 'rgba(13, 14, 18, 0.82)',
  bgSolid: '#0d0e12',
  border: '1px solid rgba(255,255,255,0.08)',
  borderAccent: '1px solid rgba(34,170,255,0.4)',
  accent: '#22aaff',
  accentDim: 'rgba(34,170,255,0.15)',
  text: '#c8cdd8',
  // Raised from #596170 → #8a95a8 for WCAG AA contrast (~5.1:1 on near-black bg).
  textMuted: '#8a95a8',
  textBright: '#eef0f5',
  fontMono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  fontSans: "'Inter', system-ui, sans-serif",
  radius: '6px',
  panelBlur: 'blur(14px) saturate(160%)',
  shadow: '0 8px 32px rgba(0,0,0,0.6)',
  transition: 'all 0.18s ease',
} as const;

// ---------------------------------------------------------------------------
// Max data points kept in the rolling graph buffer
// ---------------------------------------------------------------------------
const MAX_GRAPH_POINTS = 150;

// ---------------------------------------------------------------------------
// Experiment registry — maps id → factory function.
// Add new experiments here only; UI.ts and Engine.ts stay untouched.
// ---------------------------------------------------------------------------
type ExperimentFactory = () => IExperiment;
const EXPERIMENT_REGISTRY: Array<{ id: string; label: string; factory: ExperimentFactory }> = [];

/**
 * Register an experiment so it appears in the switcher dropdown.
 * Call this from main.ts before instantiating UI.
 */
export function registerExperiment(id: string, label: string, factory: ExperimentFactory): void {
  EXPERIMENT_REGISTRY.push({ id, label, factory });
}

// ---------------------------------------------------------------------------
// UI class
// ---------------------------------------------------------------------------

export class UI {
  private readonly physics: Physics;
  private readonly engine: Engine;

  // ── DOM containers ─────────────────────────────────────────────────────────
  private readonly shell: HTMLDivElement;
  private readonly sidePanel: HTMLDivElement;
  private readonly readoutsPanel: HTMLDivElement;
  private readonly paramSection: HTMLDivElement;

  // ── Chart.js ───────────────────────────────────────────────────────────────
  private chart: Chart | null = null;
  private readonly chartCanvas: HTMLCanvasElement;
  private readonly graphPoints: Array<{ x: number; y: number }> = [];
  private graphKey: string = '';  // which measurement key to plot on Y axis

  // ── Readout rows ───────────────────────────────────────────────────────────
  // Key → the value <span> element. Cleared AND DOM-removed together in clearReadouts().
  private readoutRows: Map<string, HTMLSpanElement> = new Map();

  // ── CSV History ────────────────────────────────────────────────────────────
  private measurementHistory: Array<Record<string, number>> = [];

  // Heading node kept as a reference so clearReadouts() can restore it efficiently.
  private readonly readoutsHeading: HTMLDivElement;

  constructor(physics: Physics, engine: Engine) {
    this.physics = physics;
    this.engine = engine;

    // ── Google Fonts ────────────────────────────────────────────────────────
    this.injectFont();

    // ── Root shell (pointer-events: none so Three.js canvas stays interactive)
    this.shell = this.el('div', {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '10',
      fontFamily: TOKEN.fontSans,
      color: TOKEN.text,
    });
    document.body.appendChild(this.shell);

    // ── Left side panel ─────────────────────────────────────────────────────
    this.sidePanel = this.el('div', {
      position: 'absolute',
      top: '16px',
      left: '16px',
      width: '280px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'auto',
    });
    this.shell.appendChild(this.sidePanel);

    // Header / title
    const header = this.el('div', {
      padding: '14px 16px 12px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.borderAccent,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
    });
    header.innerHTML = `
      <div style="font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:4px;">PraxiLabs</div>
      <div id="ui-exp-name" style="font-size:16px;font-weight:600;color:${TOKEN.textBright};line-height:1.2;">Physics Experiments</div>
      <div id="ui-exp-desc" style="font-size:11px;color:${TOKEN.textMuted};margin-top:4px;line-height:1.5;"></div>
    `;
    this.sidePanel.appendChild(header);

    // Experiment switcher
    this.sidePanel.appendChild(this.buildSwitcher());

    // Controls bar — build returns the three mutable controls we need for Reset.
    const { bar } = this.buildControlsBar();
    this.sidePanel.appendChild(bar);

    // Parameter sliders section (empty until an experiment loads)
    this.paramSection = this.el('div', {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });
    this.sidePanel.appendChild(this.paramSection);

    // ── Right panel: readouts ────────────────────────────────────────────────
    this.readoutsPanel = this.el('div', {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: '240px',
      padding: '14px 16px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      pointerEvents: 'none',
    });

    // Keep the heading as a field so clearReadouts() can re-append it cleanly.
    this.readoutsHeading = document.createElement('div');
    this.readoutsHeading.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:10px;`;
    this.readoutsHeading.textContent = 'Live Readouts';
    this.readoutsPanel.appendChild(this.readoutsHeading);

    this.shell.appendChild(this.readoutsPanel);

    // ── Bottom graph panel ───────────────────────────────────────────────────
    const graphPanel = this.el('div', {
      position: 'absolute',
      bottom: '16px',
      left: '312px',
      right: '272px',
      height: '180px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 14px 8px',
      // Prevent canvas overflow when the window is smaller than the panel.
      overflow: 'hidden',
      pointerEvents: 'none',
    });

    const graphLabel = document.createElement('div');
    graphLabel.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:6px;`;
    graphLabel.textContent = 'Measurement Graph';
    graphPanel.appendChild(graphLabel);

    // Sized wrapper: Chart.js reads this element's clientWidth × clientHeight
    // to set the canvas backing-store to (size × devicePixelRatio), eliminating
    // blur on HiDPI screens. `overflow:hidden` clips any transient resize overshoot.
    const chartWrapper = document.createElement('div');
    chartWrapper.style.cssText = 'position:relative;width:100%;height:130px;overflow:hidden;';

    this.chartCanvas = document.createElement('canvas');
    chartWrapper.appendChild(this.chartCanvas);
    graphPanel.appendChild(chartWrapper);
    this.shell.appendChild(graphPanel);

    // ── Camera controls hint ─────────────────────────────────────────────────
    // Anchored to the bottom-left of the graph panel so it reads against the
    // frosted-glass surface rather than the raw black canvas. High-contrast
    // textBright + backdrop ensures it is readable at a glance.
    const camHint = document.createElement('div');
    camHint.style.cssText = [
      'position:absolute',
      'bottom:212px',           // sits just above the 180px graph panel + 16px gap
      'left:312px',             // aligned with the graph panel left edge
      'font-size:10px',
      `color:${TOKEN.textBright}`,
      `font-family:${TOKEN.fontMono}`,
      'letter-spacing:1px',
      'text-transform:uppercase',
      'opacity:0.75',
      'padding:3px 8px',
      'border-radius:4px',
      'background:rgba(13,14,18,0.72)',
      `border:1px solid rgba(34,170,255,0.2)`,
      'pointer-events:none',
      'user-select:none',
      'backdrop-filter:blur(6px)',
    ].join(';');
    camHint.textContent = 'Cam: drag to tilt  \u2502  scroll to zoom';
    this.shell.appendChild(camHint);

    this.initChart();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build sliders and number inputs for every key in `schema`.
   * Called each time a new experiment is loaded or Reset is pressed.
   */
  buildParameterPanel(schema: Record<string, ParameterSchema>): void {
    this.paramSection.innerHTML = '';

    // BUG FIX: clear() alone only empties the Map — DOM nodes stay in the panel.
    // clearReadouts() removes both the DOM rows AND resets the Map atomically.
    this.clearReadouts();

    if (Object.keys(schema).length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `font-size:11px;color:${TOKEN.textMuted};padding:10px 14px;`;
      empty.textContent = 'No parameters for this experiment.';
      this.paramSection.appendChild(empty);
      return;
    }

    const panelBox = this.el('div', {
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    });

    const heading = document.createElement('div');
    heading.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;`;
    heading.textContent = 'Parameters';
    panelBox.appendChild(heading);

    for (const [key, schema_entry] of Object.entries(schema)) {
      panelBox.appendChild(this.buildSliderRow(key, schema_entry));
    }

    this.paramSection.appendChild(panelBox);
  }

  /**
   * Update the graph with a new measurements snapshot.
   * Call this every render frame from main.ts.
   *
   * BUG FIX: Skips the push+update when paused so Chart.js doesn't stutter
   * by re-rendering the same frozen point 60× per second.
   */
  updateGraph(measurements: Record<string, number>): void {
    if (this.chart === null) return;

    // Only advance the graph when the simulation is actually running.
    if (this.physics.isPaused) return;

    const t = measurements['time_s'] ?? 0;

    // Pick first non-time key as the Y axis metric (stable across frames).
    if (this.graphKey === '') {
      const firstKey = Object.keys(measurements).find((k) => k !== 'time_s');
      this.graphKey = firstKey ?? '';
    }

    const y = measurements[this.graphKey] ?? 0;
    this.graphPoints.push({ x: t, y });

    if (this.graphPoints.length > MAX_GRAPH_POINTS) {
      this.graphPoints.shift();
    }

    const ds = this.chart.data.datasets[0] as ChartDataset<'line', Array<{ x: number; y: number }>>;
    ds.data = [...this.graphPoints];
    ds.label = this.graphKey;

    this.chart.update('none'); // 'none' skips animation for performance
  }

  /**
   * Update the live readout panel with the latest measurements.
   * Call this every render frame from main.ts.
   */
  updateReadouts(measurements: Record<string, number>): void {
    this.measurementHistory.push({ ...measurements });

    for (const [key, val] of Object.entries(measurements)) {
      if (!this.readoutRows.has(key)) {
        this.addReadoutRow(key);
      }
      const span = this.readoutRows.get(key)!;
      span.textContent = this.formatValue(key, val);
    }
  }

  /**
   * Update the experiment name and description in the header.
   */
  updateHeader(experiment: IExperiment): void {
    const nameEl = document.getElementById('ui-exp-name');
    const descEl = document.getElementById('ui-exp-desc');
    if (nameEl) nameEl.textContent = experiment.name;
    if (descEl) descEl.textContent = experiment.description;
  }

  /**
   * Reset the graph buffer (call when switching experiments or resetting).
   */
  resetGraph(): void {
    this.graphPoints.length = 0;
    this.graphKey = '';
    if (this.chart !== null) {
      const ds = this.chart.data.datasets[0] as ChartDataset<'line', Array<{ x: number; y: number }>>;
      ds.data = [];
      this.chart.update('none');
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Remove all readout rows from the DOM and clear the Map.
   * Must be called together — clearing the Map alone leaves orphan DOM nodes.
   */
  private clearReadouts(): void {
    // Remove every row div that was appended after the heading.
    // We keep readoutsHeading and remove everything else.
    const children = Array.from(this.readoutsPanel.children);
    for (const child of children) {
      if (child !== this.readoutsHeading) {
        this.readoutsPanel.removeChild(child);
      }
    }
    this.readoutRows.clear();
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private buildSwitcher(): HTMLDivElement {
    const wrapper = this.el('div', {
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 14px',
    });

    const label = document.createElement('div');
    label.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:8px;`;
    label.textContent = 'Experiment';
    wrapper.appendChild(label);

    const select = document.createElement('select');
    select.id = 'ui-exp-switcher';
    select.style.cssText = `
      width:100%;background:#1a1c24;color:${TOKEN.textBright};
      border:${TOKEN.border};border-radius:${TOKEN.radius};
      padding:6px 10px;font-size:13px;font-family:${TOKEN.fontSans};
      cursor:pointer;outline:none;appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2322aaff'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 10px center;
      padding-right:28px;
    `;

    for (const entry of EXPERIMENT_REGISTRY) {
      const opt = document.createElement('option');
      opt.value = entry.id;
      opt.textContent = entry.label;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      const entry = EXPERIMENT_REGISTRY.find((e) => e.id === select.value);
      if (!entry) return;

      const exp = entry.factory();
      this.physics.reset();
      this.resetGraph();
      this.engine.loadExperiment(exp);

      // Seed physics params with schema defaults
      const defaults: Record<string, number> = {};
      for (const [k, s] of Object.entries(exp.schema)) defaults[k] = s.default;
      this.physics.setParams(defaults);

      this.buildParameterPanel(exp.schema);
      this.updateHeader(exp);
    });

    wrapper.appendChild(select);
    return wrapper;
  }

  /**
   * Build the controls bar.
   * Returns the bar element plus the three DOM nodes that Reset needs to mutate,
   * so they can be stored as class fields without passing `this` in callbacks.
   */
  private buildControlsBar(): {
    bar: HTMLDivElement;
    pauseBtn: HTMLButtonElement;
    tsSlider: HTMLInputElement;
    tsLabel: HTMLDivElement;
  } {
    const bar = this.el('div', {
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 14px',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      flexWrap: 'wrap',
    });

    // ── Play / Pause ──────────────────────────────────────────────────────────
    const pauseBtn = this.button('⏸ Pause', TOKEN.accent);
    pauseBtn.id = 'ui-btn-pause';
    pauseBtn.addEventListener('click', () => {
      this.physics.togglePause();
      pauseBtn.textContent = this.physics.isPaused ? '▶ Play' : '⏸ Pause';
    });
    bar.appendChild(pauseBtn);

    // ── Step once ─────────────────────────────────────────────────────────────
    const stepBtn = this.button('⏭ Step', TOKEN.textMuted);
    stepBtn.title = 'Advance exactly one physics tick (useful when paused)';
    stepBtn.addEventListener('click', () => {
      this.physics.stepOnce(this.engine.getActiveExperiment());
    });
    bar.appendChild(stepBtn);

    // ── Reset ─────────────────────────────────────────────────────────────────
    // References pauseBtn, tsSlider, tsLabel — these are captured after creation.
    // The actual listener is patched in below after the slider/label are built.
    const resetBtn = this.button('↺ Reset', TOKEN.textMuted);
    bar.appendChild(resetBtn);

    // ── CSV Export ────────────────────────────────────────────────────────────
    const csvBtn = this.button('⬇️ CSV', TOKEN.accent);
    csvBtn.title = 'Download measurement history as CSV';
    csvBtn.addEventListener('click', () => {
      if (this.measurementHistory.length === 0) return;

      const keys = Array.from(new Set(this.measurementHistory.flatMap(Object.keys)));
      const headerRow = keys.join(',');
      const rows = this.measurementHistory.map(row => {
        return keys.map(k => row[k] ?? '').join(',');
      });
      const csvContent = [headerRow, ...rows].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'experiment_data.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
    bar.appendChild(csvBtn);

    // ── Time-scale row — always-visible static label + slider + value ──────────
    // A full-width sub-row so the label is always readable (not just on hover).
    const tsRow = this.el('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      paddingTop: '6px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      marginTop: '2px',
    });

    const tsStaticLabel = document.createElement('span');
    tsStaticLabel.style.cssText = `font-size:10px;color:${TOKEN.textMuted};font-family:${TOKEN.fontMono};white-space:nowrap;flex-shrink:0;`;
    tsStaticLabel.textContent = 'Speed:';
    tsRow.appendChild(tsStaticLabel);

    const tsSlider = document.createElement('input');
    tsSlider.type = 'range';
    tsSlider.id = 'ui-ts-slider';
    tsSlider.min = '0';
    tsSlider.max = '4';
    tsSlider.step = '0.5';     // 0×, 0.5×, 1×, 1.5×, … 4×
    tsSlider.value = '1';
    tsSlider.title = 'Time Scale';
    this.styleSlider(tsSlider);
    tsSlider.style.flex = '1';
    tsSlider.style.minWidth = '0';
    tsRow.appendChild(tsSlider);

    const tsLabel = document.createElement('div') as HTMLDivElement;
    tsLabel.style.cssText = `font-size:10px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};white-space:nowrap;flex-shrink:0;min-width:28px;text-align:right;`;
    tsLabel.textContent = '1×';
    tsLabel.id = 'ui-ts-label';
    tsRow.appendChild(tsLabel);

    tsSlider.addEventListener('input', () => {
      const scale = parseFloat(tsSlider.value);
      this.physics.setTimeScale(scale);
      tsLabel.textContent = `${scale}×`;
    });

    bar.appendChild(tsRow);

    // ── Wire up Reset now that all controls exist ─────────────────────────────
    resetBtn.addEventListener('click', () => {
      const exp = this.engine.getActiveExperiment();
      if (exp === null) return;

      // 1. Re-seed physics params map with every schema default value.
      const defaults: Record<string, number> = {};
      for (const [k, s] of Object.entries(exp.schema)) defaults[k] = s.default;
      this.physics.setParams(defaults);

      // 2. Reset the experiment physics state using the fresh defaults.
      exp.reset(this.physics.currentParams);

      // 3. Rebuild the entire parameter panel so all sliders/inputs snap
      //    back to their default positions visually. This also calls
      //    clearReadouts() to remove orphan DOM rows before re-adding them.
      this.buildParameterPanel(exp.schema);

      // 4. Clear the graph buffer and measurement history.
      this.resetGraph();
      this.measurementHistory.length = 0;

      // 5. Reset the accumulator so no leftover partial-tick debt carries over.
      this.physics.reset();

      // 6. Restore playback state to "playing" at 1× speed.
      this.physics.play();
      this.physics.setTimeScale(1);
      pauseBtn.textContent = '⏸ Pause';
      tsSlider.value = '1';
      tsLabel.textContent = '1×';
      this.styleSlider(tsSlider); // refresh the track fill gradient

      // 7. Restore the camera to its default zoom/tilt position.
      this.engine.resetCamera();
    });

    return { bar, pauseBtn, tsSlider, tsLabel };
  }

  private buildSliderRow(key: string, s: ParameterSchema): HTMLDivElement {
    const row = this.el('div', { display: 'flex', flexDirection: 'column', gap: '4px' });

    // Top row: label + value display
    const topRow = this.el('div', {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    });

    const label = document.createElement('label');
    label.htmlFor = `param-slider-${key}`;
    label.style.cssText = `font-size:12px;color:${TOKEN.text};font-family:${TOKEN.fontSans};`;
    label.textContent = s.description;

    if (s.tooltip) {
      label.title = s.tooltip;
      label.style.cursor = 'help';
      label.style.borderBottom = `1px dotted ${TOKEN.textMuted}`;
    }
    topRow.appendChild(label);

    const valueDisplay = document.createElement('span');
    valueDisplay.style.cssText = `font-size:11px;font-family:${TOKEN.fontMono};color:${TOKEN.accent};`;
    valueDisplay.textContent = `${s.default.toFixed(2)} ${s.unit}`;
    topRow.appendChild(valueDisplay);

    row.appendChild(topRow);

    // Slider + number input row
    const inputRow = this.el('div', { display: 'flex', gap: '6px', alignItems: 'center' });

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `param-slider-${key}`;
    slider.min = String(s.min);
    slider.max = String(s.max);
    slider.step = String(s.step);
    slider.value = String(s.default);
    slider.style.flex = '1';
    this.styleSlider(slider);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = String(s.min);
    numInput.max = String(s.max);
    numInput.step = String(s.step);
    numInput.value = String(s.default);
    numInput.style.cssText = `
      width:64px;background:#1a1c24;color:${TOKEN.textBright};
      border:${TOKEN.border};border-radius:4px;
      padding:3px 6px;font-size:11px;font-family:${TOKEN.fontMono};
      outline:none;text-align:right;
    `;

    const syncParam = (value: number) => {
      const clamped = Math.min(s.max, Math.max(s.min, value));
      slider.value = String(clamped);
      numInput.value = String(clamped);
      valueDisplay.textContent = `${clamped.toFixed(2)} ${s.unit}`;
      this.styleSlider(slider); // refresh track fill

      this.physics.setParam(key, clamped);

      const exp = this.engine.getActiveExperiment();
      if (exp !== null) {
        exp.reset(this.physics.currentParams);
        this.resetGraph();
      }
    };

    slider.addEventListener('input', () => syncParam(parseFloat(slider.value)));
    numInput.addEventListener('change', () => syncParam(parseFloat(numInput.value)));

    inputRow.appendChild(slider);
    inputRow.appendChild(numInput);
    row.appendChild(inputRow);

    // Min/max labels
    const rangeLabels = this.el('div', {
      display: 'flex',
      justifyContent: 'space-between',
    });
    ([s.min, s.max] as const).forEach((bound) => {
      const lbl = document.createElement('span');
      lbl.style.cssText = `font-size:9px;color:${TOKEN.textMuted};font-family:${TOKEN.fontMono};`;
      lbl.textContent = String(bound);
      rangeLabels.appendChild(lbl);
    });
    row.appendChild(rangeLabels);

    return row;
  }

  private addReadoutRow(key: string): void {
    const row = this.el('div', {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingBottom: '6px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      gap: '8px',
    });

    const keyEl = document.createElement('span');
    keyEl.style.cssText = `font-size:10px;color:${TOKEN.textMuted};font-family:${TOKEN.fontMono};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    keyEl.textContent = key;

    const valEl = document.createElement('span');
    valEl.style.cssText = `font-size:12px;color:${TOKEN.textBright};font-family:${TOKEN.fontMono};font-weight:600;text-align:right;flex-shrink:0;`;

    row.appendChild(keyEl);
    row.appendChild(valEl);
    this.readoutsPanel.appendChild(row);
    this.readoutRows.set(key, valEl);
  }

  private initChart(): void {
    const ctx = this.chartCanvas.getContext('2d');
    if (ctx === null) return;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: '',
            data: [],
            borderColor: TOKEN.accent,
            backgroundColor: TOKEN.accentDim,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
        ],
      },
      options: {
        animation: false,
        // responsive:true lets Chart.js watch the wrapper via ResizeObserver
        // and update the canvas pixel dimensions automatically on resize,
        // preventing overflow and clipping in the glassmorphism panel.
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: false },
            ticks: {
              color: TOKEN.textMuted,
              font: { family: TOKEN.fontMono, size: 9 },
              maxTicksLimit: 6,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { color: 'rgba(255,255,255,0.08)' },
          },
          y: {
            ticks: {
              color: TOKEN.textMuted,
              font: { family: TOKEN.fontMono, size: 9 },
              maxTicksLimit: 5,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { color: 'rgba(255,255,255,0.08)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: TOKEN.bgSolid,
            titleColor: TOKEN.accent,
            bodyColor: TOKEN.text,
            borderColor: TOKEN.accent,
            borderWidth: 1,
            titleFont: { family: TOKEN.fontMono, size: 10 },
            bodyFont: { family: TOKEN.fontMono, size: 11 },
            callbacks: {
              title: (items) => `t = ${(items[0]?.parsed.x ?? 0).toFixed(3)} s`,
              label: (item) => `${this.graphKey}: ${(item.parsed.y ?? 0).toFixed(4)}`,
            },
          },
        },
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private el(tag: string, styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const el = document.createElement(tag) as HTMLDivElement;
    Object.assign(el.style, styles);
    return el;
  }

  private button(text: string, color: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background:transparent;border:1px solid ${color}33;border-radius:4px;
      color:${color};font-size:11px;font-family:${TOKEN.fontSans};
      padding:4px 10px;cursor:pointer;white-space:nowrap;
      transition:${TOKEN.transition};
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `${color}18`;
      btn.style.borderColor = color;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = `${color}33`;
    });
    return btn;
  }

  /**
   * Apply (or reapply) the filled-track gradient to a range input.
   * Safe to call multiple times — overwrites the background each call.
   */
  private styleSlider(slider: HTMLInputElement): void {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 1;
    const val = parseFloat(slider.value) || 0;
    const pct = ((val - min) / (max - min)) * 100;

    slider.style.cssText += `
      -webkit-appearance:none;appearance:none;
      height:4px;border-radius:2px;
      background:linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${pct}%,rgba(255,255,255,0.08) ${pct}%);
      outline:none;cursor:pointer;
    `;

    // Re-colour track fill on every subsequent input event.
    // Guard with a flag so we don't stack listeners on repeated styleSlider() calls.
    if (!(slider as HTMLInputElement & { _trackListenerAdded?: boolean })._trackListenerAdded) {
      (slider as HTMLInputElement & { _trackListenerAdded?: boolean })._trackListenerAdded = true;
      slider.addEventListener('input', () => {
        const p = ((parseFloat(slider.value) - parseFloat(slider.min)) /
          (parseFloat(slider.max) - parseFloat(slider.min))) * 100;
        slider.style.background = `linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${p}%,rgba(255,255,255,0.08) ${p}%)`;
      });
    }
  }

  private formatValue(key: string, val: number): string {
    if (key.endsWith('_deg')) return `${val.toFixed(2)} °`;
    if (key.endsWith('_s'))   return `${val.toFixed(3)} s`;
    if (key.endsWith('_ms'))  return `${val.toFixed(1)} m/s`;
    if (key.endsWith('_rads')) return `${val.toFixed(4)} rad/s`;
    return val.toFixed(4);
  }

  private injectFont(): void {
    if (document.getElementById('ui-font-inter')) return;
    const link = document.createElement('link');
    link.id = 'ui-font-inter';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap';
    document.head.appendChild(link);
  }
}
