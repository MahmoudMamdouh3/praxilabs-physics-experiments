import type { Physics } from '../Physics.ts';
import type { Engine } from '../Engine.ts';
import type { ParameterSchema } from '../../experiments/IExperiment.ts';
import { TOKEN, el, button, styleSlider, formatValue } from './tokens.ts';

// ---------------------------------------------------------------------------
// ParameterPanel
// ---------------------------------------------------------------------------
// Owns the left-panel section that contains parameter sliders.
// Also owns the live readouts panel (right side of screen).
//
// Responsibilities:
//  - buildPanel(schema) — renders sliders in single or dual (A/B) mode
//  - buildSliderRow(key, schema, physics, suffix) — creates one slider+input row
//  - updateReadouts(measurements) — updates the right-side live value spans
//  - clearReadouts() — removes all readout rows before a schema rebuild
//  - formatValue / showToast delegate to token helpers
// ---------------------------------------------------------------------------

/** Callback type for triggering a graph reset from outside the panel. */
type OnGraphResetFn = () => void;

/** Callback type for showing a toast notification. */
type OnToastFn = (msg: string, type: 'warning' | 'info') => void;

export class ParameterPanel {
  /** The scrollable slot in the left panel where sliders are injected. */
  readonly paramSection: HTMLDivElement;

  /** Right-side panel showing live numeric readouts. */
  readonly readoutsPanel: HTMLDivElement;

  private readonly readoutsHeading: HTMLDivElement;

  // key → the <span> that shows the live value
  private readoutRows: Map<string, HTMLSpanElement> = new Map();

  // Measurement history for CSV export (owned here, read by ControlsBar)
  readonly measurementHistory: Array<Record<string, number>> = [];

  private readonly physics: Physics;
  private readonly physics2: Physics;
  private readonly engine: Engine;
  private readonly onGraphReset: OnGraphResetFn;
  private readonly onToast: OnToastFn;

  constructor(
    physics: Physics,
    physics2: Physics,
    engine: Engine,
    onGraphReset: OnGraphResetFn,
    onToast: OnToastFn,
  ) {
    this.physics = physics;
    this.physics2 = physics2;
    this.engine = engine;
    this.onGraphReset = onGraphReset;
    this.onToast = onToast;

    // ── Parameter section (injected into the left panel by UI.ts) ────────────
    this.paramSection = el('div', {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    // ── Right-side readouts panel ─────────────────────────────────────────────
    this.readoutsPanel = el('div', {
      width: '240px',
      padding: '14px 16px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      pointerEvents: 'none',
    });

    this.readoutsHeading = document.createElement('div');
    this.readoutsHeading.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:10px;`;
    this.readoutsHeading.textContent = 'Live Readouts';
    this.readoutsPanel.appendChild(this.readoutsHeading);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Rebuild the parameter sliders for the given schema.
   * In normal mode: one panel.
   * In compare mode: two colour-coded panels (Set A cyan, Set B orange).
   *
   * @param schema      - The experiment's parameter schema.
   * @param compareMode - When true, renders dual Set A / Set B panels.
   */
  buildPanel(schema: Record<string, ParameterSchema>, compareMode: boolean): void {
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

    if (compareMode) {
      this._buildDualPanel(schema);
    } else {
      this._buildSinglePanel(schema);
    }
  }

  /**
   * Update the live readout values from a measurements snapshot.
   * Called every render frame.
   */
  updateReadouts(measurements: Record<string, number>): void {
    this.measurementHistory.push({ ...measurements });

    for (const [key, val] of Object.entries(measurements)) {
      if (!this.readoutRows.has(key)) {
        this._addReadoutRow(key);
      }
      const span = this.readoutRows.get(key)!;
      span.textContent = formatValue(key, val);
    }
  }

  /**
   * Remove all readout rows from the DOM and clear the Map.
   * Must be called together — clearing the Map alone leaves orphan DOM nodes.
   */
  clearReadouts(): void {
    const children = Array.from(this.readoutsPanel.children);
    for (const child of children) {
      if (child !== this.readoutsHeading) {
        this.readoutsPanel.removeChild(child);
      }
    }
    this.readoutRows.clear();
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private _buildSinglePanel(schema: Record<string, ParameterSchema>): void {
    const panelBox = el('div', {
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

    for (const [key, s] of Object.entries(schema)) {
      panelBox.appendChild(this._buildSliderRow(key, s));
    }

    this.paramSection.appendChild(panelBox);
  }

  private _buildDualPanel(schema: Record<string, ParameterSchema>): void {
    const wrapper = el('div', { display: 'flex', flexDirection: 'column', gap: '8px' });

    // ── Set A (cyan) ──────────────────────────────────────────────────────────
    const panelA = el('div', {
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: '1px solid rgba(0,255,204,0.3)',
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    });
    const headA = document.createElement('div');
    headA.style.cssText = `font-size:10px;letter-spacing:2px;color:#00ffcc;font-family:${TOKEN.fontMono};text-transform:uppercase;`;
    headA.textContent = '● Set A (Cyan)';
    panelA.appendChild(headA);
    for (const [key, s] of Object.entries(schema)) {
      panelA.appendChild(this._buildSliderRow(key, s, this.physics, 'A'));
    }
    wrapper.appendChild(panelA);

    // ── Set B (orange) ────────────────────────────────────────────────────────
    const panelB = el('div', {
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: '1px solid rgba(255,153,0,0.3)',
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    });
    const headB = document.createElement('div');
    headB.style.cssText = `font-size:10px;letter-spacing:2px;color:#ff9900;font-family:${TOKEN.fontMono};text-transform:uppercase;`;
    headB.textContent = '● Set B (Orange)';
    panelB.appendChild(headB);
    for (const [key, s] of Object.entries(schema)) {
      panelB.appendChild(this._buildSliderRow(key, s, this.physics2, 'B'));
    }
    wrapper.appendChild(panelB);

    this.paramSection.appendChild(wrapper);
  }

  /**
   * Build one labelled slider row for a single parameter key.
   *
   * @param key           - Schema key (e.g. "gravity", "mass").
   * @param s             - Full ParameterSchema descriptor for this key.
   * @param physicsTarget - Which physics store to write to (defaults to Set A).
   * @param idSuffix      - Appended to DOM id for uniqueness in compare mode.
   */
  private _buildSliderRow(
    key: string,
    s: ParameterSchema,
    physicsTarget: Physics = this.physics,
    idSuffix: string = '',
  ): HTMLDivElement {
    const sliderId = `param-slider-${key}${idSuffix ? `-${idSuffix}` : ''}`;
    const row = el('div', { display: 'flex', flexDirection: 'column', gap: '4px' });

    // Top row: label + current value
    const topRow = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' });

    const label = document.createElement('label');
    label.htmlFor = sliderId;
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

    // Slider + number input
    const inputRow = el('div', { display: 'flex', gap: '6px', alignItems: 'center' });

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = sliderId;
    slider.min = String(s.min);
    slider.max = String(s.max);
    slider.step = String(s.step);
    slider.value = String(s.default);
    slider.style.flex = '1';
    styleSlider(slider);

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

    slider.addEventListener('input', (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      physicsTarget.currentParams[key] = val;
      valueDisplay.textContent = `${val.toFixed(2)} ${s.unit}`;
      styleSlider(slider);

      if (key === 'initialAngle' && Math.abs(val) === 180) {
        this.onToast('180° is a singular equilibrium point; it will not oscillate normally.', 'warning');
      }

      if (physicsTarget === this.physics2) {
        const exp2 = this.engine.getActiveExperiment2();
        if (exp2 !== null) exp2.reset(physicsTarget.currentParams);
      } else {
        const exp = this.engine.getActiveExperiment();
        if (exp !== null) {
          exp.reset(physicsTarget.currentParams);
          this.onGraphReset();
        }
      }
      numInput.value = String(val);
      physicsTarget.setParam(key, val);
    });

    numInput.addEventListener('change', () => {
      const val = parseFloat(numInput.value);
      const clamped = Math.min(s.max, Math.max(s.min, val));
      slider.value = String(clamped);
      numInput.value = String(clamped);
      valueDisplay.textContent = `${clamped.toFixed(2)} ${s.unit}`;
      styleSlider(slider);
      physicsTarget.setParam(key, clamped);
    });

    inputRow.appendChild(slider);
    inputRow.appendChild(numInput);
    row.appendChild(inputRow);

    // Min/max range labels
    const rangeLabels = el('div', { display: 'flex', justifyContent: 'space-between' });
    ([s.min, s.max] as const).forEach((bound) => {
      const lbl = document.createElement('span');
      lbl.style.cssText = `font-size:9px;color:${TOKEN.textMuted};font-family:${TOKEN.fontMono};`;
      lbl.textContent = String(bound);
      rangeLabels.appendChild(lbl);
    });
    row.appendChild(rangeLabels);

    return row;
  }

  private _addReadoutRow(key: string): void {
    const row = el('div', {
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

  /** Expose a styled ghost button for use in sibling modules (avoids re-importing). */
  static button = button;
}
