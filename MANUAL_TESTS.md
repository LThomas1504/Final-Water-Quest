Manual test instructions for Water Quest

Prerequisites
- Open `index.html` in a browser (e.g., `Live Server` extension or open the file directly).

Quick smoke tests

1) Start and baseline
- Open the page. Ensure the UI shows:
  - "Cans Clicked: 0"
  - "Containers Filled: 0"
  - "Time Left: 30s"
- Click "Start Game". The start button should hide and Reset should appear.

2) Click behavior and counters
- Click a visible water can tile (appears randomly).
- Each click should:
  - Increase "Cans Clicked" by 1.
  - Increase the blue water level in the container by 20%.
  - The water can should disappear immediately when clicked (no delay).
  - A short click sound should play on each click (if your browser allows WebAudio autoplay).
  - Occasionally a red (negative) jug will appear. Clicking a red jug subtracts 20% from the container (and cumulative total). A different negative sound should play for red jugs.
- After 5 clicks (or when container reaches 100%), the "Containers Filled" count should increment by 1 and the visual container should reset to 0% after a short delay.

3) Goal notification and badge
- Set Goal (%) to 100 (default) and ensure Endless mode is off.
- Fill enough to reach a cumulative total of 100% (this could be 5 clicks or multiple filled containers).
- When the goal is first reached, a small confetti burst should appear and a "GOAL!" badge should briefly display in the top-right of the play area. The game should continue (timer still running).
  - A celebratory chime should play once when the goal is first reached.

4) Timer behavior and game end
- Let the timer reach 0 or reduce the time in the code for quicker test.
- When timer hits 0:
  - If Endless mode is ON: you should get a success message and confetti.
  - If Endless mode is OFF: success is determined by whether the cumulative percent reached the configured goal. If not, you should see a "Time is up" failure message.
  - On final success a slightly longer victory sound will play.

5) Reset
- Click "Reset" at any time. All counters, timers, and badges should return to their initial values.

Notes and troubleshooting
- If confetti doesn't show, open devtools and check for errors in the console.
- The water-can image must exist at `img/water-can.png` for the tile to show; otherwise the tile will be blank but still clickable.

If you want, I can add a tiny automated test harness (Puppeteer) that runs a few interactions headless.