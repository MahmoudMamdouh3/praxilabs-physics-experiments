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
1.  **Demystifying the Web Stack:** *"CORE STACK Three.js, JavaScript or TypeScript, any bundler (Vite recommended) — what does each one of these do exactly to the extremist details with respect to this project"* 


## AI Corrections (Suboptimal or Wrong Output)

### Case 1:

### Case 2: