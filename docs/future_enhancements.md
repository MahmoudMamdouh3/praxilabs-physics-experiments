# Future Enhancements & Polish

This document tracks planned future features, polish items, and UX improvements for the physics laboratory.

## User Notifications & Edge Cases
- [x] **Time Scale Warning:** Add a notification banner or toast when the user sets the time scale to `0`, clearly explaining that this is why the simulation appears frozen.
- [x] **Viewport Warning:** Add a notification or warning if the experiment is running in a window that is too small, ensuring they play in an optimal window size.
- [x] **Parameter Warnings:** Notify the user when setting parameters that may break physics expectations (e.g., setting the angle to exactly 180 degrees).

## Educational Tools & Onboarding
- [x] **Help / Tutorial Overlay:** Implement a dedicated help button for each experiment. Assume the user knows nothing about physics; the overlay should explain what the experiment is, its real-world applications, and how to use it.
- [x] **Content Extraction:** Extract the exact wording, learning objectives, and context from PraxiLabs' YouTube subtitles (e.g., using LLMs to verify scientific material) and integrate them into the experiment descriptions.

## Aesthetics & Art Direction
- [x] **Visual Identity:** The current studio-style lab environment and color-theme system now provide a more cohesive, readable, and industrial-science look for the platform.
- [ ] **AI Asset Extraction:** Utilize AI tools to analyze and extract PraxiLabs' exact design guidelines for implementation.
