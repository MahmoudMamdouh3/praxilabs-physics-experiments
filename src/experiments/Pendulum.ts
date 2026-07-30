import * as THREE from 'three';
import type { IExperiment, ParameterSchema } from './IExperiment.ts';

// ---------------------------------------------------------------------------
// Pendulum — Experiment A
// ---------------------------------------------------------------------------
// Models a simple pendulum using the exact equation of motion:
//
//   α = -(g / L) * sin(θ) - b * ω
//
// where:
//   θ  — angle from vertical (radians, positive = right)
//   ω  — angular velocity (rad/s)
//   α  — angular acceleration (rad/s²)
//   g  — gravitational acceleration (m/s²)
//   L  — pendulum length (m)
//   b  — linear damping coefficient
//
// Integration: Semi-Implicit Euler (velocity updated first, then position)
//   ω(n+1) = ω(n) + α(n) * dt
//   θ(n+1) = θ(n) + ω(n+1) * dt
//
// Zero-crossing detection: each time θ changes sign the pendulum has
// completed half a swing; two consecutive crossings = one full period.
// ---------------------------------------------------------------------------

export class Pendulum implements IExperiment {
  // ── IExperiment identity ──────────────────────────────────────────────────

  readonly id = 'pendulum';
  readonly name = 'Simple Pendulum';
  readonly description =
    'A simple pendulum demonstrating the exact (non-linear) equation of motion ' +
    'with optional damping, integrated via Semi-Implicit Euler.';
  
  readonly tutorialHtml = `
    <div style="margin-bottom:16px;">
      <h3 style="color:#22aaff; margin-top:0; margin-bottom:8px; font-size:16px; letter-spacing:1px; text-transform:uppercase;">Learning Objectives</h3>
      <ul style="margin:0; padding-left:20px; color:#cdd2d9;">
        <li style="margin-bottom:6px;">Understand the motion of a simple pendulum under a <strong>small angle approximation</strong>.</li>
        <li style="margin-bottom:6px;">Introduce <strong>Simple Harmonic Motion (SHM)</strong> as an example of periodic motion.</li>
        <li style="margin-bottom:6px;">Analyze the mathematical relationship between physical pendulum motion and theoretical SHM.</li>
      </ul>
    </div>
    
    <div>
      <h3 style="color:#22aaff; margin-top:0; margin-bottom:8px; font-size:16px; letter-spacing:1px; text-transform:uppercase;">Procedure</h3>
      <ol style="margin:0; padding-left:20px; color:#cdd2d9;">
        <li style="margin-bottom:6px;">Adjust the Pendulum Length to your desired starting point (e.g., <strong>2.00 m</strong>).</li>
        <li style="margin-bottom:6px;">Set the Initial Angle. For the small angle approximation to hold, keep it under <strong>15°</strong>.</li>
        <li style="margin-bottom:6px;">The simulation will count exactly <strong>20 complete oscillations</strong> (A → B → A).</li>
        <li style="margin-bottom:6px;">Once 20 laps are reached, the system will automatically pause and log the theoretical vs measured period.</li>
        <li style="margin-bottom:6px;">Click <strong>Download CSV</strong> to record your results, then repeat with different lengths.</li>
      </ol>
    </div>
  `;

  // ── Parameter schema ──────────────────────────────────────────────────────

  readonly schema: Record<string, ParameterSchema> = {
    length: {
      description: 'Pendulum Length',
      unit: 'm',
      min: 0.1,
      max: 10,
      default: 2,
      step: 0.1,
      tooltip: 'The length of the string from the pivot to the center of the bob. Controls the period of oscillation.',
    },
    gravity: {
      description: 'Gravitational Acceleration',
      unit: 'm/s²',
      min: 0,
      max: 20,
      default: 9.81,
      step: 0.01,
      tooltip: 'The strength of gravity pulling the bob downwards. Earth is ~9.81 m/s².',
    },
    initialAngle: {
      description: 'Initial Angle',
      unit: '°',
      min: -180,
      max: 180,
      default: 45,
      step: 1,
      tooltip: 'The starting displacement angle from the vertical equilibrium (0°).',
    },
    damping: {
      description: 'Damping Coefficient',
      unit: '',
      min: 0,
      max: 5,
      default: 0,
      step: 0.01,
      tooltip: 'Air resistance or friction that causes the pendulum to lose energy and eventually stop.',
    },
    targetOscillations: {
      description: 'Target Oscillations',
      unit: '',
      min: 1,
      max: 100,
      default: 20,
      step: 1,
      tooltip: 'Number of oscillations to count before automatically pausing the simulation.',
    },
  };

  // ── Physics state ─────────────────────────────────────────────────────────

  /** Current angle from vertical (radians). Positive = right of vertical. */
  private theta: number = 0;

  /** Current angular velocity (rad/s). */
  private omega: number = 0;

  /** Elapsed simulation time (seconds). */
  private time: number = 0;
  
  /** The current length used in the last physics tick (for rendering). */
  private currentL: number = 0;

  // ── Period measurement via zero-crossing detection ─────────────────────────

  /** Sign of theta on the previous tick (+1, -1, or 0). */
  private prevSign: number = 0;

  /** Simulation time of the last zero-crossing (s). */
  private lastCrossingTime: number = 0;

  /** Whether we have recorded at least one crossing (to anchor the period). */
  private hasCrossing: boolean = false;

  /** The most recently measured full period (one full swing = 2 crossings, s). */
  private measuredPeriod: number = 0;

  private cachedParams: Record<string, number> = {};

  private hasRenderedFinalLap: boolean = false;

  /** Time of the crossing before `lastCrossingTime` — used to compute full period. */
  private prevCrossingTime: number = 0;

  // ── Lab Workflow State (Virtual Stopwatch) ────────────────────────────────
  
  /** Number of full oscillations (1 oscillation = A -> B -> A = 2 zero crossings) */
  private lapCount: number = 0;
  
  /** Have we auto-paused yet? */
  private autoPaused: boolean = false;
  
  /** Elapsed stopwatch time (s) */
  private stopwatchTime: number = 0;

  /** HTML overlay for the virtual stopwatch. */
  private htmlStopwatch: HTMLDivElement | null = null;

  /** HTML overlay for the period measurement readouts. */
  private htmlPeriodMetrics: HTMLDivElement | null = null;

  // ── Three.js objects ──────────────────────────────────────────────────────

  /** Root anchor point — always at world origin (0, 0, 0). */
  private pivot: THREE.Object3D | null = null;

  /** The string, rendered as a two-point Line. */
  private stringLine: THREE.Line | null = null;
  private stringGeometry: THREE.BufferGeometry | null = null;
  private stringMaterial: THREE.LineBasicMaterial | null = null;

  /** The pendulum bob. */
  private bobMesh: THREE.Mesh | null = null;
  private bobGeometry: THREE.SphereGeometry | null = null;
  private bobMaterial: THREE.MeshStandardMaterial | null = null;

  /** Reference to the scene — needed so `dispose()` can remove objects. */
  private scene: THREE.Scene | null = null;

  // ── IExperiment lifecycle ─────────────────────────────────────────────────

  setup(scene: THREE.Scene): void {
    this.scene = scene;

    // ── String ───────────────────────────────────────────────────────────────
    // Two vertices: pivot (top) and bob (bottom). Updated every tick.
    this.stringGeometry = new THREE.BufferGeometry();
    // Placeholder positions — will be set on the first update() call.
    const positions = new Float32Array(6); // 2 × vec3
    this.stringGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    this.stringMaterial = new THREE.LineBasicMaterial({
      color: 0xd4af7a, // warm brass — industrial aesthetic
      linewidth: 1,    // note: WebGL only supports linewidth=1 on most GPUs
    });
    this.stringLine = new THREE.Line(this.stringGeometry, this.stringMaterial);
    scene.add(this.stringLine);

    // ── HTML Stopwatch Overlay ───────────────────────────────────────────────
    this.htmlStopwatch = document.createElement('div');
    this.htmlStopwatch.style.cssText = `
      position: absolute;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(13, 13, 15, 0.8);
      backdrop-filter: blur(8px);
      border: 1px solid #22aaff;
      border-radius: 8px;
      padding: 16px 24px;
      color: #22aaff;
      font-family: monospace;
      font-size: 24px;
      text-align: center;
      pointer-events: none;
      z-index: 15;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    `;
    this.htmlStopwatch.innerHTML = `
      <div id="pendulum-laps" style="font-size: 10px; letter-spacing: 2px; color: #8a95a8; margin-bottom: 4px; text-transform: uppercase;">Oscillations: 0 / 20</div>
      <div id="pendulum-time">00.00 s</div>
    `;
    document.body.appendChild(this.htmlStopwatch);

    this.htmlPeriodMetrics = document.createElement('div');
    this.htmlPeriodMetrics.style.cssText = `
      position: absolute;
      top: 190px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(13, 13, 15, 0.8);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(34, 170, 255, 0.45);
      border-radius: 8px;
      padding: 12px 18px;
      color: #cdd2d9;
      font-family: monospace;
      font-size: 13px;
      text-align: center;
      pointer-events: none;
      z-index: 15;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    `;
    this.htmlPeriodMetrics.innerHTML = `
      <div style="font-size:10px; letter-spacing:2px; color:#8a95a8; text-transform:uppercase; margin-bottom:4px;">Period Measurement</div>
      <div id="pendulum-period-status">Waiting for a full cycle...</div>
      <div id="pendulum-period-values" style="margin-top:4px; color:#22aaff;">Measured: -- s · Theoretical: -- s · Diff: -- %</div>
    `;
    document.body.appendChild(this.htmlPeriodMetrics);

    // Add a small collapse toggle to the period metrics box
    const periodToggle = document.createElement('button');
    periodToggle.textContent = '▾';
    periodToggle.title = 'Collapse or expand period metrics';
    periodToggle.style.cssText = `position:absolute;top:6px;right:8px;background:transparent;border:none;color:#8a95a8;cursor:pointer;font-size:12px;`;
    // Default to expanded
    (this.htmlPeriodMetrics as HTMLDivElement).dataset.collapsed = '0';
    periodToggle.addEventListener('click', () => {
      const container = this.htmlPeriodMetrics as HTMLDivElement;
      const isCollapsed = container.dataset.collapsed === '1';
      // Toggle all child nodes except the toggle itself
      for (const child of Array.from(container.children)) {
        if (child === periodToggle) continue;
        const el = child as HTMLElement;
        el.style.display = isCollapsed ? '' : 'none';
      }
      container.dataset.collapsed = isCollapsed ? '0' : '1';
      periodToggle.textContent = isCollapsed ? '▾' : '▸';
    });
    this.htmlPeriodMetrics.appendChild(periodToggle);

    // ── Bob ──────────────────────────────────────────────────────────────────
    this.bobGeometry = new THREE.SphereGeometry(0.32, 32, 32);
    this.bobMaterial = new THREE.MeshStandardMaterial({
      color: 0x22aaff,        // electric blue
      metalness: 0.6,
      roughness: 0.25,
      emissive: 0x003355,
      emissiveIntensity: 0.3,
    });
    this.bobMesh = new THREE.Mesh(this.bobGeometry, this.bobMaterial);
    this.bobMesh.castShadow = true;
    scene.add(this.bobMesh);

    // ── Stand / Crane ────────────────────────────────────────────────────────
    this.pivot = new THREE.Group();
    
    // Horizontal Arm and Pivot Mount (floating)
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x556677, metalness: 0.8, roughness: 0.2
    });

    // Horizontal Arm (rod) — left in world space so the assembly appears to float
    const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 4);
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0, 12, 0);
    arm.castShadow = true;
    this.pivot.add(arm);

    // Pivot mount (where string attaches at 0, 12, 0)
    const mountGeo = new THREE.SphereGeometry(0.2);
    const mount = new THREE.Mesh(mountGeo, metalMat);
    mount.position.set(0, 12, 0);
    mount.castShadow = true;
    this.pivot.add(mount);

    // Add only the pivot group (arm + mount) — no ground column.
    this.scene.add(this.pivot);

    // Initialise positions with schema defaults so the scene is correct before
    // the first physics tick fires.
    const defaultParams: Record<string, number> = {};
    for (const [key, s] of Object.entries(this.schema)) {
      defaultParams[key] = s.default;
    }
    this.reset(defaultParams);
  }

  /**
   * Advance the simulation by one fixed timestep.
   *
   * Semi-Implicit Euler (velocity-first) keeps the pendulum numerically stable
   * for oscillating systems compared to Explicit Euler.
   */
  update(dt: number, params: Record<string, number>): void {
    this.cachedParams = params;
    const L = Math.max(params['length'] ?? this.schema['length'].default, 1e-6);
    const g = params['gravity'] ?? this.schema['gravity'].default;
    const b = params['damping'] ?? this.schema['damping'].default;
    const target = params['targetOscillations'] ?? this.schema['targetOscillations'].default;
    
    this.currentL = L;

    // ── Semi-Implicit Euler integration ───────────────────────────────────────
    const alpha = -(g / L) * Math.sin(this.theta) - b * this.omega;
    this.omega += alpha * dt;    // update velocity first
    this.theta += this.omega * dt; // then position

    this.time += dt;

    // ── Zero-crossing detection    // 3) Update period measurement (zero-crossing logic)
    const currentSign = Math.sign(this.theta);
    if (currentSign !== this.prevSign && this.prevSign !== 0) {
      if (this.hasCrossing) {
        this.prevCrossingTime = this.lastCrossingTime;
      }
      this.lastCrossingTime = this.time;
      
      // Calculate period if we have at least 3 crossings (1 full wave)
      if (this.hasCrossing && this.prevCrossingTime > 0) {
        // One full swing = two zero crossings.
        // Wait, if it crosses every half-period, then the difference between consecutive 
        // crossings is half a period. So we multiply by 2.
        this.measuredPeriod = (this.lastCrossingTime - this.prevCrossingTime) * 2;
      }
      this.hasCrossing = true;
      
      // Virtual Stopwatch Logic
      // Each zero crossing is half an oscillation.
      if (this.lapCount < target) {
        this.lapCount += 0.5;
        if (this.lapCount >= target) {
          this.lapCount = target; // Clamp
        }
      }
    }
    this.prevSign = currentSign;
    
    if (this.lapCount < target) {
      this.stopwatchTime += dt;
    } else if (!this.autoPaused) {
      this.autoPaused = true;
      window.dispatchEvent(new CustomEvent('praxilabs-auto-pause', { 
        detail: { message: `Target of ${target} oscillations reached.` }
      }));
    }
    
    // Check for damping decay (Task 38)
    const m = params['mass'] ?? 1;
    const ke = 0.5 * m * (this.currentL * this.omega) ** 2;
    const pe = m * g * this.currentL * (1 - Math.cos(this.theta));
    if ((ke + pe) < 0.0001 && this.time > 1.0) {
      if (!this.autoPaused) {
        this.autoPaused = true;
        window.dispatchEvent(new CustomEvent('praxilabs-auto-pause', { 
          detail: { message: `Energy has decayed to near zero. The system has stopped oscillating due to damping.` }
        }));
      }
    }
  }

  render(): void {
    this.updateMeshes(this.currentL);
    
    const target = this.cachedParams['targetOscillations'] ?? 20;
    
    if (this.lapCount < target) {
      this.updateStopwatchUI(target);
    } else if (this.lapCount >= target && !this.hasRenderedFinalLap) {
      // Render the final green "success" state exactly once
      this.updateStopwatchUI(target);
      if (this.htmlStopwatch) {
        this.htmlStopwatch.style.borderColor = '#00ffaa';
        this.htmlStopwatch.style.color = '#00ffaa';
      }
      this.hasRenderedFinalLap = true;
    }

    this.updatePeriodMetricsUI();
  }

  reset(params?: Record<string, number>): void {
    if (params) this.cachedParams = params;
    const p = this.cachedParams;
    const initialAngle = p['initialAngle'] ?? this.schema['initialAngle'].default;
    
    this.theta = initialAngle * (Math.PI / 180);
    this.omega = 0;
    this.time = 0;
    this.prevSign = 0;
    this.lastCrossingTime = 0;
    this.prevCrossingTime = 0;
    this.hasCrossing = false;
    this.measuredPeriod = 0;
    
    this.lapCount = 0;
    this.stopwatchTime = 0;
    this.hasRenderedFinalLap = false;
    this.autoPaused = false;

    if (this.htmlStopwatch) {
      this.htmlStopwatch.style.borderColor = '#22aaff';
      this.htmlStopwatch.style.color = '#22aaff';
    }
    
    const target = p['targetOscillations'] ?? 20;
    this.updateStopwatchUI(target);
    this.updatePeriodMetricsUI();

    // One initial render so it looks right before unpausing.
    this.currentL = p['length'] ?? this.schema['length'].default;
    this.updateMeshes(this.currentL);
  }

  private updateStopwatchUI(target: number): void {
    if (this.htmlStopwatch) {
      const lapsEl = this.htmlStopwatch.querySelector('#pendulum-laps');
      const timeEl = this.htmlStopwatch.querySelector('#pendulum-time');
      
      if (lapsEl) {
        lapsEl.textContent = `Oscillations: ${Math.floor(this.lapCount)} / ${target}`;
      }
      if (timeEl) {
        timeEl.textContent = `${this.stopwatchTime.toFixed(2)} s`;
      }
      
      if (this.lapCount >= 20) {
        this.htmlStopwatch.style.borderColor = '#00ffaa';
        this.htmlStopwatch.style.color = '#00ffaa';
        if (lapsEl) (lapsEl as HTMLElement).style.color = '#00ffaa';
      } else {
        this.htmlStopwatch.style.borderColor = '#22aaff';
        this.htmlStopwatch.style.color = '#22aaff';
        if (lapsEl) (lapsEl as HTMLElement).style.color = '#8a95a8';
      }
    }
  }

  private updatePeriodMetricsUI(): void {
    if (!this.htmlPeriodMetrics) return;

    const statusEl = this.htmlPeriodMetrics.querySelector('#pendulum-period-status');
    const valuesEl = this.htmlPeriodMetrics.querySelector('#pendulum-period-values');

    const L = this.cachedParams['length'] ?? this.schema['length'].default;
    const g = this.cachedParams['gravity'] ?? this.schema['gravity'].default;
    const theoreticalPeriod = g > 0 ? 2 * Math.PI * Math.sqrt(L / g) : 0;

    if (statusEl) {
      statusEl.textContent = this.measuredPeriod > 0
        ? 'Measured from completed cycles'
        : 'Waiting for a full cycle...';
    }

    if (valuesEl) {
      const diffPct = theoreticalPeriod > 0 && this.measuredPeriod > 0
        ? (Math.abs(this.measuredPeriod - theoreticalPeriod) / theoreticalPeriod) * 100
        : 0;

      valuesEl.textContent = `Measured: ${this.measuredPeriod > 0 ? `${this.measuredPeriod.toFixed(3)} s` : '-- s'} · Theoretical: ${theoreticalPeriod > 0 ? `${theoreticalPeriod.toFixed(3)} s` : '-- s'} · Diff: ${diffPct.toFixed(2)} %`;
    }
  }

  getMeasurements(): Record<string, number> {
    const L = this.cachedParams['length'] ?? this.schema['length'].default;
    const g = this.cachedParams['gravity'] ?? this.schema['gravity'].default;

    const theoreticalPeriod =
      g > 0 ? 2 * Math.PI * Math.sqrt(L / g) : 0;

    // Percentage difference: |measured − theoretical| / theoretical × 100.
    // Guard: return 0 if theoretical period is zero (g = 0) or if a full
    // period hasn't been completed yet (measuredPeriod still 0).
    const periodDifferencePct =
      theoreticalPeriod > 0 && this.measuredPeriod > 0
        ? (Math.abs(this.measuredPeriod - theoreticalPeriod) / theoreticalPeriod) * 100
        : 0;

    // Calculate energy (assuming mass = 1kg)
    // KE = 1/2 * m * v^2 where v = L * omega
    const v = this.currentL * this.omega;
    const kineticEnergy = 0.5 * 1 * (v * v);
    // PE = m * g * h where h = L * (1 - cos(theta))
    const potentialEnergy = 1 * g * this.currentL * (1 - Math.cos(this.theta));
    const totalEnergy = kineticEnergy + potentialEnergy;

    return {
      angle_deg:             (this.theta * 180) / Math.PI,
      omega_rads:            this.omega,
      time_s:                this.time,
      measured_period_s:     this.measuredPeriod,
      theoretical_period_s:  theoreticalPeriod,
      period_difference_pct: periodDifferencePct,
      kinetic_energy:        kineticEnergy,
      potential_energy:      potentialEnergy,
      total_energy:          totalEnergy,
    };
  }

  dispose(): void {
    if (this.scene) {
      if (this.bobMesh !== null) this.scene.remove(this.bobMesh);
      if (this.stringLine !== null) this.scene.remove(this.stringLine);
      if (this.pivot !== null) this.scene.remove(this.pivot);
    }

    this.bobGeometry?.dispose();
    this.bobMaterial?.dispose();
    this.stringGeometry?.dispose();
    this.stringMaterial?.dispose();
    
    if (this.htmlStopwatch && this.htmlStopwatch.parentNode) {
      this.htmlStopwatch.parentNode.removeChild(this.htmlStopwatch);
    }
    if (this.htmlPeriodMetrics && this.htmlPeriodMetrics.parentNode) {
      this.htmlPeriodMetrics.parentNode.removeChild(this.htmlPeriodMetrics);
    }
    
    this.stringLine = null;
    this.stringGeometry = null;
    this.stringMaterial = null;
    this.bobMesh = null;
    this.bobGeometry = null;
    this.bobMaterial = null;
    this.pivot = null;
    this.scene = null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Convert the current theta and length into 3D positions and push them
   * to the string geometry and bob mesh.
   *
   * Coordinate convention:
   *   • Pivot at world origin (0, 0, 0)
   *   • Positive Y is up
   *   • Pendulum swings in the XY plane
   *
   *   bobX = L * sin(θ)
   *   bobY = -L * cos(θ)   (negative because bob hangs below pivot)
   */
  private updateMeshes(L: number): void {
    const bobX = L * Math.sin(this.theta);
    const bobY = 12 - L * Math.cos(this.theta);
    const bobZ = 0;

    // Update bob position
    if (this.bobMesh !== null) {
      this.bobMesh.position.set(bobX, bobY, bobZ);
    }

    // Update string: vertex 0 = pivot (0,0,0), vertex 1 = bob
    if (this.stringGeometry !== null) {
      const pos = this.stringGeometry.attributes['position'] as THREE.BufferAttribute;
      // Pivot vertex
      pos.setXYZ(0, 0, 12, 0);
      // Bob vertex
      pos.setXYZ(1, bobX, bobY, bobZ);
      pos.needsUpdate = true;
      this.stringGeometry.computeBoundingSphere();
    }
  }
}
