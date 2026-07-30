# PraxiLabs Virtual Physics Lab - User Guide

Welcome to the **PraxiLabs Virtual Physics Lab**! This interactive 3D simulation platform allows you to explore classical physics experiments with accurate numerical simulation and real-time data plotting.

## Getting Started

When you launch the application, you will be placed into the main 3D lab environment. The simulation begins in a **Paused** state to allow you to configure the environment before the physics take over.

### Camera Controls
- **Pan:** Click and drag with the **Left Mouse Button** to pan your view across the lab table.
- **Zoom:** Use the **Mouse Scroll Wheel** to zoom in and out. The camera is constrained to ensure you don't lose the experiment.

### Global Controls
Located on the top left of your screen:
- **Play/Pause:** Start or pause the physics engine.
- **Reset:** Revert the experiment to its initial starting conditions.
- **Theme:** Select between different color palettes (Ocean, Cyberpunk, High Contrast, etc.). Your choice is automatically saved.
- **Download CSV:** Export all recorded data for the current session to a `.csv` file.
- **Compare:** Spawns a second instance of the current experiment side-by-side to allow for direct comparative analysis with independent parameter controls.

---

## The Experiments

Use the **Sidebar (Left)** to switch between the three available experiments. The sidebar also provides interactive sliders to adjust variables in real-time.

### 1. Simple Pendulum
A classical pendulum demonstrating simple harmonic motion.
- **Mass:** Change the bob's mass (note how it does *not* affect the period!).
- **Length:** Adjust the string length. Watch the frequency and period update dynamically.
- **Gravity:** Alter the strength of gravity.
- **Initial Angle:** Choose how high to pull the pendulum before releasing.

*Tip: A virtual stopwatch tracks the elapsed time and automatically counts up to 20 oscillations. A dedicated period panel also shows measured period, theoretical period, and percentage difference as the motion progresses.*

### 2. Spring-Mass System
A vertical spring following Hooke's Law with optional damping.
- **Mass:** Change the block's mass.
- **Spring Constant (k):** Adjust the stiffness of the spring.
- **Damping:** Introduce air resistance/friction to slowly drain energy from the system.
- **Initial Displacement:** Pull or compress the spring before releasing.

### 3. Projectile Motion
Fire a projectile to analyze parabolic trajectories.
- **Initial Speed:** Launch velocity.
- **Launch Angle:** Firing angle (updates the physical cannon barrel).
- **Gravity:** Downward pull.
- **Air Drag Coefficient:** Introduce realistic drag. A dotted white line shows the theoretical "drag-free" path for comparison.

*Tip: The simulation will automatically pause the exact moment the projectile hits the ground. A range panel also shows predicted range before launch and actual range after landing.*

---

## Data & Measurements

The **Right Panel** displays real-time live telemetry:
- **Live Numbers:** Check exact measurements (Energy, Frequency, Time).
- **Experiment Readouts:** Pendulum, projectile, and spring experiments each expose dedicated comparison panels for the task-specific measurements.
- **Live Graph:** Watch variables change over time on the oscilloscope-style graph.

If you wish to do further analysis in Excel or Python, simply click **Download CSV** from the top bar!

---

## Advanced Settings (Experimental)

### Numerical Integrator Options
Located below the main parameter controls, you can hot-swap the mathematical engine driving the simulation:
- **Semi-Implicit Euler (Default):** Perfectly balances stability and performance; intrinsically conserves energy over time for oscillating systems (Symplectic).
- **Explicit Euler:** Standard academic integration method. It is highly unstable over time for oscillating systems (energy will noticeably explode). Included to demonstrate numerical divergence.
- **Runge-Kutta 4 (RK4):** A highly precise 4th-order method ideal for complex trajectories, but computationally heavier.
