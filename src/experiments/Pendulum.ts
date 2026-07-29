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
  };

  // ── Physics state ─────────────────────────────────────────────────────────

  /** Current angle from vertical (radians). Positive = right of vertical. */
  private theta: number = 0;

  /** Current angular velocity (rad/s). */
  private omega: number = 0;

  /** Elapsed simulation time (seconds). */
  private time: number = 0;

  // ── Period measurement via zero-crossing detection ─────────────────────────

  /** Sign of theta on the previous tick (+1, -1, or 0). */
  private prevSign: number = 0;

  /** Simulation time of the last zero-crossing (s). */
  private lastCrossingTime: number = 0;

  /** Whether we have recorded at least one crossing (to anchor the period). */
  private hasCrossing: boolean = false;

  /** The most recently measured full period (one full swing = 2 crossings, s). */
  private measuredPeriod: number = 0;

  /** Time of the crossing before `lastCrossingTime` — used to compute full period. */
  private prevCrossingTime: number = 0;

  // ── Lab Workflow State (Virtual Stopwatch) ────────────────────────────────
  
  /** Number of full oscillations (1 oscillation = A -> B -> A = 2 zero crossings) */
  private lapCount: number = 0;
  
  /** Whether the virtual stopwatch is currently running. */
  private isTiming: boolean = false;
  
  /** Elapsed stopwatch time (s) */
  private stopwatchTime: number = 0;

  /** HTML overlay for the virtual stopwatch. */
  private htmlStopwatch: HTMLDivElement | null = null;
  
  /** 3D Canvas-based Stopwatch */
  private watchMesh: THREE.Mesh | null = null;
  private watchCanvas: HTMLCanvasElement | null = null;
  private watchCtx: CanvasRenderingContext2D | null = null;
  private watchTexture: THREE.CanvasTexture | null = null;

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

    // ── 3D Stopwatch Mesh ────────────────────────────────────────────────────
    this.watchCanvas = document.createElement('canvas');
    this.watchCanvas.width = 512;
    this.watchCanvas.height = 256;
    this.watchCtx = this.watchCanvas.getContext('2d');
    this.watchTexture = new THREE.CanvasTexture(this.watchCanvas);
    
    const watchGeo = new THREE.PlaneGeometry(4, 2);
    const watchMat = new THREE.MeshBasicMaterial({ 
      map: this.watchTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.watchMesh = new THREE.Mesh(watchGeo, watchMat);
    this.watchMesh.position.set(-3.5, 1, 0); // To the left of the pivot
    scene.add(this.watchMesh);

    // ── Bob ──────────────────────────────────────────────────────────────────
    this.bobGeometry = new THREE.SphereGeometry(0.28, 32, 32);
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

    // ── Pivot marker (small sphere at origin) ─────────────────────────────────
    this.pivot = new THREE.Object3D();
    this.pivot.position.set(0, 0, 0);
    scene.add(this.pivot);

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
    const L = Math.max(params['length'] ?? this.schema['length'].default, 1e-6);
    const g = params['gravity'] ?? this.schema['gravity'].default;
    const b = params['damping'] ?? this.schema['damping'].default;

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
      if (this.isTiming) {
        this.lapCount += 0.5;
        if (this.lapCount >= 20) {
          this.isTiming = false; // Goal reached, stop timer
        }
      }
    }
    this.prevSign = currentSign;
    
    if (this.isTiming) {
      this.stopwatchTime += dt;
      this.updateStopwatchUI();
    }

    // ── Update 3D mesh positions ──────────────────────────────────────────────
    this.updateMeshes(L);
  }

  reset(params?: Record<string, number>): void {
    const L = params?.['length'] ?? this.schema['length'].default;
    const initialAngleDeg =
      params?.['initialAngle'] ?? this.schema['initialAngle'].default;

    // Convert to radians, clamp to avoid perfect 180° singularity
    let initialAngleRad = (initialAngleDeg * Math.PI) / 180;
    if (Math.abs(initialAngleDeg) === 180) {
      initialAngleRad = (179.9 * Math.PI) / 180 * Math.sign(initialAngleDeg);
    }

    this.theta = initialAngleRad;
    this.omega = 0;
    this.time = 0;

    this.prevSign = 0;
    this.lastCrossingTime = 0;
    this.prevCrossingTime = 0;
    this.hasCrossing = false;
    this.measuredPeriod = 0;
    
    this.lapCount = 0;
    this.isTiming = true;
    this.stopwatchTime = 0;
    this.updateStopwatchUI();

    this.updateMeshes(L);
  }

  private updateStopwatchUI(): void {
    if (this.htmlStopwatch) {
      const lapsEl = this.htmlStopwatch.querySelector('#pendulum-laps');
      const timeEl = this.htmlStopwatch.querySelector('#pendulum-time');
      
      if (lapsEl) {
        lapsEl.textContent = `Oscillations: ${Math.floor(this.lapCount)} / 20`;
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
    
    // Update 3D Canvas Stopwatch
    if (this.watchCtx && this.watchTexture) {
      const ctx = this.watchCtx;
      ctx.clearRect(0, 0, 512, 256);
      
      // Background panel
      ctx.fillStyle = 'rgba(13, 13, 15, 0.85)';
      ctx.fillRect(0, 0, 512, 256);
      
      // Border
      ctx.strokeStyle = this.lapCount >= 20 ? '#00ffaa' : '#22aaff';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, 512, 256);
      
      // Text - Time
      ctx.fillStyle = this.lapCount >= 20 ? '#00ffaa' : '#22aaff';
      ctx.font = 'bold 80px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.stopwatchTime.toFixed(2)}s`, 256, 150);
      
      // Text - Laps
      ctx.fillStyle = '#8a95a8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`OSCILLATIONS: ${Math.floor(this.lapCount)} / 20`, 256, 60);
      
      this.watchTexture.needsUpdate = true;
    }
  }

  getMeasurements(): Record<string, number> {
    // Retrieve current params from the schema defaults as a fallback.
    // In practice these are set by Physics.currentParams each tick.
    const L = this.schema['length'].default;
    const g = this.schema['gravity'].default;

    const theoreticalPeriod =
      g > 0 ? 2 * Math.PI * Math.sqrt(L / g) : 0;

    // Percentage difference: |measured − theoretical| / theoretical × 100.
    // Guard: return 0 if theoretical period is zero (g = 0) or if a full
    // period hasn't been completed yet (measuredPeriod still 0).
    const periodDifferencePct =
      theoreticalPeriod > 0 && this.measuredPeriod > 0
        ? (Math.abs(this.measuredPeriod - theoreticalPeriod) / theoreticalPeriod) * 100
        : 0;

    return {
      angle_deg:             (this.theta * 180) / Math.PI,
      omega_rads:            this.omega,
      time_s:                this.time,
      measured_period_s:     this.measuredPeriod,
      theoretical_period_s:  theoreticalPeriod,
      period_difference_pct: periodDifferencePct,
    };
  }

  dispose(): void {
    if (this.scene) {
      if (this.bobMesh !== null) this.scene.remove(this.bobMesh);
      if (this.stringLine !== null) this.scene.remove(this.stringLine);
      if (this.pivot !== null) this.scene.remove(this.pivot);
      if (this.watchMesh !== null) this.scene.remove(this.watchMesh);
    }

    this.bobGeometry?.dispose();
    this.bobMaterial?.dispose();
    this.stringGeometry?.dispose();
    this.stringMaterial?.dispose();
    
    if (this.watchMesh) {
      this.watchMesh.geometry.dispose();
      (this.watchMesh.material as THREE.Material).dispose();
    }
    this.watchTexture?.dispose();
    
    if (this.htmlStopwatch && this.htmlStopwatch.parentNode) {
      this.htmlStopwatch.parentNode.removeChild(this.htmlStopwatch);
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
    const bobY = -L * Math.cos(this.theta);
    const bobZ = 0;

    // Update bob position
    if (this.bobMesh !== null) {
      this.bobMesh.position.set(bobX, bobY, bobZ);
    }

    // Update string: vertex 0 = pivot (0,0,0), vertex 1 = bob
    if (this.stringGeometry !== null) {
      const pos = this.stringGeometry.attributes['position'] as THREE.BufferAttribute;
      // Pivot vertex
      pos.setXYZ(0, 0, 0, 0);
      // Bob vertex
      pos.setXYZ(1, bobX, bobY, bobZ);
      pos.needsUpdate = true;
      this.stringGeometry.computeBoundingSphere();
    }
  }
}
