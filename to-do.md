# PraxiLabs Physics Experiments — Task Tracker

## Documentation & Workflow
- [x] Fix the `README.md` (folder structure formatting, terminal setup commands, and graphing section).
- [x] Update `.gitignore` to include standard Python ignore rules.
- [x] Add the Python `code_dumper.py` helper utility for codebase inspection.
- [x] Establish a commit message rule (short titles and comprehensive bullet points).
- [ ] Ensure all `project-rules.md` constraints remain fully aligned with the assessment PDF.

## Core Engine & Camera
- [x] Add interactive camera controls (`OrbitControls`) with smooth damping/lerping.
- [x] Lock the camera to the 2D plane by clamping azimuth rotation to prevent confusing 3D perspective issues.
- [x] Set maximum and minimum zoom bounds so the user can always see the entire experiment without clipping inside objects.
- [x] Ensure the absolute Reset button restores the camera to its default position and tilt.
- [x] Improve the visibility and placement of the floating camera controls hint (added high-contrast frosted glass pill).
- [ ] Ensure changes maintain a defined grid or modular area so the master scene remains fully modular.

## UI & Layout
- [x] Fix the blurry Chart.js measurement graph on smaller screens and high-DPI displays.
- [x] Fix the graph drawing area size and responsiveness when resizing the browser window.
- [x] Fix the graph stuttering when the simulation is paused or when parameters are adjusted mid-run.
- [x] Fix the duplicating live readouts on reset.
- [x] Improve UI text readability (increased contrast for descriptions and labels).
- [x] Fix the time-scale slider width and make it adjustable while the experiment is running in play mode.
- [x] Ensure the absolute Reset button fully restores playback state (un-pauses, resets time scale, resets parameters).
- [ ] Add tooltips on hover to explain to the user exactly what each parameter does.
- [ ] Better utilize UI spacing (e.g., adding a sci-fi top base, making meshes larger, and reducing empty dark areas).

## Physics & Experiments
- [x] Fix the pendulum clipping behind the measurement graph at maximum length.
- [x] Address the 180-degree pendulum instability (clamped maximum angle to 179.9°).
- [x] Upgrade the simple pendulum to a "real experiment" (e.g., add a virtual clock/timer on screen to imitate a real lab).  --> similar to the praxilabs real exaple prvided in hear --> E:\Praxilabs\praxilabs-physics-experiments\references\NoteGPT_Subtitles_Simple Pendulum Experiment  What Really Controls the Swing.txt
- [x] Consider adding a warning or boundary effect when a parameter value produces a degenerate result (e.g., 180° angle).

> **Note:** Future enhancements have been moved to [docs/future_enhancements.md](docs/future_enhancements.md).
