# AI Agent Directives: Physics Experiments Suite

## Core Stack & Constraints
1. **Language:** Strict TypeScript. Do not output plain JavaScript.
2. **Frameworks:** Vite, Vanilla HTML/CSS, and Three.js. Do NOT introduce React, Vue, or Svelte under any circumstances.
3. **Physics Engines:** Do NOT use Cannon.js, Rapier, Ammo.js, or any other physics engine. All physics and math must be written manually.

## Architectural Mandates (Console & Cartridge)
1. **The Master Scene:** `src/core/Engine.ts` owns the SINGLE Three.js `Scene`, `Camera`, and `WebGLRenderer`. Experiments do NOT create their own scenes. They receive the master scene via their `setup(scene)` method and add/remove their specific `THREE.Mesh` objects to it.
2. **Experiment Disposal:** When switching experiments, the outgoing experiment must completely dispose of its geometries and materials to prevent WebGL memory leaks. 
3. **UI Generation:** Do not hardcode UI for specific experiments. The core UI module must automatically generate sliders and inputs dynamically by reading the `parameter schema` of the currently active experiment. 
4. **Design Language:** Style the overlaid HTML/CSS UI using a technical-industrial minimalist aesthetic—utilize deep grays, dark mode grids, frosted glass panels, and high-contrast accent colors for data visibility. 
5. **Decoupled Physics:** The simulation loop must use a fixed-timestep accumulator pattern and be completely decoupled from the rendering loop (requestAnimationFrame). Physics must be testable without a browser canvas. 
6. **Integrator:** Use Semi-Implicit Euler for numerical integration to ensure stability in oscillating systems, unless explicitly instructed otherwise.

## Extensibility Rule (Zero-Touch Core)
If asked to add a new experiment, you must create a single new file in `src/experiments/` that implements the `IExperiment` interface. You are strictly forbidden from modifying `Engine.ts`, `Physics.ts`, or `UI.ts` to accommodate the new experiment.

> **CRITICAL INSTRUCTION:** Before attempting to write or generate code for a new experiment, you MUST read `docs/api-contract.md` for the exact implementation blueprint, schema rules, and registration instructions.

## UI Interaction & Testing Rules (Added after Subagent Failures)
Before doing ANY visual/pixel-based interaction with a UI element you just built (e.g. testing via browser_subagent), FIRST read the source file where you created that element and get its exact id/selector. Never locate an element by guessing screen coordinates when you have direct access to the source that defines it.

For `<select>` elements specifically: do NOT attempt visual click-based interaction at all. Native `<select>` dropdowns render as OS-level popups that automation tools frequently cannot interact with via coordinates. Instead:
  1. Get the element by its id/selector (e.g. `document.querySelector('#graph-mode-select')`)
  2. Set its `.value` directly in evaluated JS.
  3. Dispatch a `change` event manually: `el.dispatchEvent(new Event('change', { bubbles: true }))`
  4. Screenshot only AFTER this, to verify the resulting state — never to locate the element beforehand.

Hard rule: if any single interaction step fails to produce the expected DOM/visual change after 2 attempts, STOP retrying variations of the same approach. Switch strategy entirely (e.g., move from click-based to JS-eval-based interaction). Never spend more than 5 tool calls total attempting to locate or interact with a single element.

## Git & GitHub Workflow Rule
1. **Show Commit Message First:** Whenever you finish a logical chunk of work, you MUST first show the proposed commit message (using bullet points) in the chat.
2. **Explicit Yes/No:** You MUST explicitly ask the user for a "yes" or "no" to commit.
3. **Execution:** ONLY after the user explicitly answers "yes", use the `run_command` tool to execute `git add . && git commit`.
4. **Commit Formatting:** Commit messages must **always** use bullet points for longer descriptions to maintain readability (e.g., `- Added feature X\n- Fixed issue Y`).

## Documentation Synchronization Rule
Whenever you make a code change, feature addition, or architectural modification, you MUST actively evaluate if that change affects existing documentation. Before considering a task complete or proposing a git commit, you must ensure all relevant documents are updated to reflect the new state of the project. This includes, but is not limited to:
- `README.md`
- `docs/api-contract.md`
- `AI_USAGE.md`
- Inline JSDoc block comments in TypeScript files.
Failure to keep documentation in sync with code is a violation of the agent workflow.

## Planning Workflow Rule
For any substantial, multi-file, or complex architectural changes, you MUST write an `implementation_plan.md` first and wait for the user to explicitly approve it before writing code. Trivial bug fixes, simple textual edits, and minor one-line changes do not require an implementation plan and can be executed directly.