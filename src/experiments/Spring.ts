import * as THREE from 'three';
import type { IExperiment, ParameterSchema } from './IExperiment.ts';

// ---------------------------------------------------------------------------
// Spring-Mass System — Experiment C
// ---------------------------------------------------------------------------
// Models a mass attached to a vertical spring using Hooke's Law with
// optional linear damping:
//
//   ay = -(k / m) * y - (b / m) * vy
//
// where:
//   y   — displacement from equilibrium (m, positive = downward)
//   vy  — velocity (m/s, positive = downward)
//   ay  — acceleration (m/s²)
//   k   — spring constant (N/m)
//   m   — mass (kg)
//   b   — damping coefficient (kg/s)
//
// Integration: Semi-Implicit Euler (velocity updated first, then position):
//   vy(n+1) = vy(n) + ay(n) * dt
//   y(n+1)  = y(n)  + vy(n+1) * dt
//
// Zero-crossing detection: each time y changes sign the mass has passed
// through equilibrium. Two consecutive crossings = one full period.
// This mirrors the exact pattern used in Pendulum.ts (theta → y).
//
// Coordinate convention:
//   • Anchor fixed at (0, ANCHOR_Y, 0) — ceiling mount
//   • Equilibrium mass position: (0, ANCHOR_Y - NATURAL_LENGTH, 0)
//   • Mass world position: (0, ANCHOR_Y - NATURAL_LENGTH - y, 0)
//   • Positive y = pulled downward from equilibrium
//   • Spring and mass move in the XY plane (Z = 0)
// ---------------------------------------------------------------------------

/** World-space Y position of the ceiling anchor. */
const ANCHOR_Y = 15.0;

/** Visual natural length of the spring at equilibrium (m). */
const NATURAL_LENGTH = 10.0;

/** Number of coil segments in the spring line (more = smoother spring look). */
const SPRING_SEGMENTS = 60;

/** Half-width of the spring coil zigzag (m). */
const COIL_AMPLITUDE = 0.25;

export class Spring implements IExperiment {
  // ── IExperiment identity ──────────────────────────────────────────────────

  readonly id = 'spring';
  readonly name = 'Spring-Mass System';
  readonly description =
    'A mass hanging from a vertical spring demonstrating Hooke\'s Law with ' +
    'optional damping, integrated via Semi-Implicit Euler.';

  // ── Parameter schema ──────────────────────────────────────────────────────

  readonly schema: Record<string, ParameterSchema> = {
    mass: {
      description: 'Mass',
      unit: 'kg',
      min: 0.1,
      max: 20,
      default: 1,
      step: 0.1,
      tooltip: 'The mass of the block hanging from the spring. Heavier masses lower the frequency.',
    },
    springConstant: {
      description: 'Spring Constant',
      unit: 'N/m',
      min: 1,
      max: 100,
      default: 10,
      step: 0.5,
      tooltip: 'Stiffness of the spring (Hooke\'s Law k-value). Higher values mean a stiffer, faster spring.',
    },
    damping: {
      description: 'Damping Coefficient',
      unit: 'kg/s',
      min: 0,
      max: 5,
      default: 0,
      step: 0.01,
      tooltip: 'Friction or resistance that dissipates the spring\'s energy over time.',
    },
    initialDisplacement: {
      description: 'Initial Displacement',
      unit: 'm',
      min: -5,
      max: 5,
      default: 3,
      step: 0.1,
      tooltip: 'Starting stretch or compression of the spring from its natural equilibrium point.',
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

  /** Displacement from equilibrium (m). Positive = downward. */
  private y: number = 0;

  /** Velocity (m/s). Positive = downward. */
  private vy: number = 0;

  /** Elapsed simulation time (s). */
  private time: number = 0;
  
  /** The current mass used in the last physics tick. */
  private currentM: number = 1;
  
  /** The current spring constant used in the last physics tick. */
  private currentK: number = 10;

  // ── Period / frequency measurement via zero-crossing detection ─────────────
  // Pattern mirrored exactly from Pendulum.ts (theta → y).

  /** Sign of y on the previous tick (+1, −1, or 0). */
  private prevSign: number = 0;

  /** Simulation time of the most recent zero-crossing (s). */
  private lastCrossingTime: number = 0;

  /** Simulation time of the crossing before the last one. */
  private prevCrossingTime: number = 0;

  /** Whether at least one zero-crossing has been recorded. */
  private hasCrossing: boolean = false;

  /** The most recently measured full period (two crossings = one period, s). */
  private measuredPeriod: number = 0;
  
  // ── Lab Workflow State (Virtual Stopwatch) ────────────────────────────────
  
  private lapCount: number = 0;
  private stopwatchTime: number = 0;
  private autoPaused: boolean = false;
  private hasRenderedFinalLap: boolean = false;
  private htmlStopwatch: HTMLDivElement | null = null;
  private cachedParams: Record<string, number> = {};

  // ── Three.js objects ──────────────────────────────────────────────────────

  /** Ceiling anchor box (static). */
  private anchorMesh: THREE.Mesh | null = null;
  private anchorGeometry: THREE.BoxGeometry | null = null;
  private anchorMaterial: THREE.MeshStandardMaterial | null = null;

  /** The oscillating mass block. */
  private massMesh: THREE.Mesh | null = null;
  private massGeometry: THREE.BoxGeometry | null = null;
  private massMaterial: THREE.MeshStandardMaterial | null = null;

  /** Spring coil rendered as a zigzag Line between anchor and mass. */
  private springLine: THREE.Line | null = null;
  private springGeometry: THREE.BufferGeometry | null = null;
  private springMaterial: THREE.LineBasicMaterial | null = null;

  /** Reference to the master scene — required by dispose() to remove objects. */
  private scene: THREE.Scene | null = null;

  /** HTML overlay for measured vs theoretical frequency readouts. */
  private htmlFrequencyMetrics: HTMLDivElement | null = null;

  // ── IExperiment lifecycle ─────────────────────────────────────────────────

  setup(scene: THREE.Scene): void {
    this.scene = scene;

    // ── HTML Stopwatch Overlay ───────────────────────────────────────────────
    this.htmlStopwatch = document.createElement('div');
    this.htmlStopwatch.style.cssText = `
      position: absolute;
      top: 100px;
      left: 360px;
      background: rgba(15, 17, 21, 0.85);
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
      <div id="spring-laps" style="font-size: 10px; letter-spacing: 2px; color: #8a95a8; margin-bottom: 4px; text-transform: uppercase;">Oscillations: 0 / 20</div>
      <div id="spring-time">00.00 s</div>
    `;
    document.body.appendChild(this.htmlStopwatch);

    // ── Ceiling anchor ────────────────────────────────────────────────────────
    this.anchorGeometry = new THREE.BoxGeometry(1.0, 0.3, 0.5);
    this.anchorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.anchorMesh = new THREE.Mesh(this.anchorGeometry, this.anchorMaterial);
    this.anchorMesh.position.set(0, ANCHOR_Y, 0);
    this.anchorMesh.castShadow = true;
    
    // ── Anchor Stand ──────────────────────────────────────────────────────────
    const standGeo = new THREE.CylinderGeometry(0.15, 0.15, ANCHOR_Y);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.8, roughness: 0.2 });
    const standPole = new THREE.Mesh(standGeo, standMat);
    // Relative to anchorMesh at (0, ANCHOR_Y, 0)
    standPole.position.set(-2, -ANCHOR_Y / 2, -1);
    standPole.castShadow = true;
    this.anchorMesh.add(standPole);

    const standArmGeo = new THREE.CylinderGeometry(0.1, 0.1, 3);
    const standArm = new THREE.Mesh(standArmGeo, standMat);
    standArm.rotation.z = Math.PI / 2;
    standArm.position.set(-0.5, 0, -1);
    standArm.castShadow = true;
    this.anchorMesh.add(standArm);

    scene.add(this.anchorMesh);

    // ── Mass block ────────────────────────────────────────────────────────────
    this.massGeometry = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    this.massMaterial = new THREE.MeshStandardMaterial({
      color: 0x22aaff,       // electric blue — matches Pendulum bob for consistency
      metalness: 0.5,
      roughness: 0.25,
      emissive: 0x003355,
      emissiveIntensity: 0.3,
    });
    this.massMesh = new THREE.Mesh(this.massGeometry, this.massMaterial);
    this.massMesh.castShadow = true;
    scene.add(this.massMesh);

    // ── Spring coil line ──────────────────────────────────────────────────────
    // Pre-allocate SPRING_SEGMENTS+1 vertices; content updated every tick.
    this.springGeometry = new THREE.BufferGeometry();
    const springPositions = new Float32Array((SPRING_SEGMENTS + 1) * 3);
    this.springGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(springPositions, 3),
    );
    this.springMaterial = new THREE.LineBasicMaterial({
      color: 0xd4af7a,   // warm brass — industrial aesthetic, matching Pendulum string
      linewidth: 1,
    });
    this.springLine = new THREE.Line(this.springGeometry, this.springMaterial);
    scene.add(this.springLine);

    this.htmlFrequencyMetrics = document.createElement('div');
    this.htmlFrequencyMetrics.style.cssText = `
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
    this.htmlFrequencyMetrics.innerHTML = `
      <div style="font-size:10px; letter-spacing:2px; color:#8a95a8; text-transform:uppercase; margin-bottom:4px;">Frequency Comparison</div>
      <div id="spring-frequency-status">Waiting for a full cycle...</div>
      <div id="spring-frequency-values" style="margin-top:4px; color:#22aaff;">Measured: -- Hz · Theoretical: -- Hz</div>
    `;
    document.body.appendChild(this.htmlFrequencyMetrics);

    // Initialise positions to schema defaults before the first physics tick.
    const defaults: Record<string, number> = {};
    for (const [key, s] of Object.entries(this.schema)) defaults[key] = s.default;
    this.reset(defaults);
  }

  /**
   * Advance the simulation by one fixed physics timestep.
   *
   * Force model: Hooke's Law + linear damping (no gravity — equilibrium is the
   * origin so gravity is already absorbed into the natural length).
   *
   * Semi-Implicit Euler (velocity first, then position):
   *   ay  = -(k / m) * y - (b / m) * vy
   *   vy += ay * dt
   *   y  += vy * dt
   */
  update(dt: number, params: Record<string, number>): void {
    this.cachedParams = params;
    const m = Math.max(params['mass']              ?? this.schema['mass'].default,          1e-6);
    const k = Math.max(params['springConstant']    ?? this.schema['springConstant'].default, 0);
    const b =          params['damping']           ?? this.schema['damping'].default;
    const target =     params['targetOscillations'] ?? this.schema['targetOscillations'].default;

    this.currentM = m;
    this.currentK = k;

    // ── Semi-Implicit Euler integration ───────────────────────────────────────
    const ay = -(k / m) * this.y - (b / m) * this.vy;
    this.vy += ay * dt;   // velocity first
    this.y  += this.vy * dt; // then position

    this.time += dt;

    // ── Zero-crossing detection for period/frequency measurement ──────────────
    // Mirrors the exact pattern from Pendulum.ts (theta → y).
    const currentSign = Math.sign(this.y);
    if (currentSign !== 0 && this.prevSign !== 0 && currentSign !== this.prevSign) {
      // Sign changed → mass passed through equilibrium.
      if (this.hasCrossing) {
        // Two consecutive crossings = one full oscillation period.
        this.measuredPeriod = (this.time - this.prevCrossingTime) * 2;
      }
      this.prevCrossingTime = this.lastCrossingTime;
      this.lastCrossingTime = this.time;
      this.hasCrossing = true;
      
      // Virtual Stopwatch Logic
      if (this.lapCount < target) {
        this.lapCount += 0.5;
        if (this.lapCount >= target) {
          this.lapCount = target;
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
    const ke = 0.5 * m * (this.vy ** 2);
    const pe = 0.5 * k * (this.y ** 2);
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
    this.updateMeshes();
    
    const target = this.cachedParams['targetOscillations'] ?? 20;
    
    if (this.lapCount < target) {
      this.updateStopwatchUI(target);
    } else if (this.lapCount >= target && !this.hasRenderedFinalLap) {
      this.updateStopwatchUI(target);
      if (this.htmlStopwatch) {
        this.htmlStopwatch.style.borderColor = '#00ffaa';
        this.htmlStopwatch.style.color = '#00ffaa';
      }
      this.hasRenderedFinalLap = true;
    }

    this.updateFrequencyMetricsUI();
  }

  /**
   * Restore the spring-mass system to its initial conditions.
   * Reuses all existing GPU resources — no geometry or material recreation.
   *
   * @param params Optional current parameter snapshot. When provided, the
   *               reset respects the user's current slider values rather than
   *               hard-coded schema defaults.
   */
  reset(params?: Record<string, number>): void {
    if (params) this.cachedParams = params;
    const p = this.cachedParams;
    const d0 = p['initialDisplacement'] ?? this.schema['initialDisplacement'].default;

    this.y    = d0;
    this.vy   = 0;
    this.time = 0;

    // Clear zero-crossing tracking (mirrors Pendulum.ts reset pattern).
    this.prevSign         = Math.sign(this.y);
    this.lastCrossingTime = 0;
    this.prevCrossingTime = 0;
    this.hasCrossing      = false;
    this.measuredPeriod   = 0;
    
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
    this.updateFrequencyMetricsUI();

    this.currentM = params?.['mass'] ?? this.schema['mass'].default;
    this.currentK = params?.['springConstant'] ?? this.schema['springConstant'].default;

    this.render();
  }

  getMeasurements(): Record<string, number> {
    const k = this.currentK;
    const m = this.currentM;

    // Theoretical angular frequency: ω₀ = √(k / m)
    // Theoretical frequency: f₀ = ω₀ / (2π) = (1 / 2π) * √(k / m)
    const theoreticalFrequency = m > 0 ? Math.sqrt(k / m) / (2 * Math.PI) : 0;

    const measuredFrequency = this.measuredPeriod > 0
      ? 1 / this.measuredPeriod
      : 0;
      
    // Calculate energy
    // KE = 1/2 * m * v^2
    const kineticEnergy = 0.5 * this.currentM * (this.vy * this.vy);
    // PE = 1/2 * k * x^2
    const potentialEnergy = 0.5 * this.currentK * (this.y * this.y);
    const totalEnergy = kineticEnergy + potentialEnergy;

    return {
      time_s:                  this.time,
      displacement_m:          this.y,
      measured_frequency_Hz:   measuredFrequency,
      theoretical_frequency_Hz: theoreticalFrequency,
      kinetic_energy:          kineticEnergy,
      potential_energy:        potentialEnergy,
      total_energy:            totalEnergy,
    };
  }

  dispose(): void {
    if (this.htmlStopwatch && this.htmlStopwatch.parentNode) {
      this.htmlStopwatch.parentNode.removeChild(this.htmlStopwatch);
    }
    this.htmlStopwatch = null;

    if (this.scene !== null) {
      if (this.anchorMesh !== null) this.scene.remove(this.anchorMesh);
      if (this.massMesh   !== null) this.scene.remove(this.massMesh);
      if (this.springLine !== null) this.scene.remove(this.springLine);
    }

    if (this.htmlFrequencyMetrics && this.htmlFrequencyMetrics.parentNode) {
      this.htmlFrequencyMetrics.parentNode.removeChild(this.htmlFrequencyMetrics);
    }

    this.anchorGeometry?.dispose();
    this.anchorMaterial?.dispose();
    this.massGeometry?.dispose();
    this.massMaterial?.dispose();
    this.springGeometry?.dispose();
    this.springMaterial?.dispose();

    this.anchorMesh     = null;
    this.anchorGeometry = null;
    this.anchorMaterial = null;
    this.massMesh       = null;
    this.massGeometry   = null;
    this.massMaterial   = null;
    this.springLine     = null;
    this.springGeometry = null;
    this.springMaterial = null;
    this.scene          = null;
  }

  private updateStopwatchUI(target: number): void {
    if (!this.htmlStopwatch) return;
    
    const lapsEl = this.htmlStopwatch.querySelector('#spring-laps');
    const timeEl = this.htmlStopwatch.querySelector('#spring-time');
    
    if (lapsEl) {
      lapsEl.textContent = `Oscillations: ${Math.floor(this.lapCount)} / ${target}`;
    }
    if (timeEl) {
      timeEl.textContent = `${this.stopwatchTime.toFixed(2)} s`;
    }
  }

  private updateFrequencyMetricsUI(): void {
    if (!this.htmlFrequencyMetrics) return;

    const statusEl = this.htmlFrequencyMetrics.querySelector('#spring-frequency-status');
    const valuesEl = this.htmlFrequencyMetrics.querySelector('#spring-frequency-values');

    const k = this.currentK;
    const m = this.currentM;
    const theoreticalFrequency = m > 0 ? Math.sqrt(k / m) / (2 * Math.PI) : 0;
    const measuredFrequency = this.measuredPeriod > 0 ? 1 / this.measuredPeriod : 0;

    if (statusEl) {
      statusEl.textContent = this.measuredPeriod > 0
        ? 'Measured from completed cycles'
        : 'Waiting for a full cycle...';
    }

    if (valuesEl) {
      valuesEl.textContent = `Measured: ${measuredFrequency > 0 ? `${measuredFrequency.toFixed(3)} Hz` : '-- Hz'} · Theoretical: ${theoreticalFrequency > 0 ? `${theoreticalFrequency.toFixed(3)} Hz` : '-- Hz'}`;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recompute all mesh and line positions from the current physics state.
   *
   * World-space mass position:
   *   massY = ANCHOR_Y − NATURAL_LENGTH − y
   *
   * At y = 0 (equilibrium): mass hangs NATURAL_LENGTH below the anchor.
   * At y = +d (displaced down): mass is d metres below equilibrium.
   * At y = −d (displaced up): mass is d metres above equilibrium.
   *
   * The spring coil is a zigzag polyline generated between the anchor bottom
   * and the mass top. Each alternating vertex steps left/right by COIL_AMPLITUDE.
   */
  private updateMeshes(): void {
    const massY = ANCHOR_Y - NATURAL_LENGTH - this.y;

    // ── Mass position ─────────────────────────────────────────────────────────
    if (this.massMesh !== null) {
      this.massMesh.position.set(0, massY, 0);
    }

    // ── Spring coil geometry ──────────────────────────────────────────────────
    if (this.springGeometry !== null) {
      const pos = this.springGeometry.attributes['position'] as THREE.BufferAttribute;

      // Spring spans from the anchor bottom edge to the mass top edge.
      const topY    = ANCHOR_Y - 0.1;   // bottom face of anchor
      const bottomY = massY    + 0.275; // top face of mass (half height = 0.275)

      for (let i = 0; i <= SPRING_SEGMENTS; i++) {
        const t = i / SPRING_SEGMENTS;
        const segY = topY + (bottomY - topY) * t;

        // Zigzag: alternate left and right for a coil-like appearance.
        // Skip zigzag on the very first and last vertex so ends connect cleanly.
        let segX = 0;
        if (i > 0 && i < SPRING_SEGMENTS) {
          segX = (i % 2 === 0 ? -1 : 1) * COIL_AMPLITUDE;
        }

        pos.setXYZ(i, segX, segY, 0);
      }

      pos.needsUpdate = true;
      this.springGeometry.computeBoundingSphere();
    }
  }
}
