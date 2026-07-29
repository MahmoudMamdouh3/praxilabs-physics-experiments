import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { IExperiment } from '../experiments/IExperiment.ts';

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
// Owns the SINGLE Three.js Scene, PerspectiveCamera, WebGLRenderer, and now
// OrbitControls for the entire application.
//
// Camera / OrbitControls bounding design:
//
//  • minAzimuthAngle = maxAzimuthAngle = 0 — locks horizontal rotation.
//                          The experiments are 2D (XY plane); side-rotating
//                          the camera collapses depth and makes the scene look
//                          flat and confusing. Only vertical tilt + zoom allowed.
//  • minDistance = 6     — prevents the camera clipping inside the pendulum bob.
//  • maxDistance = 30    — at z=30 with 60° FOV, half-height ≈ 17 m, which
//                          safely frames even a 10 m pendulum above the bottom
//                          UI panel. Beyond 30 m objects become invisible specks.
//  • maxPolarAngle = π/1.5 (120°) — blocks the camera from flipping fully
//                          upside-down (default is π = 180°). The user can still
//                          peer at the experiment from slightly below, but cannot
//                          invert the up-vector and lose spatial orientation.
//  • enableDamping = true — smooth deceleration; requires controls.update()
//                          every frame to integrate the damping velocity.
//
// Zero-Touch Core rule: experiments must NOT create their own scene/camera/renderer.
// ---------------------------------------------------------------------------

export class Engine {
  // ── Three.js master objects ────────────────────────────────────────────────

  /** The single authoritative Three.js scene for the whole application. */
  readonly scene: THREE.Scene;

  /** Perspective camera. Aspect ratio is kept in sync with the window. */
  readonly camera: THREE.PerspectiveCamera;

  /** The WebGL renderer whose canvas is appended to `document.body`. */
  readonly renderer: THREE.WebGLRenderer;

  /** Orbit controls — bounded so the user cannot break the view. */
  readonly controls: OrbitControls;

  // ── Lighting ───────────────────────────────────────────────────────────────

  private readonly ambientLight: THREE.AmbientLight;
  private readonly directionalLight: THREE.DirectionalLight;

  // ── Experiment management ──────────────────────────────────────────────────

  private currentExperiment: IExperiment | null = null;

  // ── Loop state ─────────────────────────────────────────────────────────────

  private rafId: number = 0;
  private isRunning: boolean = false;

  // ── Optional physics tick callback ─────────────────────────────────────────
  // Physics.ts registers itself here without modifying Engine.ts (Zero-Touch Core).

  private physicsTickCallback: ((dt: number) => void) | null = null;

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor() {
    // ── Scene ────────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0d0f);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      60,                                      // vertical FOV (degrees)
      window.innerWidth / window.innerHeight,  // initial aspect ratio
      0.01,                                    // near clip
      1_000,                                   // far clip
    );
    // Positioned straight ahead on the Z axis so OrbitControls can take
    // full symmetric control without a pre-rotated camera matrix.
    this.camera.position.set(0, 0, 15);

    // ── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.id = 'three-canvas';
    this.renderer.domElement.style.display = 'block';
    document.body.appendChild(this.renderer.domElement);

    // ── OrbitControls ─────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // Focus slightly below the pivot so a mid-length pendulum (4–6 m) sits
    // centred in the viewport rather than the origin being at the top of frame.
    this.controls.target.set(0, -3, 0);

    // Smooth deceleration — requires controls.update() every render frame.
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Disable panning: keeps the orbit target locked on the experiment so the
    // user cannot accidentally pan the scene out of view.
    this.controls.enablePan = false;

    // Zoom bounds: minDistance=6 keeps the camera outside the bob geometry.
    // maxDistance=30 is enough to frame a 10 m pendulum with the UI panels clear.
    this.controls.minDistance = 6;
    this.controls.maxDistance = 30;

    // Lock horizontal (azimuth) rotation to 0 — experiments are 2D (XY plane).
    // Allowing side-rotation collapses the depth axis and makes the scene look
    // flat or inside-out against the black background.
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;

    // Polar angle cap: stops camera flipping upside-down (π = fully inverted).
    // π/1.5 ≈ 120° — user can look from slightly below but cannot invert.
    this.controls.maxPolarAngle = Math.PI / 1.5;

    // Sync camera look direction with the new orbit target.
    this.controls.update();

    // ── Lighting ─────────────────────────────────────────────────────────────

    // Soft ambient fill — no object face is ever completely black.
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    // Primary directional light with soft shadow casting.
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(8, 16, 8);
    this.directionalLight.castShadow = true;

    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left   = -20;
    this.directionalLight.shadow.camera.right  =  20;
    this.directionalLight.shadow.camera.top    =  20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.directionalLight.shadow.bias = -0.0005;
    this.scene.add(this.directionalLight);

    // Secondary rim/fill light for edge definition.
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.25);
    rimLight.position.set(-8, -4, -8);
    this.scene.add(rimLight);

    // ── Grid Floor ───────────────────────────────────────────────────────────
    // Fills the bottom dark space and gives a sense of scale and grounding.
    const gridHelper = new THREE.GridHelper(60, 60, 0x22aaff, 0x111118);
    gridHelper.position.set(0, -12, 0); // Positioned well below the lowest experiment parts
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // ── Resize handler ────────────────────────────────────────────────────────
    window.addEventListener('resize', this.onWindowResize);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an optional physics-tick callback.
   * Called each RAF tick with the frame delta-time (seconds).
   */
  setPhysicsTickCallback(cb: (dt: number) => void): void {
    this.physicsTickCallback = cb;
  }

  /**
   * Swap the active experiment.
   *  1. Dispose the outgoing experiment (frees GPU memory).
   *  2. Activate the new experiment by calling setup(scene).
   */
  loadExperiment(experiment: IExperiment): void {
    if (this.currentExperiment !== null) {
      this.currentExperiment.dispose();
    }
    this.currentExperiment = experiment;
    experiment.setup(this.scene);
  }

  /** Return the currently active experiment, or `null` if none is loaded. */
  getActiveExperiment(): IExperiment | null {
    return this.currentExperiment;
  }

  /**
   * Restore the camera and orbit target to their default positions.
   * Call this from the UI Reset button so the user can always recover
   * to a known-good viewpoint regardless of how far they have zoomed/tilted.
   */
  resetCamera(): void {
    this.camera.position.set(0, 0, 15);
    this.controls.target.set(0, -3, 0);
    this.controls.update();
  }

  /**
   * Start the RAF render loop.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.rafId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * Stop the RAF render loop.
   * Does NOT dispose anything — call `destroy()` for full teardown.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Full teardown: stop the loop, dispose the active experiment,
   * destroy OrbitControls, remove the canvas, and clean up listeners.
   */
  destroy(): void {
    this.stop();

    if (this.currentExperiment !== null) {
      this.currentExperiment.dispose();
      this.currentExperiment = null;
    }

    this.controls.dispose();
    window.removeEventListener('resize', this.onWindowResize);

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode !== null) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Core RAF callback — arrow function preserves `this`.
   *
   * Frame execution order:
   *  1. Schedule next frame immediately (consistent cadence).
   *  2. Run the physics accumulator callback (registered externally).
   *  3. Update OrbitControls to integrate damping velocity.
   *  4. Render the master scene.
   */
  private readonly renderLoop = (timestamp: DOMHighResTimeStamp): void => {
    if (!this.isRunning) return;

    this.rafId = requestAnimationFrame(this.renderLoop);

    // Clamp dt to 100 ms to prevent a spiral of death after tab focus loss.
    const dt = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.1);
    this.lastTimestamp = timestamp;

    if (this.physicsTickCallback !== null) {
      this.physicsTickCallback(dt);
    }

    // MUST be called every frame when enableDamping = true.
    // Integrates the damping deceleration applied to the last user gesture.
    this.controls.update();

    // Sync meshes to current state
    if (this.currentExperiment !== null) {
      this.currentExperiment.render();
    }

    this.renderer.render(this.scene, this.camera);
  };

  private lastTimestamp: DOMHighResTimeStamp = 0;

  /**
   * Keeps the camera aspect ratio and renderer size in sync with the window.
   * Also notifies OrbitControls so it recalculates its internal frustum math.
   */
  private readonly onWindowResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
}
