import * as THREE from 'three';
import type { IExperiment, ParameterSchema } from './IExperiment.ts';

// ---------------------------------------------------------------------------
// Projectile Motion — Experiment B
// ---------------------------------------------------------------------------
// Models a projectile launched from the origin with an initial speed and
// angle, subject to gravity and optional linear air drag.
//
// Equations of motion (drag modelled as a force proportional to velocity):
//
//   F_drag = -b * v   (b = dragCoefficient, assumed mass = 1 kg)
//
//   ax = -(b / m) * vx
//   ay = -g - (b / m) * vy
//
// Integration: Semi-Implicit Euler (velocity first, then position):
//   vx(n+1) = vx(n) + ax(n) * dt
//   vy(n+1) = vy(n) + ay(n) * dt
//   x(n+1)  = x(n)  + vx(n+1) * dt
//   y(n+1)  = y(n)  + vy(n+1) * dt
//
// The predicted (drag-free) trajectory is computed analytically and drawn as
// a dashed line before the simulation starts or after reset.
//
// Coordinate convention:
//   • Launch point at world origin (0, 0, 0)
//   • +X is horizontal (right), +Y is vertical (up)
//   • Projectile moves in the XY plane (Z = 0)
// ---------------------------------------------------------------------------

/** Number of vertices in the predicted trajectory polyline. */
const TRAJECTORY_SEGMENTS = 120;

/** Visual radius of the projectile sphere (metres, world-space). */
const BOB_RADIUS = 0.18;

/** Assumed projectile mass for force calculation (kg). */
const MASS = 1;

export class Projectile implements IExperiment {
  // ── IExperiment identity ──────────────────────────────────────────────────

  readonly id = 'projectile';
  readonly name = 'Projectile Motion';
  readonly description =
    'A projectile launched at a chosen speed and angle, subject to gravity ' +
    'and optional linear air drag, integrated via Semi-Implicit Euler. ' +
    'The dashed line shows the drag-free analytic trajectory for comparison.';

  // ── Parameter schema ──────────────────────────────────────────────────────

  readonly schema: Record<string, ParameterSchema> = {
    initialSpeed: {
      description: 'Initial Speed',
      unit: 'm/s',
      min: 1,
      max: 50,
      default: 20,
      step: 0.5,
    },
    launchAngle: {
      description: 'Launch Angle',
      unit: '°',
      min: 0,
      max: 90,
      default: 45,
      step: 1,
    },
    gravity: {
      description: 'Gravitational Acceleration',
      unit: 'm/s²',
      min: 1,
      max: 20,
      default: 9.81,
      step: 0.01,
    },
    dragCoefficient: {
      description: 'Air Drag Coefficient',
      unit: 'kg/s',
      min: 0,
      max: 2,
      default: 0,
      step: 0.01,
    },
  };

  // ── Physics state ─────────────────────────────────────────────────────────

  /** Current horizontal position (m). */
  private x: number = 0;
  /** Current vertical position (m). */
  private y: number = 0;
  /** Current horizontal velocity (m/s). */
  private vx: number = 0;
  /** Current vertical velocity (m/s). */
  private vy: number = 0;
  /** Elapsed simulation time (s). */
  private time: number = 0;
  /** True once the projectile hits y = 0 and stops. */
  private hasLanded: boolean = false;
  /** Horizontal position at landing (m); 0 until landed. */
  private actualRange: number = 0;

  // ── Three.js objects ──────────────────────────────────────────────────────

  /** The flying projectile sphere. */
  private bobMesh: THREE.Mesh | null = null;
  private bobGeometry: THREE.SphereGeometry | null = null;
  private bobMaterial: THREE.MeshStandardMaterial | null = null;

  /** Analytic (drag-free) predicted trajectory — drawn as a dashed line. */
  private trajectoryLine: THREE.Line | null = null;
  private trajectoryGeometry: THREE.BufferGeometry | null = null;
  private trajectoryMaterial: THREE.LineDashedMaterial | null = null;

  /** Flat ring placed at the landing point; hidden until the projectile lands. */
  private landingMarker: THREE.Mesh | null = null;
  private landingGeometry: THREE.RingGeometry | null = null;
  private landingMaterial: THREE.MeshBasicMaterial | null = null;

  /** Reference to the master scene (needed for dispose()). */
  private scene: THREE.Scene | null = null;

  // ── IExperiment lifecycle ─────────────────────────────────────────────────

  setup(scene: THREE.Scene): void {
    this.scene = scene;

    // ── Projectile bob ────────────────────────────────────────────────────────
    this.bobGeometry = new THREE.SphereGeometry(BOB_RADIUS, 32, 32);
    this.bobMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b35,       // warm orange — distinct from Pendulum blue
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0x3a1500,
      emissiveIntensity: 0.4,
    });
    this.bobMesh = new THREE.Mesh(this.bobGeometry, this.bobMaterial);
    this.bobMesh.castShadow = true;
    scene.add(this.bobMesh);

    // ── Predicted trajectory (dashed line) ───────────────────────────────────
    // Pre-allocate TRAJECTORY_SEGMENTS+1 vertices; content set in reset().
    this.trajectoryGeometry = new THREE.BufferGeometry();
    const posArr = new Float32Array((TRAJECTORY_SEGMENTS + 1) * 3);
    this.trajectoryGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(posArr, 3),
    );
    this.trajectoryMaterial = new THREE.LineDashedMaterial({
      color: 0x22aaff,
      dashSize: 0.25,
      gapSize: 0.15,
      opacity: 0.55,
      transparent: true,
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeometry, this.trajectoryMaterial);
    // computeLineDistances() is required for LineDashedMaterial to work.
    // It is called after every geometry update in updateTrajectory().
    scene.add(this.trajectoryLine);

    // ── Landing marker (flat ring at y=0) ─────────────────────────────────────
    this.landingGeometry = new THREE.RingGeometry(0.2, 0.35, 32);
    this.landingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6b35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    this.landingMarker = new THREE.Mesh(this.landingGeometry, this.landingMaterial);
    // Rotate flat in XZ plane (ring is created in XY plane by default).
    this.landingMarker.rotation.x = -Math.PI / 2;
    this.landingMarker.visible = false;
    scene.add(this.landingMarker);

    // Initialise everything to schema defaults.
    const defaults: Record<string, number> = {};
    for (const [key, s] of Object.entries(this.schema)) defaults[key] = s.default;
    this.reset(defaults);
  }

  /**
   * Advance the simulation by one fixed physics timestep.
   * No-op once the projectile has landed.
   *
   * Force model:
   *   ax = -(drag / mass) * vx
   *   ay = -gravity - (drag / mass) * vy
   *
   * Semi-Implicit Euler: update v first, then x.
   */
  update(dt: number, params: Record<string, number>): void {
    if (this.hasLanded) return;

    const g    = params['gravity']          ?? this.schema['gravity'].default;
    const drag = params['dragCoefficient']  ?? this.schema['dragCoefficient'].default;
    const b    = drag / MASS;

    // Accelerations
    const ax = -b * this.vx;
    const ay = -g - b * this.vy;

    // Semi-Implicit Euler: velocity then position
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;

    this.time += dt;

    // ── Ground collision ──────────────────────────────────────────────────────
    if (this.y < 0) {
      this.y         = 0;
      this.hasLanded = true;
      this.actualRange = this.x;

      // Show and position the landing ring.
      if (this.landingMarker !== null) {
        this.landingMarker.position.set(this.x, 0, 0);
        this.landingMarker.visible = true;
      }
    }

    // ── Sync bob mesh ─────────────────────────────────────────────────────────
    if (this.bobMesh !== null) {
      this.bobMesh.position.set(this.x, this.y, 0);
    }
  }

  /**
   * Restore the projectile to its initial conditions.
   * Reuses all existing GPU resources — no geometry/material recreation.
   *
   * @param params Optional current parameter snapshot. When provided, the
   *               simulation respects the user's current slider values rather
   *               than hard-coded schema defaults.
   */
  reset(params?: Record<string, number>): void {
    const speed = params?.['initialSpeed']     ?? this.schema['initialSpeed'].default;
    const angle = params?.['launchAngle']      ?? this.schema['launchAngle'].default;

    const angleRad = (angle * Math.PI) / 180;

    // Physics state
    this.x         = 0;
    this.y         = 0;
    this.vx        = speed * Math.cos(angleRad);
    this.vy        = speed * Math.sin(angleRad);
    this.time      = 0;
    this.hasLanded = false;
    this.actualRange = 0;

    // Reposition the bob at the launch point.
    if (this.bobMesh !== null) {
      this.bobMesh.position.set(0, 0, 0);
    }

    // Hide the landing marker.
    if (this.landingMarker !== null) {
      this.landingMarker.visible = false;
    }

    // Rebuild the analytic predicted trajectory.
    this.updateTrajectory(params);
  }

  getMeasurements(): Record<string, number> {
    const speed  = this.schema['initialSpeed'].default;
    const angle  = this.schema['launchAngle'].default;
    const g      = this.schema['gravity'].default;

    // Analytic range (drag-free): R = v² * sin(2θ) / g
    const angleRad = (angle * Math.PI) / 180;
    const predictedRange = g > 0
      ? (speed * speed * Math.sin(2 * angleRad)) / g
      : 0;

    return {
      time_s:            this.time,
      current_y_m:       this.y,
      predicted_range_m: predictedRange,
      actual_range_m:    this.hasLanded ? this.actualRange : 0,
    };
  }

  dispose(): void {
    if (this.scene !== null) {
      if (this.bobMesh        !== null) this.scene.remove(this.bobMesh);
      if (this.trajectoryLine !== null) this.scene.remove(this.trajectoryLine);
      if (this.landingMarker  !== null) this.scene.remove(this.landingMarker);
    }

    this.bobGeometry?.dispose();
    this.bobMaterial?.dispose();
    this.trajectoryGeometry?.dispose();
    this.trajectoryMaterial?.dispose();
    this.landingGeometry?.dispose();
    this.landingMaterial?.dispose();

    this.bobMesh           = null;
    this.bobGeometry       = null;
    this.bobMaterial       = null;
    this.trajectoryLine    = null;
    this.trajectoryGeometry = null;
    this.trajectoryMaterial = null;
    this.landingMarker     = null;
    this.landingGeometry   = null;
    this.landingMaterial   = null;
    this.scene             = null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recompute the analytic (drag-free) parabolic trajectory and write the
   * result into the pre-allocated BufferGeometry position attribute.
   *
   * Analytic formula (no drag):
   *   x(t) = v₀ · cos(θ) · t
   *   y(t) = v₀ · sin(θ) · t - ½ · g · t²
   *
   * Time of flight: t_f = 2 · v₀ · sin(θ) / g
   *
   * After updating positions, `computeLineDistances()` MUST be called so
   * that LineDashedMaterial can measure segment lengths and place dashes.
   */
  private updateTrajectory(params?: Record<string, number>): void {
    if (this.trajectoryGeometry === null) return;

    const speed = params?.['initialSpeed'] ?? this.schema['initialSpeed'].default;
    const angle = params?.['launchAngle']  ?? this.schema['launchAngle'].default;
    const g     = params?.['gravity']      ?? this.schema['gravity'].default;

    const angleRad = (angle * Math.PI) / 180;
    const v0x = speed * Math.cos(angleRad);
    const v0y = speed * Math.sin(angleRad);

    // Time of flight for drag-free parabola; guard g=0.
    const flightTime = g > 0 ? (2 * v0y) / g : 1;

    const pos = this.trajectoryGeometry.attributes['position'] as THREE.BufferAttribute;

    for (let i = 0; i <= TRAJECTORY_SEGMENTS; i++) {
      const t = (i / TRAJECTORY_SEGMENTS) * flightTime;
      const tx = v0x * t;
      const ty = v0y * t - 0.5 * g * t * t;
      // Clamp to ground — trailing vertices would go below y=0 on the last
      // segments of a nearly-horizontal angle; keep them at ground level.
      pos.setXYZ(i, tx, Math.max(ty, 0), 0);
    }

    pos.needsUpdate = true;
    this.trajectoryGeometry.computeBoundingSphere();

    // Required for LineDashedMaterial — measures cumulative arc lengths so
    // the renderer knows where to draw each dash and gap.
    if (this.trajectoryLine !== null) {
      this.trajectoryLine.computeLineDistances();
    }
  }
}
