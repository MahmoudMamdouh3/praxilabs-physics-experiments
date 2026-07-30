# PraxiLabs Physics Experiments — Task Tracker


- [x] Create a user guide/manual inside docs folder
- [x] the color theme should reset when the user clicks on the absolute reset button, it should save and be persist
- [x] let us stick with the html osciliation counter instead of the three.js osciliation counter
- [x] the warning i get when i make the speed at 0 is not displayed properly because it is occluded by other UI element (the html osciliations counter)
- [x] the  hud  on the top needs to be more down, much more readable becuase again blue to a black background does not make any sense
- [x] the csv button should have text outside instead of the download emoji that indicates download csv with the exact same hover text no change --> Download measurement history as CSV
- [x] bug with osciliation counting, it keep on adding forever even after the 20 oscillations, it keep adding to the time on the 40 and 60 i believe. 
- [x] i need the simulation to start on the pause , not on the on the play mode
- [x] the color themes messed about the measurement gragh color, i need that to be constant color or at least fix it
- [x] the color of the warning if the 0 speed should follow the color theme
- [x] choosing the color them aswell should have text next to it indicating that this is theme selection 
- [x] the 3d space is empty and condsing, we need to add more the the static labratory background, right now i only have these axis lines which looks like shit and confusing aswell.
- [x] drag to tilt is wrong , i do not want to tilt, i need it to act as a panning tool , as if i am panning with a hand tool in a 2d app. 
- [x] the text on the hud does not make any sense and is confusing. 
- [x] in the projectile motion experiment, some lunc angles causes the ball to fall of the right side of the screen and comes out of the canvas so now i can not see it, even when i am zoomed out to the max, and i want all the experiments to start from pause as i mentioned. 
- [x] i want all the experiments to take place in the same 3d environemnt, a proper physics lab, where there is a lab table, and all the equipment is placed on that table, with the background being the physics lab.
- [x] i want the description panel of each experiment to be larger becauses i can not read them clearly --> like these ones for example --> PraxiLabs
Projectile Motion A projectile launched at a chosen speed and angle, subject to gravity and optional linear air drag, integrated via Semi-Implicit Euler. The dashed line shows the drag-free analytic trajectory for comparison.
- [x] i want the cam and scroll guide to be in a more appropriate place perhabs on a small panel that holds only text because now it is not visible at all and confusing. 
- [x] the projectile experiemnt should reset when it reaches it is target , but i do not mean by that that it is reset compeletly i want the ball to land and still be there but i am facing a bug right now is that when i want to repeat the experimnt i have to click the reset button then play again instead of clicking play at one. 
- [x] the lack of 3d environement around the objects makes it extremely hard to determine the accurecy and realism of what is haoppening. 
- [x] when i changes the air drag coffiecent the ball did not follow the dotted line, is that normall ? should not the dotted line follow all the parameeters i changes and predicte that path? 
- [x] the measurement gragh is very bad , i do not know what about it is bad but alot of things i do not like , i do not like the bug where i mentioned when it is first drawn it stutters alt and also when it finishes drawing, i donot like the fact that it is drawing looks finicky does not look polished like the ones we see on an oschiliscope for example. 
- [x] in the spring mass experment the spring moves past the top base , it goes through it litterly, is that normal ? 
- [x] i need to work on the polishment of the 3d shapes of the experiments item, becuase they all looks ugly
- [x] i want to able to zoom out and in the measurement graph, because the default one is very zoomed in and it looks like as if it is moving very fast 
- [x] the measurement gragh is overlapped with the camer controls panels , i need the camera controls guide panel to be under the live readoutpanels
- [x] i need to be able to control the font size on the fly, but also to be bounded so i do not break the front end
- [x] i need the panning to bounded to an area i set myself, because now i can pan outside the entire scene 
- [x] i do not want the reset button to reset the theme , i want the theme to be the same does not change by the rest button, i want it also to be under the live readouts panel. 
- [x] the entire scene dimensions is faulty, it is gigantic compared to the experiment place , you produced absolute bad madness, you really did , you did not measure anything and the scene is a messs as if a blind man set it up . the spring starts from undeerr the floor and goes through it, 
- [x] i do not wanted the word speed when controlling time , scale i want it to be "time scale"
- [x] i need to be able to control the number of osciliation i need to count, also when that number is reach the xperiment should pause itself 
- [x]  the warrning i get when i change the angle to 180 or when i set speed to 0 is overlapping wioth osicilation panel i need the warning to be larger, the appear in the middle of the screen, and to be still there auntill the user clicks X on them. 
- [x] if the ball stops because of the damping coffeicent or pecause of anything , i need to have some logic for that, i need the osicilations counter to stop after a while to let the user know it is not osciliating because of bla bla becuase now it continues counting even though the ball is not moving 
- [x] when i hover over the reset button --> i should get info that this will reset the experiment to the beggining and to the default values
- [x] i need another ressett button for the settings panel , with a hover info too
- [ ] Fix Graph Panel UI buttons (mode select and zoom) not working due to pointer-events.
- [ ] Fix Compare Mode 3D Spacing (camera doesn't show the second experiment).
- [ ] Fix Compare Mode Execution (Play/Pause/Reset don't work for the second experiment).
- [ ] Fix Compare Mode UI Overflow (Parameter panel overflows off the bottom of the screen).











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
- [x] Add the ability for the user to change the color scheme of the UI based on 10 different established color schemes to allow for better visibility for all users.

## Physics & Experiments
- [x] Fix the pendulum clipping behind the measurement graph at maximum length.
- [x] Address the 180-degree pendulum instability (clamped maximum angle to 179.9°).
- [x] Upgrade the simple pendulum to a "real experiment" (e.g., add a virtual clock/timer on screen to imitate a real lab).
- [x] Consider adding a warning or boundary effect when a parameter value produces a degenerate result (e.g., 180° angle).

> **Note:** Future enhancements have been moved to [docs/future_enhancements.md](docs/future_enhancements.md).
