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

  // ── Comparison Mode — second experiment slot ───────────────────────────────
  // The second instance lives in the same master scene but is wrapped inside
  // an offset Group so it doesn't overlap with the primary experiment.

  private currentExperiment2: IExperiment | null = null;

  /** THREE.Group that spatially offsets the second experiment's meshes. */
  private readonly offsetGroup2: THREE.Group;

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

    // Offset group for the second experiment (comparison mode).
    // Set an X offset of 30 so both experiments sit side-by-side on the table.
    this.offsetGroup2 = new THREE.Group();
    this.offsetGroup2.position.set(30, 0, 0);
    this.scene.add(this.offsetGroup2);

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

    // Enable 2D Panning (Left Click + Drag)
    this.controls.enablePan = true;
    this.controls.enableRotate = false; // Disable tilting completely
    
    // Lock to Right Click to Rotate (which is disabled) and Left Click to Pan
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };

    // Zoom bounds: minDistance=6 keeps the camera outside the bob geometry.
    // maxDistance=30 is enough to frame a 10 m pendulum with the UI panels clear.
    this.controls.minDistance = 6;
    this.controls.maxDistance = 300;

    // Lock horizontal (azimuth) rotation to 0 — experiments are 2D (XY plane).
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;

    // Lock polar angle (tilt) to exactly face-on (90 degrees / Math.PI / 2).
    this.controls.minPolarAngle = Math.PI / 2;
    this.controls.maxPolarAngle = Math.PI / 2;

    // ── Bounded Panning (Task 32) ─────────────────────────────────────────────
    // Prevent the user from dragging the camera completely off the lab table.
    const minPan = new THREE.Vector3(-20, -10, -10);
    const maxPan = new THREE.Vector3(50, 20, 10);

    this.controls.addEventListener('change', () => {
      this.controls.target.clamp(minPan, maxPan);
    });

    // Sync camera look direction with the new orbit target.
    this.controls.update();

    // ── Atmosphere & Fog ─────────────────────────────────────────────────────
    this.scene.fog = new THREE.FogExp2(0x0d0d0f, 0.025);

    // ── Studio Three-Point Lighting ──────────────────────────────────────────

    // Ambient: Very dim and cool-toned
    this.ambientLight = new THREE.AmbientLight(0x111522, 0.4);
    this.scene.add(this.ambientLight);

    // Key Light: Cool white, directly above and slightly in front, casting soft shadows
    this.directionalLight = new THREE.DirectionalLight(0xeef4ff, 1.5);
    this.directionalLight.position.set(0, 20, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left   = -30;
    this.directionalLight.shadow.camera.right  =  30;
    this.directionalLight.shadow.camera.top    =  30;
    this.directionalLight.shadow.camera.bottom = -30;
    this.directionalLight.shadow.bias = -0.0005;
    this.scene.add(this.directionalLight);

    // Rim Light: Electric Blue, intense, catching edges from behind
    const rimLight = new THREE.DirectionalLight(0x22aaff, 2.0);
    rimLight.position.set(-10, -5, -15);
    this.scene.add(rimLight);

    // ── 3D Lab Environment ───────────────────────────────────────────────────
    
    // 1. Endless Lab Table (Highly polished slate extending into the fog)
    const tableGeo = new THREE.BoxGeometry(2000, 4, 2000);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,       
      roughness: 0.2,        
      metalness: 0.5,        
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.set(0, -2, 0); 
    tableMesh.receiveShadow = true;
    this.scene.add(tableMesh);
    
    // 2. Holographic Grid 
    const gridHelper = new THREE.GridHelper(2000, 2000, 0x112233, 0x112233);
    gridHelper.position.set(0, 0.01, 0);
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

  // ── Comparison Mode API ────────────────────────────────────────────────────

  /**
   * Load a second experiment for side-by-side comparison.
   * The second experiment's meshes are placed inside an offset Group so it
   * appears 30 units to the right of the primary without overlapping.
   *
   * @param experiment - A fresh instance of any IExperiment implementation.
   */
  loadExperiment2(experiment: IExperiment): void {
    if (this.currentExperiment2 !== null) {
      this.currentExperiment2.dispose();
      // Clear children left behind in the offset group
      while (this.offsetGroup2.children.length > 0) {
        this.offsetGroup2.remove(this.offsetGroup2.children[0]);
      }
    }
    this.currentExperiment2 = experiment;
    // The experiment calls scene.add() internally — we intercept by temporarily
    // making offsetGroup2 act as a fake scene via a proxy.
    const proxyScene = new THREE.Scene();
    experiment.setup(proxyScene);
    // Move all created objects from the proxy into the offset group
    while (proxyScene.children.length > 0) {
      this.offsetGroup2.add(proxyScene.children[0]);
    }
  }

  /** Return the second experiment used in comparison mode, or `null`. */
  getActiveExperiment2(): IExperiment | null {
    return this.currentExperiment2;
  }

  /** Dispose and remove the second experiment from the scene. */
  disposeExperiment2(): void {
    if (this.currentExperiment2 !== null) {
      this.currentExperiment2.dispose();
      this.currentExperiment2 = null;
    }
    while (this.offsetGroup2.children.length > 0) {
      this.offsetGroup2.remove(this.offsetGroup2.children[0]);
    }
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
   * Adjust camera to frame both experiments in Compare Mode, or revert to normal.
   */
  setCompareCameraView(enabled: boolean): void {
    if (enabled) {
      // Center between x=0 and x=30, and pull back to see both.
      this.camera.position.set(15, 0, 35);
      this.controls.target.set(15, -3, 0);
    } else {
      this.resetCamera();
    }
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

    // Sync meshes to current state (primary experiment)
    if (this.currentExperiment !== null) {
      this.currentExperiment.render();
    }

    // Sync meshes for comparison experiment if active
    if (this.currentExperiment2 !== null) {
      this.currentExperiment2.render();
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
