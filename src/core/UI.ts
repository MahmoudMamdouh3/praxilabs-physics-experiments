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
  textMuted: '#596170',
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
const MAX_GRAPH_POINTS = 300;

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
  private readonly controlsBar: HTMLDivElement;

  // ── Chart.js ───────────────────────────────────────────────────────────────
  private chart: Chart | null = null;
  private readonly chartCanvas: HTMLCanvasElement;
  private readonly graphPoints: Array<{ x: number; y: number }> = [];
  private graphKey: string = '';  // which measurement key to plot on Y axis

  // ── Readout rows ───────────────────────────────────────────────────────────
  private readoutRows: Map<string, HTMLSpanElement> = new Map();

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

    // Controls bar (Play/Pause, Reset, time-scale)
    this.controlsBar = this.buildControlsBar();
    this.sidePanel.appendChild(this.controlsBar);

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
    this.readoutsPanel.innerHTML = `<div style="font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:10px;">Live Readouts</div>`;
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
      pointerEvents: 'none',
    });
    const graphLabel = document.createElement('div');
    graphLabel.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:6px;`;
    graphLabel.textContent = 'Measurement Graph';
    graphPanel.appendChild(graphLabel);

    // Wrap in a relative container with explicit CSS dimensions.
    // Chart.js reads the container size to set the canvas backing-store
    // resolution to containerWidth × devicePixelRatio, eliminating blur
    // on HiDPI / Retina screens when maintainAspectRatio is false.
    const chartWrapper = document.createElement('div');
    chartWrapper.style.cssText = 'position:relative;width:100%;height:130px;';

    this.chartCanvas = document.createElement('canvas');
    // Do NOT set CSS width/height on the canvas itself — Chart.js controls
    // both the CSS size and the backing-store size via the wrapper dimensions.
    chartWrapper.appendChild(this.chartCanvas);
    graphPanel.appendChild(chartWrapper);
    this.shell.appendChild(graphPanel);

    this.initChart();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build sliders and number inputs for every key in `schema`.
   * Called each time a new experiment is loaded.
   */
  buildParameterPanel(schema: Record<string, ParameterSchema>): void {
    this.paramSection.innerHTML = '';
    this.readoutRows.clear();

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
   */
  updateGraph(measurements: Record<string, number>): void {
    if (this.chart === null) return;

    const t = measurements['time_s'] ?? 0;

    // Pick first non-time key as the Y axis metric (stable across frames)
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

  private buildControlsBar(): HTMLDivElement {
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
    });

    // Play / Pause
    const pauseBtn = this.button('⏸ Pause', TOKEN.accent);
    pauseBtn.id = 'ui-btn-pause';
    pauseBtn.addEventListener('click', () => {
      this.physics.togglePause();
      pauseBtn.textContent = this.physics.isPaused ? '▶ Play' : '⏸ Pause';
    });
    bar.appendChild(pauseBtn);

    // Step once
    const stepBtn = this.button('⏭ Step', TOKEN.textMuted);
    stepBtn.title = 'Advance exactly one physics tick (useful when paused)';
    stepBtn.addEventListener('click', () => {
      this.physics.stepOnce(this.engine.getActiveExperiment());
    });
    bar.appendChild(stepBtn);

    // Reset — restores schema defaults, rebuilds sliders, and resets experiment state
    const resetBtn = this.button('↺ Reset', TOKEN.textMuted);
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
      //    back to their default positions visually.
      this.buildParameterPanel(exp.schema);

      // 4. Clear the graph buffer.
      this.resetGraph();

      // 5. Reset the accumulator so no leftover partial-tick debt carries over.
      this.physics.reset();
    });
    bar.appendChild(resetBtn);

    // Time-scale
    const tsLabel = document.createElement('div');
    tsLabel.style.cssText = `font-size:10px;color:${TOKEN.textMuted};font-family:${TOKEN.fontMono};margin-left:4px;white-space:nowrap;`;
    tsLabel.textContent = '1×';
    tsLabel.id = 'ui-ts-label';

    const tsSlider = document.createElement('input');
    tsSlider.type = 'range';
    tsSlider.min = '0';
    tsSlider.max = '4';
    tsSlider.step = '0.25';
    tsSlider.value = '1';
    tsSlider.title = 'Time Scale';
    this.styleSlider(tsSlider);
    tsSlider.style.flex = '1';
    tsSlider.style.minWidth = '0';
    tsSlider.addEventListener('input', () => {
      const scale = parseFloat(tsSlider.value);
      this.physics.setTimeScale(scale);
      tsLabel.textContent = `${scale}×`;
    });

    bar.appendChild(tsSlider);
    bar.appendChild(tsLabel);

    return bar;
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
        responsive: false,
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

  private styleSlider(slider: HTMLInputElement): void {
    slider.style.cssText += `
      -webkit-appearance:none;appearance:none;
      height:4px;border-radius:2px;
      background:linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${((parseFloat(slider.value) - parseFloat(slider.min)) /
        (parseFloat(slider.max) - parseFloat(slider.min))) *
      100
      }%,rgba(255,255,255,0.08) 0%);
      outline:none;cursor:pointer;
    `;

    // Re-colour track fill on every input event
    const updateTrack = () => {
      const pct =
        ((parseFloat(slider.value) - parseFloat(slider.min)) /
          (parseFloat(slider.max) - parseFloat(slider.min))) *
        100;
      slider.style.background = `linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${pct}%,rgba(255,255,255,0.08) ${pct}%)`;
    };
    slider.addEventListener('input', updateTrack);
  }

  private formatValue(key: string, val: number): string {
    if (key.endsWith('_deg')) return `${val.toFixed(2)} °`;
    if (key.endsWith('_s')) return `${val.toFixed(3)} s`;
    if (key.endsWith('_ms')) return `${val.toFixed(1)} m/s`;
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
