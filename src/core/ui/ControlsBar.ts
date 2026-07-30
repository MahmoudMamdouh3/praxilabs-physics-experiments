import type { Physics } from '../Physics.ts';
import type { Engine } from '../Engine.ts';
import { TOKEN, el, button, styleSlider } from './tokens.ts';
import { EXPERIMENT_REGISTRY } from '../UI.ts';
import type { ParameterPanel } from './ParameterPanel.ts';
import type { GraphPanel } from './GraphPanel.ts';

// ---------------------------------------------------------------------------
// ControlsBar
// ---------------------------------------------------------------------------
// Owns the top controls bar (Play/Pause, Reset, Step, CSV, Compare, Theme).
// Also manages the 'compareMode' state and the experiment switcher logic.
// ---------------------------------------------------------------------------

type OnToastFn = (msg: string, type: 'warning' | 'info') => void;
type OnModalWarningFn = (msg: string) => void;

export class ControlsBar {
  /** The DOM element for the bar itself — injected into sidePanel by UI.ts */
  readonly element: HTMLDivElement;
  
  /** The DOM element for the experiment switcher dropdown */
  readonly switcherElement: HTMLDivElement;

  private _compareMode: boolean = false;
  get compareMode(): boolean { return this._compareMode; }

  private readonly physics: Physics;
  private readonly physics2: Physics;
  private readonly engine: Engine;
  private readonly parameterPanel: ParameterPanel;
  private readonly graphPanel: GraphPanel;
  private readonly onToast: OnToastFn;
  private readonly onModalWarning: OnModalWarningFn;

  constructor(
    physics: Physics,
    physics2: Physics,
    engine: Engine,
    parameterPanel: ParameterPanel,
    graphPanel: GraphPanel,
    onToast: OnToastFn,
    onModalWarning: OnModalWarningFn
  ) {
    this.physics = physics;
    this.physics2 = physics2;
    this.engine = engine;
    this.parameterPanel = parameterPanel;
    this.graphPanel = graphPanel;
    this.onToast = onToast;
    this.onModalWarning = onModalWarning;

    this.switcherElement = this.buildSwitcher();
    this.element = this.buildBar();
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private buildSwitcher(): HTMLDivElement {
    const wrapper = el('div', {
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

    // Wait until next tick to populate, to ensure EXPERIMENT_REGISTRY is populated by main.ts
    setTimeout(() => {
      for (const entry of EXPERIMENT_REGISTRY) {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.label;
        select.appendChild(opt);
      }
    }, 0);

    select.addEventListener('change', () => {
      const entry = EXPERIMENT_REGISTRY.find((e) => e.id === select.value);
      if (!entry) return;

      // If compare mode is active, turn it off and dispose the second experiment
      if (this._compareMode) {
        this._compareMode = false;
        this.engine.disposeExperiment2();
        this.physics2.reset();
        this.physics2.pause();
        // Update UI button state implicitly handled since we rebuild panel below
        const compareBtn = document.getElementById('ui-btn-compare');
        if (compareBtn) {
            compareBtn.style.background = 'transparent';
            compareBtn.style.borderColor = 'rgba(255,153,0,0.2)';
            compareBtn.textContent = '⚖ Compare';
        }
      }

      const exp = entry.factory();
      this.physics.reset();
      this.graphPanel.reset();
      this.engine.loadExperiment(exp);

      // Seed physics params with schema defaults
      const defaults: Record<string, number> = {};
      for (const [k, s] of Object.entries(exp.schema)) defaults[k] = s.default;
      this.physics.setParams(defaults);

      this.parameterPanel.buildPanel(exp.schema, this._compareMode);
      
      const nameEl = document.getElementById('ui-exp-name');
      const descEl = document.getElementById('ui-exp-desc');
      if (nameEl) nameEl.textContent = exp.name;
      if (descEl) descEl.textContent = exp.description;
    });

    wrapper.appendChild(select);
    return wrapper;
  }

  private buildBar(): HTMLDivElement {
    const bar = el('div', {
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
    const pauseBtn = button('▶ Play', TOKEN.accent);
    pauseBtn.id = 'ui-btn-pause';
    pauseBtn.addEventListener('click', () => {
      this.physics.togglePause();
      pauseBtn.textContent = this.physics.isPaused ? '▶ Play' : '⏸ Pause';
    });
    bar.appendChild(pauseBtn);

    // ── Step once ─────────────────────────────────────────────────────────────
    const stepBtn = button('⏭ Step', TOKEN.textMuted);
    stepBtn.title = 'Advance exactly one physics tick (useful when paused)';
    stepBtn.addEventListener('click', () => {
      this.physics.stepOnce(this.engine.getActiveExperiment());
    });
    bar.appendChild(stepBtn);

    // ── Reset ─────────────────────────────────────────────────────────────────
    const resetBtn = button('↺ Reset', TOKEN.textMuted);
    bar.appendChild(resetBtn);

    // ── CSV Export ────────────────────────────────────────────────────────────
    const csvBtn = button('Download CSV', TOKEN.accent);
    csvBtn.title = 'Download measurement history as CSV';
    csvBtn.addEventListener('click', () => {
      if (this.parameterPanel.measurementHistory.length === 0) return;

      const keys = Array.from(new Set(this.parameterPanel.measurementHistory.flatMap(Object.keys)));
      const headerRow = keys.join(',');
      const rows = this.parameterPanel.measurementHistory.map(row => {
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

    // ── Compare Mode Toggle ────────────────────────────────────────────────────
    const compareBtn = button('⚖ Compare', '#ff9900');
    compareBtn.id = 'ui-btn-compare';
    compareBtn.title = 'Toggle side-by-side comparison of two parameter sets for the same experiment';
    compareBtn.addEventListener('click', () => {
      this._compareMode = !this._compareMode;

      if (this._compareMode) {
        compareBtn.style.background = 'rgba(255,153,0,0.18)';
        compareBtn.style.borderColor = '#ff9900';
        compareBtn.textContent = '⚖ Comparing';

        const activeEntry = EXPERIMENT_REGISTRY.find(
          (e) => e.id === (this.engine.getActiveExperiment()?.id ?? '')
        );
        if (activeEntry) {
          const exp2 = activeEntry.factory();
          const defaults2: Record<string, number> = {};
          for (const [k, s] of Object.entries(exp2.schema)) defaults2[k] = s.default;
          this.physics2.setParams(defaults2);
          this.engine.loadExperiment2(exp2);
          this.physics2.reset();
          this.physics2.pause();
        }

        const currentExp = this.engine.getActiveExperiment();
        if (currentExp) this.parameterPanel.buildPanel(currentExp.schema, this._compareMode);
        this.onToast('Comparison mode ON — Set B appears 30 units right. Press Play to run both.', 'info');

      } else {
        compareBtn.style.background = 'transparent';
        compareBtn.style.borderColor = 'rgba(255,153,0,0.2)';
        compareBtn.textContent = '⚖ Compare';

        this.engine.disposeExperiment2();
        this.physics2.reset();
        this.physics2.pause();
        this.graphPanel.reset();

        const currentExp = this.engine.getActiveExperiment();
        if (currentExp) this.parameterPanel.buildPanel(currentExp.schema, this._compareMode);
        this.onToast('Comparison mode OFF.', 'info');
      }
    });
    bar.appendChild(compareBtn);


    // ── Time-scale row ─────────────────────────────────────────────────────────
    const tsRow = el('div', {
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
    tsStaticLabel.textContent = 'Time Scale:';
    tsRow.appendChild(tsStaticLabel);

    const tsSlider = document.createElement('input');
    tsSlider.type = 'range';
    tsSlider.id = 'ui-ts-slider';
    tsSlider.min = '0';
    tsSlider.max = '4';
    tsSlider.step = '0.5';
    tsSlider.value = '1';
    tsSlider.title = 'Time Scale';
    styleSlider(tsSlider);
    tsSlider.style.flex = '1';
    tsSlider.style.minWidth = '0';
    tsRow.appendChild(tsSlider);

    const tsLabel = document.createElement('div') as HTMLDivElement;
    tsLabel.style.cssText = `font-size:10px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};white-space:nowrap;flex-shrink:0;min-width:28px;text-align:right;`;
    tsLabel.textContent = '1×';
    tsLabel.id = 'ui-ts-label';
    tsRow.appendChild(tsLabel);

    tsSlider.addEventListener('input', (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.physics.setTimeScale(val);
      tsLabel.textContent = `${val}×`;
      styleSlider(tsSlider);
      if (val === 0) {
        this.onModalWarning('Time scale is 0. The simulation is frozen.');
      }
    });
    bar.appendChild(tsRow);

    // ── Wire up Reset ─────────────────────────────────────────────────────────
    resetBtn.addEventListener('click', () => {
      const exp = this.engine.getActiveExperiment();
      if (exp === null) return;

      const defaults: Record<string, number> = {};
      for (const [k, s] of Object.entries(exp.schema)) defaults[k] = s.default;
      this.physics.setParams(defaults);
      exp.reset(this.physics.currentParams);

      this.parameterPanel.buildPanel(exp.schema, this._compareMode);

      this.graphPanel.reset();
      this.parameterPanel.measurementHistory.length = 0;

      this.physics.reset();
      this.physics.pause();
      this.physics.setTimeScale(1);
      
      pauseBtn.textContent = '▶ Play';
      tsSlider.value = '1';
      tsLabel.textContent = '1×';
      styleSlider(tsSlider);

      this.engine.resetCamera();
    });

    return bar;
  }
}
