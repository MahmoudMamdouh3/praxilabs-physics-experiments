# AI Usage & Workflow Documentation

## Tools 
*   **(Antigravity) Google Pro** 
*   **GitHub Copilot** 
*   **Gemini on the web (for extra Clarifyications, prompt editing/polish & code reviewing)**
*   **VS Code with Roo Code extension** 


# Exact Models Used 
- Gemini 3.1 Pro (High)
- Claude Sonnet 4.6 (Thinking) (Free)

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
I manually scaffolded the `.agents/project-rules.md` to strictly control the AI's architecture decisions. I also manually verified all the mathematical formulas (like the Semi-Implicit Euler integration for the spring-mass system) before allowing the AI to integrate them, to ensure they mapped precisely to the rubric requirements rather than generic approximations.

## Representative Prompts
1.  **On Memory Management Strategy (Claude Sonnet 4.6):** *"What do you think is the best way to handle the 3D scene setup—should the Core Engine create a single master scene and just swap the meshes in and out, or should every experiment generate its own separate Three.js scene container?"*
2.  **On Debugging State & Layout (Gemini Pro):**
    """
    I am experiencing several UX, state, and layout bugs in `src/core/UI.ts`. Before generating the updated code, please investigate the root causes of these specific issues. 
    1. Live Readouts Duplicating: When I click reset, the live readouts keep repeating, making the menu gigantic.
    2. Graph Stuttering: The measurement graph stutters wildly at the end of the wave when I click Pause.
    ... Analyze these issues, explain your intended fixes briefly, and then generate the complete, updated TypeScript code.
    """
3.  **On Projectile Trajectory (Claude Sonnet 4.6):** *"We need to fulfill the Projectile experiment requirements. Please implement `src/experiments/Projectile.ts`. Ensure that before launch, it shows a predicted analytic trajectory (no drag) as a dotted curve using `THREE.LineDashedMaterial`. Remember to call `computeLineDistances()` on the geometry so the dashes actually render."*
4.  **On Strict Physics/Render Separation (Gemini Pro):** *"The reviewer noted that calling `updateMeshes()` directly inside `update(dt)` violates strict mathematical/rendering decoupling and makes headless unit testing impossible. Please decouple this logic by introducing a `render(): void` contract in `IExperiment.ts` and moving all mesh mutations there, then have `Engine.ts` call it exactly once per visual frame."*

## AI Corrections (Suboptimal or Wrong Output)

### Case 1: Physics and Rendering Coupling
**The Issue:** The AI initially implemented the `update(dt)` loop for the experiments by calculating physics and immediately calling Three.js methods (e.g., `this.bobMesh.position.set(...)`). While visually correct, this structurally bound the mathematical logic to the DOM rendering engine, violating strict separation of concerns.
**The Fix:** I instructed the AI to decouple this logic. We introduced a `render(): void` contract in `IExperiment.ts`. The AI was prompted to move all mesh mutations into `render()` and have `Engine.ts` call it exactly once per render frame. This successfully isolated the math engine.

### Case 2: Headless Testability
**The Issue:** Because the early physics loop mutated Three.js meshes, we couldn't properly unit test the physics in a headless environment without complex DOM mocks or canvas errors.
**The Fix:** After enforcing the `render()` separation (Case 1), I tasked the AI to install Vitest and write a pure mathematical integration test (`Pendulum.test.ts`). The test successfully calls `setup()`, ticks `update()`, and verifies Semi-Implicit Euler energy conservation without touching the Three.js mesh pipeline at all, proving the robustness of the architecture.

### Case 3: File Confusion (Hallucination)
**The Issue:** At one point during the implementation of the Projectile experiment, the AI became confused by its context window and attempted to apply `Projectile.ts` physics changes directly into `src/core/UI.ts`.
**The Fix:** I recognized the hallucination immediately because it caused typescript compiler syntax errors (`tsc`) and broke the block structures in `UI.ts`. I explicitly instructed the AI to revert the `UI.ts` changes using the `multi_replace_file_content` tool and pointed out that the physics logic belonged strictly in `src/experiments/Projectile.ts`. The AI then correctly re-routed its output and fixed the build.

### Case 4: Subagent UI Interaction Failure (Empirical Pixel-Hunting)
**The Issue:** During verification of the Energy Plot bonus, the browser subagent was tasked with toggling a `<select>` dropdown. Instead of reading the `GraphPanel.ts` source code (which it had direct filesystem access to) to find the element's ID, the agent treated the known DOM as an unknown black box. It burned dozens of tool calls attempting empirical pixel-guessing (clicking coordinates, hovering, sending ArrowDown keys) which fundamentally fails on native OS-level `<select>` popups.
**The Fix:** I identified this as an agent-behavior bug rather than a UI bug. I stopped the subagent and explicitly formulated a new hard rule in `.agents/project-rules.md`: "Before doing ANY visual/pixel-based interaction with a UI element you just built, FIRST read the source file where you created that element and get its exact id/selector." I instructed the agent to locate `<select>` elements by ID and manipulate them via JS evaluation (`element.value = 'energy'; element.dispatchEvent(new Event('change'))`) rather than visual click-hunting, forcing it to use its deterministic code access instead of fallible visual heuristics.

### Case 5: Missing DOM Node Reference (Catastrophic UI Failure)
**The Issue:** During a refactor to add a zoom slider to the measurement graph, I accidentally deleted the instantiation of a wrapper `div` (`headerLeft`) in `GraphPanel.ts`, while leaving the `.appendChild()` calls that referenced it. Because the UI panels instantiate synchronously during page load, this caused a fatal `ReferenceError` that prevented the entire application UI from mounting, resulting in a black screen.
**The Fix:** The user provided a screenshot of the black screen. I immediately realized the application failed to load, spawned a headless browser subagent to fetch the console logs, pinpointed the exact line throwing the `ReferenceError`, and restored the missing `headerLeft` DOM element declaration. This restored full functionality immediately.