- Fix the readme
    - folder structure is not displaying correctly
    - the terminal command section for setup is not displaying correctly aswell 
    - update graphing section--> Graphing: [Insert Chart.js or uPlot here once implemented] for plotting 2D measurement data.
- add tick marks to this to-do.md file to indicate a point is fixed or not
- I nead a rule that gives me the coomit messages aswell the short and long ones after each reasonable chunk
- Measurement graph looks as if it is low quality compared to the rest of the ui, when i make the inside browser a bit smaller it get better but the wave and the text in it looks a bit unclear, only the word measurement gragh in blue looks sharp
- when i extend the pendulm length it now moves behind the measurement gragh part and dissapeares, since the ui is frosty glass i can see parts of it moving as if there is reall glass but we need to handle this in a robust manner to make sure that even with the longest pandulm length i can see the entire pandelum.  becuase when i increase to the max for e.g i can no longer see the ball --> done
- i need a reset button to automatically reset the experiment to its initial state / values of the paremeters aswell to be reseted --> done
- when the angle is set to 180, should not it also swing? or at least give a warning or something? or is this not even an application of pendulem and it requreies the angle to be less than 180, because when i make it 180
- the moment when i adjust the pendulum length the measurement gragh keep stuttering because it is trying to keep up with every small change i am trying to do, how can we solve that? is it a better idea to stop the entire experiment while the user is changinbg the paremeters on the fly? instead of having that stuttering when he tries to change any of the paremeters
-  the measurement gragh size is not accurate, i need it to bo larger, and i need it to match it drawing area, because at the moment i have a panel for measurement gragh but half of it only gets drawing on, the other half is empty , and it introduced issues such as the drawing area gets out of the measure gragh when i minimise the browser a little bit
- we need to find a way to handle , minimisation of the browser window (making it smaller or larger) more gracefully , because at the moment as i mentioned the drawing area is not consistent with the measurement graph's area and it gets even worse when i try to make it smaller, and the entire page is not predictable we need to find a way to handle it? which compenents will stay and which will go if the user tried to make it smaller? should we even make some go? what would be the best approach in that ?  
- when i click pause, the measurement gragh keeps stuttering at the very end of erasing the wave, because it keeps using shorter line segments to erase the wave, which makes it looks like it is stuttering, we also have the issue when the gragh (signal) is initally constructed, same exact issue. 
- time scale is very short, the bar itself should be bigger . whenever i try to increase or decrease it just move a very small bit that it look like it did not even move. 
- the reset button should reset everything and also go back to play mode not pause mode, it should also reset the time scale and any parameter the user can adjus while staying in the same experiment it was in, for example if i was in simple pendulum and clicked reset i will stay in simple pendulum but i will reset all tthe paremeters inside the entire experiment and go back to play mode
- adjusting the time scale while the experiment is running in play mode does not work, i need to be able to adjust it even while the experiment is running because at the moment it is working only when i click te pause button    
- Live readouts keeps repeating themselves when i click the reset button, so now the live readout menu is gigantic, and if i clicked reset as much times as i wanted now it is even under the inside page and unreachable, it should disappear when i click the reset button to enter a new live readout session . it was so vertically large that is now it is even behind the measurement graph and under so down that it is unreachable.
- when the user hovers over eny of the paremeters that he can change, i need to explain to him in simple manner what is exactly he is changing, what it does. 
- right now the simple pendulm is not experiminting anything, i just have a pendulum , i need to make it a real experiment, we need to make the user do something in order to make the calculations, using a timer or virtual clock timer in front of him, we need to imitate a real lab
    - here is an example of real praxilab simple pendulum experinment "i included the subtitles of the demonstration" ---> E:\Praxilabs\praxilabs-physics-experiments\references\NoteGPT_Subtitles_Simple Pendulum Experiment  What Really Controls the Swing.txt
- the readability is very bad in some parts of the ui especially in this part --> "A simple pendulum demonstrating the exact (non-linear) equation of motion with optional damping, integrated via Semi-Implicit Euler."
    - a dark grey color on a dark almost black background is very bad, make it more readable
- i feel that most of the UI spacing is not tilised correctly, maybe because the UI or the scene only have the pendulum and the string. how can we utilize the space better? can we make anything bigger or smaller or move them to a different position?  what i am trying to say is a large portion of the screen is dark areas, in the example of the pendulum can we make it bigger? make the string bigger r the ball bigeger? or would that affect performance? can we give it some sort of top base? even if it was schi fi styles futurestic looking lines, we should fill the space more. 
- I need a helper tool for the sole purpose of combining all source code files and sending them (by myself) to external LLMS fore code review or advice. 
- is it a good idea to let the user control the camera? would it behave weird if he controlled the camera while zooming in and zooming out would that break the experiment or the UI in any manner? instead of us making anything larger, and if we gave him tht contorl would he be bounded in some way? for example even if he zsoomed in 100% for the camera in the range we specified would he still see the entire experiment? 
- i need to make sure that the project rules --> E:\Praxilabs\praxilabs-physics-experiments\.agents\project-rules.md --> are always following up the rules specified by praxilabs and their docuemnts specified in here --> E:\Praxilabs\praxilabs-physics-experiments\references\Task2_Physics_Experiments_Suite_v2.pdf
- will the changes i have made in the pendulum affect the rest of the experiments ? with respect to camera and UI and stuff do we  have a defined grid or area that will allow that system / scene to be modular as possible ? 
- update the .gitignore to also include the python .git ignore since i am using some helper scripts by pyhton 


- Future enhancement --> i should notify the user whenever something not making sense:
    - for example if he is setting the time scale to 0, i should let him know that this is why the experiment is freezing, etc
- if it is must the experiment run in a full browser window not just windowowed to 75% or zoomed in or out i should notify the user with that. 
- we need to implement some kind of help button that when clicked gives the user more information about the experiment, its applications, etc.
    - i want to assume that the user knows nothing about physics and he came here to learn, he doesn't even know what simple pendulum is. 
        - so how can i help him with that ? 
- match the aesthetics / Color themes / art direction of praxilabs. 
    - Perhabs utilize an AI tool to extract that info for me, their fonts. design language, color choices, UI/ UX etc
- Extract the exact wordings of praxilabs for their youtube channel 
    - using youtube to subtitles --> passing that subtitiles to LLM for use in my versions of the experminets --> also we will use it as a manner of verification of the scientific material.    





