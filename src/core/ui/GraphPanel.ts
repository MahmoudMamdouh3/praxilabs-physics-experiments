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
import type { Physics } from '../Physics.ts';
import { TOKEN, el, styleSlider } from './tokens.ts';

// Register Chart.js components exactly once (tree-shaking friendly).
Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

// ---------------------------------------------------------------------------
// GraphPanel
// ---------------------------------------------------------------------------
// Owns the Chart.js instance and its canvas wrapper.
// Responsible for:
//  - Building the bottom graph panel DOM element
//  - Plotting Set A (cyan) measurements every render frame
//  - Optionally plotting Set B (orange) measurements in comparison mode
//  - Resetting the buffer when experiments switch or Reset is pressed
// ---------------------------------------------------------------------------


export class GraphPanel {
  /** The DOM container for the graph panel — append to the shell. */
  readonly element: HTMLDivElement;

  private readonly canvas: HTMLCanvasElement;
  private chart: Chart | null = null;

  private readonly pointsA: Array<{ x: number; y: number }> = [];
  private readonly pointsB: Array<{ x: number; y: number }> = [];

  private readonly pointsA_KE: Array<{ x: number; y: number }> = [];
  private readonly pointsA_PE: Array<{ x: number; y: number }> = [];
  private readonly pointsA_TE: Array<{ x: number; y: number }> = [];
  private readonly pointsB_KE: Array<{ x: number; y: number }> = [];
  private readonly pointsB_PE: Array<{ x: number; y: number }> = [];
  private readonly pointsB_TE: Array<{ x: number; y: number }> = [];

  /** The measurement key currently plotted on the Y axis in Primary mode. */
  private graphKey: string = '';
  private isEnergyMode: boolean = false;
  private readonly physics: Physics;
  
  /** Dynamic rolling window for graph zoom */
  private maxPoints: number = 5000;

  constructor(physics: Physics) {
    this.physics = physics;
    // ── Outer panel (bottom, centre of screen) ───────────────────────────────
    // Start with a left offset that matches the left-side panel width (320px + margin)
    this.element = el('div', {
      position: 'absolute',
      bottom: '16px',
      left: '336px',
      height: '180px',
      width: 'min(900px, calc(100vw - 368px))',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      padding: '10px 14px 8px',
      overflow: 'hidden',
      pointerEvents: 'auto', // Allow clicks so dropdown and zoom slider work
      boxSizing: 'border-box',
    });

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:6px; cursor:grab;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex; align-items:center; gap:8px;';

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:10px;';

    const graphLabel = document.createElement('div');
    graphLabel.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;`;
    graphLabel.textContent = 'MEASUREMENT GRAPH (DRAG TO MOVE)';
    headerLeft.appendChild(graphLabel);

    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '▾';
    collapseBtn.title = 'Collapse or expand the graph panel';
    collapseBtn.style.cssText = `background:transparent;border:none;color:${TOKEN.textMuted};cursor:pointer;font-size:11px;`;
    collapseBtn.addEventListener('click', () => {
      const body = this.element.querySelector('[data-panel-body]') as HTMLElement | null;
      if (!body) return;
      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? 'flex' : 'none';
      collapseBtn.textContent = isCollapsed ? '▾' : '▸';
      this.element.style.height = isCollapsed ? '180px' : '36px';
    });
    headerLeft.appendChild(collapseBtn);

    const modeSelect = document.createElement('select');
    modeSelect.id = 'graph-mode-select';
    modeSelect.style.cssText = `
      background: transparent;
      color: ${TOKEN.textMuted};
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      font-size: 9px;
      font-family: ${TOKEN.fontMono};
      text-transform: uppercase;
      padding: 2px 4px;
      cursor: pointer;
      outline: none;
    `;
    const optPrimary = document.createElement('option');
    optPrimary.value = 'primary';
    optPrimary.textContent = 'Primary Variable';
    const optEnergy = document.createElement('option');
    optEnergy.value = 'energy';
    optEnergy.textContent = 'Energy Plot';
    modeSelect.appendChild(optPrimary);
    modeSelect.appendChild(optEnergy);
    
    modeSelect.addEventListener('change', () => {
      this.isEnergyMode = modeSelect.value === 'energy';
      if (this.chart) {
        this.chart.update('none');
        this.updateLegend();
      }
    });
    headerLeft.appendChild(modeSelect);

    const topControls = el('div', { display: 'flex', alignItems: 'center', gap: '12px' });

    // Zoom slider
    const zoomWrapper = el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    const zoomLabel = el('span', { fontSize: '10px', color: TOKEN.textMuted, fontFamily: TOKEN.fontSans });
    zoomLabel.textContent = 'Zoom:';
    const zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    // More granular and wider zoom range so user can zoom out further and with better precision
    zoomSlider.min = '50';
    zoomSlider.max = '10000';
    zoomSlider.step = '1';
    zoomSlider.value = String(this.maxPoints);
    zoomSlider.style.cssText = `width: 220px; accent-color:${TOKEN.accent};`;
    zoomSlider.addEventListener('input', (e) => {
      // Direct mapping: more points => more zoomed-out
      this.maxPoints = parseInt((e.target as HTMLInputElement).value, 10) || 10000;
    });
    // Style the zoom slider track for visibility
    styleSlider(zoomSlider);
    zoomWrapper.appendChild(zoomLabel);
    zoomWrapper.appendChild(zoomSlider);
    topControls.appendChild(zoomWrapper);

    headerRight.appendChild(topControls);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    this.element.appendChild(header);

    // Wrap all graph body content so collapse only hides the body, not the header.
    const panelBody = el('div', { display:'flex', flexDirection:'column', gap:'8px', width:'100%' });
    panelBody.dataset.panelBody = 'true';

    // Make the panel draggable by its header
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    header.addEventListener('pointerdown', (ev) => {
      const targetTag = (ev.target as HTMLElement).tagName.toLowerCase();
      if (['button', 'select', 'input', 'option'].includes(targetTag)) return;
      
      isDragging = true;
      header.setPointerCapture(ev.pointerId);
      const rect = this.element.getBoundingClientRect();
      dragOffsetX = ev.clientX - rect.left;
      dragOffsetY = ev.clientY - rect.top;
      this.element.style.transition = 'none';
      this.element.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', (ev) => {
      if (!isDragging) return;
      const x = ev.clientX - dragOffsetX;
      const y = ev.clientY - dragOffsetY;
      // Keep within viewport bounds with a small margin
      const margin = 8;
      const maxX = window.innerWidth - this.element.offsetWidth - margin;
      const maxY = window.innerHeight - this.element.offsetHeight - margin;
      this.element.style.left = `${Math.min(Math.max(margin, x), Math.max(margin, maxX))}px`;
      this.element.style.top = `${Math.min(Math.max(margin, y), Math.max(margin, maxY))}px`;
      // When dragging, unset bottom to allow top positioning
      this.element.style.bottom = '';
      this.element.style.position = 'fixed';
    });
    window.addEventListener('pointerup', (ev) => {
      if (!isDragging) return;
      isDragging = false;
      try { header.releasePointerCapture(ev.pointerId); } catch (e) {}
      this.element.style.cursor = 'grab';
      this.element.style.transition = '';
    });

    // Sized wrapper: Chart.js reads clientWidth × clientHeight for HiDPI scaling.
    const chartWrapper = document.createElement('div');
    chartWrapper.dataset.chartWrapper = 'true';
    // Layout chart + persistent legend side-by-side
    chartWrapper.style.cssText = 'position:relative;display:flex;flex-direction:row;width:100%;height:130px;overflow:hidden;align-items:stretch;';

    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.cssText = 'flex:1;min-width:200px;height:100%;';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;';
    canvasWrapper.appendChild(this.canvas);
    chartWrapper.appendChild(canvasWrapper);

    // Persistent legend column on the right of the graph
    const legendCol = document.createElement('div');
    legendCol.style.cssText = `width:170px;padding-left:10px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;align-items:flex-start;justify-content:center;`;
    legendCol.setAttribute('data-legend-col', 'true');
    chartWrapper.appendChild(legendCol);

    panelBody.appendChild(chartWrapper);

    this.element.appendChild(panelBody);

    // Populate the legend column initially (will be updated on data)
    const legendColEl = this.element.querySelector('[data-legend-col]') as HTMLDivElement | null;
    if (legendColEl) {
      legendColEl.innerHTML = '';
    }

    this.initChart();

    // Accessibility: ensure the panel never overlaps the left-side parameter panel
    const ensureNoOverlap = () => {
      const leftPanel = document.querySelector('div[style*="left: 16px"][style*="width: 320px"]') as HTMLElement | null;
      if (leftPanel) {
        const leftRect = leftPanel.getBoundingClientRect();
        const minLeft = Math.ceil(leftRect.right + 16);
        const currentLeft = parseInt(this.element.style.left || '336', 10);
        if (currentLeft < minLeft) this.element.style.left = `${minLeft}px`;
      }
    };
    window.addEventListener('resize', ensureNoOverlap);
    ensureNoOverlap();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Push a new measurement frame into the rolling buffer and redraw.
   * Skips the update when the primary physics engine is paused to avoid
   * Chart.js re-rendering frozen data at 60fps.
   *
   * @param measurements  - Set A live readout (always required).
   * @param measurements2 - Set B readout; only used when compareMode is true.
   * @param compareMode   - When true, the orange Set B line is plotted.
   */
  update(
    measurements: Record<string, number>,
    measurements2?: Record<string, number> | null,
    compareMode: boolean = false,
  ): void {
    if (this.chart === null) return;
    if (this.physics.isPaused) return;

    const t = measurements['time_s'] ?? 0;

    // Latch the Y-axis key on the first frame of a new experiment.
    if (this.graphKey === '') {
      const firstKey = Object.keys(measurements).find((k) => k !== 'time_s');
      this.graphKey = firstKey ?? '';
    }

    // ── Set A Primary ────────────────────────────────────────────────────────
    const y = measurements[this.graphKey] ?? 0;
    this.pointsA.push({ x: t, y });
    
    // ── Set A Energy ─────────────────────────────────────────────────────────
    const keA = measurements['kinetic_energy'] ?? 0;
    const peA = measurements['potential_energy'] ?? 0;
    const teA = measurements['total_energy'] ?? 0;
    this.pointsA_KE.push({ x: t, y: keA });
    this.pointsA_PE.push({ x: t, y: peA });
    this.pointsA_TE.push({ x: t, y: teA });

    // Truncate arrays if they exceed maxPoints
    if (this.pointsA.length > this.maxPoints) this.pointsA.splice(0, this.pointsA.length - this.maxPoints);
    if (this.pointsA_KE.length > this.maxPoints) this.pointsA_KE.splice(0, this.pointsA_KE.length - this.maxPoints);
    if (this.pointsA_PE.length > this.maxPoints) this.pointsA_PE.splice(0, this.pointsA_PE.length - this.maxPoints);
    if (this.pointsA_TE.length > this.maxPoints) this.pointsA_TE.splice(0, this.pointsA_TE.length - this.maxPoints);

    const dss = this.chart.data.datasets as ChartDataset<'line', Array<{ x: number; y: number }>>[];
    dss[0].data = [...this.pointsA];
    dss[0].label = `Set A: ${this.graphKey}`;
    dss[2].data = [...this.pointsA_KE];
    dss[3].data = [...this.pointsA_PE];
    dss[4].data = [...this.pointsA_TE];

    // ── Set B (comparison mode only) ─────────────────────────────────────────
    if (compareMode && measurements2 != null) {
      const t2 = measurements2['time_s'] ?? 0;
      const y2 = measurements2[this.graphKey] ?? 0;
      this.pointsB.push({ x: t2, y: y2 });
      dss[1].data = [...this.pointsB];
      dss[1].label = `Set B: ${this.graphKey}`;

      const keB = measurements2['kinetic_energy'] ?? 0;
      const peB = measurements2['potential_energy'] ?? 0;
      const teB = measurements2['total_energy'] ?? 0;
      this.pointsB_KE.push({ x: t2, y: keB });
      this.pointsB_PE.push({ x: t2, y: peB });
      this.pointsB_TE.push({ x: t2, y: teB });
      
      // Truncate arrays if they exceed maxPoints
      if (this.pointsB.length > this.maxPoints) this.pointsB.splice(0, this.pointsB.length - this.maxPoints);
      if (this.pointsB_KE.length > this.maxPoints) this.pointsB_KE.splice(0, this.pointsB_KE.length - this.maxPoints);
      if (this.pointsB_PE.length > this.maxPoints) this.pointsB_PE.splice(0, this.pointsB_PE.length - this.maxPoints);
      if (this.pointsB_TE.length > this.maxPoints) this.pointsB_TE.splice(0, this.pointsB_TE.length - this.maxPoints);
      
      dss[5].data = [...this.pointsB_KE];
      dss[6].data = [...this.pointsB_PE];
      dss[7].data = [...this.pointsB_TE];
    }

    // ── Update Dataset Visibility ───────────────────────────────────────────
    if (this.isEnergyMode) {
      dss[0].hidden = dss[1].hidden = true;
      // Show Set A Energy
      dss[2].hidden = dss[3].hidden = dss[4].hidden = false;
      // Show Set B Energy if in compare mode
      dss[5].hidden = dss[6].hidden = dss[7].hidden = !compareMode;
    } else {
      // Show Primary
      dss[0].hidden = false;
      dss[1].hidden = !compareMode;
      // Hide all energy datasets
      for (let i = 2; i <= 7; i++) {
        dss[i].hidden = true;
      }
    }

    this.chart.update('none'); // 'none' skips animation for performance
    this.updateLegend();
  }

  /**
   * Clear both rolling buffers and wipe the chart.
   * Call when the user switches experiments or clicks Reset.
   */
  reset(): void {
    this.pointsA.length = 0;
    this.pointsB.length = 0;
    this.pointsA_KE.length = 0;
    this.pointsA_PE.length = 0;
    this.pointsA_TE.length = 0;
    this.pointsB_KE.length = 0;
    this.pointsB_PE.length = 0;
    this.pointsB_TE.length = 0;
    this.graphKey = '';

    if (this.chart !== null) {
      for (let i = 0; i < 8; i++) {
        (this.chart.data.datasets[i] as ChartDataset<'line', Array<{ x: number; y: number }>>).data = [];
      }
      this.chart.update('none');
      this.updateLegend();
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private initChart(): void {
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;

    const self = this;
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Set A',
            data: [],
            borderColor: '#00ffcc',               // Cyan — Set A primary line
            backgroundColor: 'rgba(0,255,204,0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.4,
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          {
            label: 'Set B',
            data: [],
            borderColor: '#ff9900',               // Orange — Set B comparison line
            backgroundColor: 'rgba(255,153,0,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            hidden: true,                          // Shown only in comparison mode
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          // ── Set A Energy ──
          {
            label: 'Kinetic A', data: [], borderColor: '#ffff00', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true,
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          {
            label: 'Potential A', data: [], borderColor: '#00ccff', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true,
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          {
            label: 'Total A', data: [], borderColor: '#00ffaa', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true,
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          // ── Set B Energy ──
          {
            label: 'Kinetic B', data: [], borderColor: '#ffff00', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true, borderDash: [5, 5],
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          {
            label: 'Potential B', data: [], borderColor: '#00ccff', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true, borderDash: [5, 5],
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
          {
            label: 'Total B', data: [], borderColor: '#00ffaa', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, hidden: true, borderDash: [5, 5],
          } as ChartDataset<'line', Array<{ x: number; y: number }>>,
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)', // Chart.js Canvas cannot read CSS variables
              font: { family: TOKEN.fontMono, size: 9 },
              maxTicksLimit: 6,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { color: 'rgba(255,255,255,0.08)' },
          },
          y: {
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)', // Chart.js Canvas cannot read CSS variables
              font: { family: TOKEN.fontMono, size: 9 },
              maxTicksLimit: 5,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { color: 'rgba(255,255,255,0.08)' },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
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
              label: (item) => {
                const label = item.dataset.label || '';
                return `${label}: ${(item.parsed.y ?? 0).toFixed(4)}`;
              },
              footer: (items) => {
                if (self.isEnergyMode) {
                  const lbl = items[0]?.dataset.label || '';
                  if (/Kinetic/i.test(lbl)) return 'Kinetic energy (½ m v²)';
                  if (/Potential/i.test(lbl)) return 'Potential energy (m g h or ½ k x²)';
                  if (/Total/i.test(lbl)) return 'Total mechanical energy (KE + PE)';
                }
                return self.graphKey ? `Primary: ${self.graphKey}` : '';
              },
            },
          },
        },
      },
    });
    this.updateLegend();
  }

  private updateLegend(): void {
    if (!this.chart) return;
    const legendCol = this.element.querySelector('[data-legend-col]') as HTMLElement | null;
    if (!legendCol) return;
    legendCol.innerHTML = '';

    for (const ds of (this.chart.data.datasets || [])) {
      if (ds.hidden) continue;
      const item = document.createElement('div');
      item.style.cssText = `display:flex;align-items:center;gap:8px;font-family:${TOKEN.fontMono};font-size:12px;color:${TOKEN.textBright};`;
      const box = document.createElement('span');
      box.style.cssText = `width:14px;height:14px;display:inline-block;border-radius:2px;background:${(ds as any).borderColor || '#fff'};`;
      const lbl = document.createElement('span');
      lbl.textContent = ds.label || '';
      item.appendChild(box);
      item.appendChild(lbl);
      legendCol.appendChild(item);
    }
  }
}
