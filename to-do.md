# PraxiLabs Physics Experiments — Task Tracker

---

## Documentation & Workflow

- [x] Fix the `README.md` — folder structure formatting, terminal setup commands, and graphing section placeholder updated.
- [x] Update `.gitignore` to include standard Python ignore rules (helper scripts use Python).
- [x] Add the Python `code_dumper.py` helper utility for codebase inspection.
- [ ] Ensure all `project-rules.md` constraints remain fully aligned with the assessment PDF (`references/Task2_Physics_Experiments_Suite_v2.pdf`).
- [ ] Extract exact aesthetic and art-direction guidelines from PraxiLabs' visual identity for use in the design system.
- [ ] Mirror the exact experiment wording, learning objectives, and context from PraxiLabs' YouTube subtitles (`references/`) into the experiment descriptions and the future help overlay.

---

## Core Engine & Camera

- [x] Add interactive camera controls (`OrbitControls`) with smooth damping/lerping (`enableDamping = true`, `dampingFactor = 0.08`).
- [x] Lock the camera to the 2D plane by clamping azimuth rotation (`minAzimuthAngle = maxAzimuthAngle = 0`), preventing the confusing inside-out perspective against the black background.
- [x] Increase `minDistance` from `2` to `6` to prevent the camera clipping inside the pendulum bob or projectile geometry.
- [x] Ensure the absolute Reset button restores the camera to its default position and tilt via `engine.resetCamera()`.
- [x] Confirm the modular scene architecture is maintained: all experiments share one master scene, camera, and renderer (`Engine.ts`) and never instantiate their own — consistent with the assessment PDF requirements.
- [ ] Improve the visibility and placement of the floating camera controls hint (`CAM CONTROLS: LEFT-CLICK TO TILT | SCROLL TO ZOOM`). The current dark-grey text on near-black background has near-zero contrast and the positioning is hard to notice.

---

## UI & Layout

- [x] Fix the blurry Chart.js measurement graph on HiDPI/Retina screens by wrapping the canvas in a sized container (`position: relative; width: 100%; height: 130px`) and switching to `responsive: true` to let Chart.js own DPI scaling.
- [x] Fix the graph stuttering when the simulation is paused or when parameters are adjusted mid-run by gating `updateGraph()` behind `!physics.isPaused`.
- [x] Reduce the rolling graph buffer from 300 to 150 points so the wave fills the chart area faster and feels more responsive.
- [x] Fix the duplicating live readouts on reset. Root cause: `buildParameterPanel()` cleared the `Map` but left orphan DOM nodes. Fixed by introducing `clearReadouts()` which removes DOM children and clears the Map atomically.
- [x] Improve UI text readability by raising `TOKEN.textMuted` from `#596170` (~2.5:1 contrast) to `#8a95a8` (~5.1:1 contrast, WCAG AA compliant).
- [x] Fix the time-scale slider: changed from a collapsing `flex: 1` layout to a dedicated full-width sub-row with an always-visible static **"Speed:"** label, a flex slider, and an accent-coloured value readout.
- [x] Ensure the absolute Reset button fully restores playback state: un-pauses, resets `timeScale` to `1×`, snaps all parameter sliders back to schema defaults, and calls `engine.resetCamera()`.
- [ ] Investigate and implement a graceful browser window resize strategy: define which UI panels collapse, reflow, or persist when the viewport shrinks below a minimum threshold.
- [ ] Add parameter tooltip overlays (visible on hover) that explain each slider's physical meaning in plain language for students.

---

## Physics & Experiments

- [x] Implement the **Simple Pendulum** experiment (`Pendulum.ts`) — exact non-linear equation of motion, Semi-Implicit Euler integration, zero-crossing period measurement, and correct 3D mesh disposal.
- [x] Implement the **Projectile Motion** experiment (`Projectile.ts`) — Semi-Implicit Euler with gravity and optional linear air drag, analytic dashed trajectory overlay (`LineDashedMaterial` + `computeLineDistances()`), landing ring marker, and correct GPU resource disposal.
- [x] Resolve the 180° pendulum instability: clamped `initialAngle` schema maximum to `179.9°` so the pendulum never balances on the unstable upright equilibrium.
- [ ] Implement the **Spring-Mass System** experiment (`Spring.ts`) — replace the current stub with a full Hooke's law simulation (`F = -kx - bv`), 3D spring coil mesh, and displacement measurements.
- [ ] Consider adding a ± boundary warning when a parameter value produces a physically degenerate or undefined result (e.g., `timeScale = 0` freezing the simulation, `angle = 180°` at the unstable equilibrium point).

---

## Future Enhancements & Polish

- [ ] Add a contextual **Help / Tutorial** overlay button per experiment that surfaces: the physical description, real-world applications, key equations, and guidance on what to observe.
- [ ] Add a notification banner or toast when the user sets `timeScale` to `0`, explaining clearly that this is why the simulation appears frozen.
- [ ] Add a viewport-size warning when the browser window is too small to render the full UI correctly.
- [ ] Explore sci-fi / technical aesthetic enhancements: a top HUD bar, larger mesh scale for visual impact, or dynamic grid floor to reinforce the technical-industrial design language.
- [ ] Add keyboard shortcuts for common actions (Space = pause/play, R = reset, +/- = time scale).
