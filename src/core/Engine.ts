import * as THREE from 'three';
import type { IExperiment } from '../experiments/IExperiment.ts';

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
// Owns the SINGLE Three.js Scene, PerspectiveCamera, and WebGLRenderer for
// the entire application.  All experiments receive this scene via their
// setup(scene) method; they never create their own renderer or camera.
//
// Architectural rules enforced here:
//  • Only Engine.ts creates/destroys the renderer and scene.
//  • loadExperiment() is the only public entry-point for swapping experiments.
//  • The render loop is RAF-based; the physics accumulator loop is NOT here
//    (it will live in Physics.ts and be injected as a callback).
// ---------------------------------------------------------------------------

export class Engine {
  // ── Three.js master objects ────────────────────────────────────────────────

  /** The single authoritative Three.js scene for the whole application. */
  readonly scene: THREE.Scene;

  /** Perspective camera attached to the scene. Aspect ratio is kept in sync
   *  with the window via the resize handler. */
  readonly camera: THREE.PerspectiveCamera;

  /** The WebGL renderer whose canvas is appended to `document.body`. */
  readonly renderer: THREE.WebGLRenderer;

  // ── Lighting ───────────────────────────────────────────────────────────────

  private readonly ambientLight: THREE.AmbientLight;
  private readonly directionalLight: THREE.DirectionalLight;

  // ── Experiment management ──────────────────────────────────────────────────

  private currentExperiment: IExperiment | null = null;

  // ── Loop state ─────────────────────────────────────────────────────────────

  private rafId: number = 0;
  private isRunning: boolean = false;

  // ── Optional physics tick callback ─────────────────────────────────────────
  // Kept as a placeholder so the Physics module can register itself later
  // without requiring any modification to Engine.ts (Zero-Touch Core rule).

  private physicsTickCallback: ((dt: number) => void) | null = null;

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor() {
    // ── Scene ────────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0d0f); // near-black, matches design language

    // ── Camera ───────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      60,                                          // vertical FOV (degrees)
      window.innerWidth / window.innerHeight,      // initial aspect ratio
      0.01,                                        // near clip
      1_000,                                       // far clip
    );
    this.camera.position.set(0, 2, 10);
    this.camera.lookAt(0, 0, 0);

    // ── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Give the canvas a stable id so the UI module can find/avoid it.
    this.renderer.domElement.id = 'three-canvas';
    this.renderer.domElement.style.display = 'block'; // remove default inline gap
    document.body.appendChild(this.renderer.domElement);

    // ── Lighting ─────────────────────────────────────────────────────────────

    // Soft fill light — ensures no object face is completely black.
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    // Primary directional light with shadow casting.
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(8, 16, 8);
    this.directionalLight.castShadow = true;

    // Shadow map resolution and frustum — tight frustum reduces aliasing.
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left = -20;
    this.directionalLight.shadow.camera.right = 20;
    this.directionalLight.shadow.camera.top = 20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.directionalLight.shadow.bias = -0.0005; // reduce shadow acne
    this.scene.add(this.directionalLight);

    // Secondary rim/fill light from below-left to give depth to objects.
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.25);
    rimLight.position.set(-8, -4, -8);
    this.scene.add(rimLight);

    // ── Resize handler ────────────────────────────────────────────────────────
    window.addEventListener('resize', this.onWindowResize);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an optional physics-tick callback.
   * Physics.ts calls this once during its own initialisation so it can hook
   * into the render loop without modifying Engine.ts.
   *
   * @param cb - Receives the frame delta-time in seconds each RAF tick.
   */
  setPhysicsTickCallback(cb: (dt: number) => void): void {
    this.physicsTickCallback = cb;
  }

  /**
   * Swap the active experiment.
   *
   * Steps:
   *  1. Dispose the outgoing experiment (frees GPU memory).
   *  2. Store the incoming experiment as active.
   *  3. Call `setup(this.scene)` so it can add its meshes.
   *
   * @param experiment - A fully constructed IExperiment implementation.
   */
  loadExperiment(experiment: IExperiment): void {
    // --- Tear down the outgoing experiment -----------------------------------
    if (this.currentExperiment !== null) {
      this.currentExperiment.dispose();
    }

    // --- Activate the incoming experiment ------------------------------------
    this.currentExperiment = experiment;
    experiment.setup(this.scene);
  }

  /**
   * Return the currently active experiment, or `null` if none is loaded.
   * Read-only reference — do NOT call setup/dispose from outside Engine.ts.
   */
  getActiveExperiment(): IExperiment | null {
    return this.currentExperiment;
  }

  /**
   * Start the RAF render loop.
   * Safe to call multiple times — subsequent calls are no-ops if already running.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.rafId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * Stop the RAF render loop and cancel the pending animation frame.
   * Does NOT dispose anything — call `destroy()` for full teardown.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Full teardown: stop the loop, dispose the active experiment, remove the
   * canvas from the DOM, and clean up event listeners.
   * Call this when the application itself is being unmounted.
   */
  destroy(): void {
    this.stop();

    if (this.currentExperiment !== null) {
      this.currentExperiment.dispose();
      this.currentExperiment = null;
    }

    window.removeEventListener('resize', this.onWindowResize);

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode !== null) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Core RAF callback.  Uses arrow function to preserve `this` without binding.
   *
   * Execution order each frame:
   *  1. Schedule the next frame immediately (ensures consistent cadence even
   *     if an exception is thrown further down).
   *  2. Invoke the optional physics tick callback with the frame delta.
   *     (The physics accumulator pattern belongs inside that callback, not here.)
   *  3. Render the scene.
   */
  private readonly renderLoop = (timestamp: DOMHighResTimeStamp): void => {
    if (!this.isRunning) return;

    this.rafId = requestAnimationFrame(this.renderLoop);

    // Compute delta-time in seconds.  Clamp to 100 ms to avoid a spiral of
    // death if the tab was backgrounded and then foregrounded.
    const dt = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.1);
    this.lastTimestamp = timestamp;

    // Forward to the physics accumulator (registered externally, if at all).
    if (this.physicsTickCallback !== null) {
      this.physicsTickCallback(dt);
    }

    // Render the master scene.
    this.renderer.render(this.scene, this.camera);
  };

  /** Timestamp of the previous RAF call, in milliseconds. */
  private lastTimestamp: DOMHighResTimeStamp = 0;

  /**
   * Keeps the camera aspect ratio and renderer size consistent with the
   * browser window.  Arrow function preserves `this` for the event listener.
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
