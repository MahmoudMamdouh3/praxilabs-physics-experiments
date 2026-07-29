# AI Usage & Workflow Documentation

## Tools 
*   **(Antigravity) Google Pro** 
*   **GitHub Copilot** 
*   **Gemini on the web (for extra Clarifyications, prompt editing/polish & code reviewing)**


# Exact Models Used 
- Gemini 3.1 Pro (High)
- Claude Sonnet 4.6 (Thinking)

## Pre-Coding Setup
**Question:** *What did you set up before writing any code, and why?*

Before writing a single line of application code, I mapped out a strict **Modular Plugin Architecture (Strategy Pattern)** and established a fixed agent environment folder (`.agents/project-rules.md`).

I did this because Large Language Models tend to default to React/canned physics engines or introduce memory leaks by generating multiple WebGL renderers. By establishing the `.agents` rules first, I physically constrained the AI to:
1.  Use strictly Vanilla TypeScript and Vite.
2.  Enforce a single, master Three.js Scene managed by a Core Engine to prevent WebGL crashes.
3.  Implement a strict `IExperiment` contract so the UI generates dynamically from a parameter schema rather than hardcoded DOM elements.
4.  Utilize a Semi-Implicit Euler integrator for stable oscillating systems.

This guaranteed that all subsequent AI generation aligned with a scalable, highly performant architecture.

## Fully Hand-Written Parts

## Representative Prompts
1.  **on Memory Management Strategy:** *"What do you think is the best way to handle the 3D scene setup—should the Core Engine create a single master scene and just swap the meshes in and out, or should every experiment generate its own separate Three.js scene container?"*
2.  """
I am experiencing several UX, state, and layout bugs in `src/core/UI.ts`. Before generating the updated code, please investigate the root causes of these specific issues. My initial thoughts and directives are below, but rely on your own analysis if a better architectural solution exists:

1. **Live Readouts Duplicating:** When I click reset, the live readouts keep repeating, making the menu gigantic. (Hypothesis: `buildParameterPanel` calls `this.readoutRows.clear()`, but the actual DOM elements aren't being removed from `this.readoutsPanel`).
2. **Graph Stuttering & Responsiveness:** 
    - The measurement graph stutters wildly at the end of the wave when I click Pause, or when I adjust parameters on the fly. How do we ensure Chart.js only redraws/pushes data when the simulation is actually advancing?
    - The graph drawing area gets cut off and does not match the container size, especially when resizing the browser window. How do we ensure Chart.js properly handles responsive resizing without overflowing the glassmorphism panel?
3. **Text Readability:** The dark-grey description text on the near-black background is hard to read. Please update `TOKEN.textMuted` to a brighter, highly legible color to maintain the technical-industrial minimalist aesthetic while ensuring high contrast.
4. **Time Scale Slider:** The time scale slider is too short and the adjustments feel too small to be usable. Make it physically wider (e.g., `width: '120px'`, `flex: 'none'`) and ensure the step size is intuitive.
5. **Absolute Reset:** The Reset button doesn't reset the playback state. When clicked, it must:
    - Completely reset the playback state to "Play" (unpause).
    - Reset the time scale to 1.0.
    - Visually update the time scale slider's DOM `.value` and label to reflect `1`.
    - Reset the pause button's text back to `'⏸ Pause'`.

Analyze these issues, explain your intended fixes briefly, and then generate the complete, updated TypeScript code for `src/core/UI.ts`.
"""

## AI Corrections (Suboptimal or Wrong Output)

### Case 1:

### Case 2: