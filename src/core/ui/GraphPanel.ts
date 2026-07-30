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
import { TOKEN, el } from './tokens.ts';

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

/** Maximum rolling data-points kept in each graph buffer. */
const MAX_GRAPH_POINTS = 150;

export class GraphPanel {
  /** The DOM container for the graph panel — append to the shell. */
  readonly element: HTMLDivElement;

  private readonly canvas: HTMLCanvasElement;
  private chart: Chart | null = null;

  private readonly pointsA: Array<{ x: number; y: number }> = [];
  private readonly pointsB: Array<{ x: number; y: number }> = [];

  /** The measurement key currently plotted on the Y axis. */
  private graphKey: string = '';
  private readonly physics: Physics;

  constructor(physics: Physics) {
    this.physics = physics;
    // ── Outer panel (bottom, centre of screen) ───────────────────────────────
    this.element = el('div', {
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
      overflow: 'hidden',
      pointerEvents: 'none',
    });

    const graphLabel = document.createElement('div');
    graphLabel.style.cssText = `font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:6px;`;
    graphLabel.textContent = 'Measurement Graph';
    this.element.appendChild(graphLabel);

    // Sized wrapper: Chart.js reads clientWidth × clientHeight for HiDPI scaling.
    const chartWrapper = document.createElement('div');
    chartWrapper.style.cssText = 'position:relative;width:100%;height:130px;overflow:hidden;';

    this.canvas = document.createElement('canvas');
    chartWrapper.appendChild(this.canvas);
    this.element.appendChild(chartWrapper);

    this.initChart();
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

    // ── Set A ────────────────────────────────────────────────────────────────
    const y = measurements[this.graphKey] ?? 0;
    this.pointsA.push({ x: t, y });
    if (this.pointsA.length > MAX_GRAPH_POINTS) this.pointsA.shift();

    const dsA = this.chart.data.datasets[0] as ChartDataset<'line', Array<{ x: number; y: number }>>;
    dsA.data = [...this.pointsA];
    dsA.label = `Set A: ${this.graphKey}`;

    // ── Set B (comparison mode only) ─────────────────────────────────────────
    const dsB = this.chart.data.datasets[1] as ChartDataset<'line', Array<{ x: number; y: number }>>;
    if (compareMode && measurements2 != null) {
      const t2 = measurements2['time_s'] ?? 0;
      const y2 = measurements2[this.graphKey] ?? 0;
      this.pointsB.push({ x: t2, y: y2 });
      if (this.pointsB.length > MAX_GRAPH_POINTS) this.pointsB.shift();
      dsB.data = [...this.pointsB];
      dsB.label = `Set B: ${this.graphKey}`;
      dsB.hidden = false;
    } else {
      dsB.hidden = true;
    }

    this.chart.update('none'); // 'none' skips animation for performance
  }

  /**
   * Clear both rolling buffers and wipe the chart.
   * Call when the user switches experiments or clicks Reset.
   */
  reset(): void {
    this.pointsA.length = 0;
    this.pointsB.length = 0;
    this.graphKey = '';

    if (this.chart !== null) {
      (this.chart.data.datasets[0] as ChartDataset<'line', Array<{ x: number; y: number }>>).data = [];
      (this.chart.data.datasets[1] as ChartDataset<'line', Array<{ x: number; y: number }>>).data = [];
      this.chart.update('none');
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private initChart(): void {
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;

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
          legend: {
            display: true,
            labels: {
              color: TOKEN.textMuted,
              font: { family: TOKEN.fontMono, size: 9 },
              boxWidth: 12,
              filter: (item) => !item.hidden,
            },
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
              label: (item) => `${this.graphKey}: ${(item.parsed.y ?? 0).toFixed(4)}`,
            },
          },
        },
      },
    });
  }
}
