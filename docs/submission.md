# MoonSight submission handoff

**Team** GameOver — Miron Nikanchuk, Topuzov Ruslan, Bekturov Shoxruz, Alixonov Amirxon

**Challenge** Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

- [Public app](https://lunawindow-gameover.vercel.app/)
- [Terrain impact demo](https://lunawindow-gameover.vercel.app/workspace?preset=terrain-impact)
- [30-second video (MP4)](https://lunawindow-gameover.vercel.app/media/lunawindow-demo.mp4)

## Project summary

MoonSight compares candidate landing scenarios near the Moon’s south pole. Select two sites or dates to see when the centers of the Sun and Earth are above the horizon, how long their visibility overlaps, and how local terrain changes those estimates. The comparison uses JPL Horizons ephemerides and two terrain profiles built from NASA’s Lunar Orbiter Laser Altimeter data.

For a seven-day example on Connecting Ridge, including the modeled terrain reduces Earth-center visibility from 40.76% to 28.31%. Over that period, the longest stretch without Earth-center visibility increases from about 99.5 to 120.4 hours. The values estimate line of sight under the stated geometric and terrain models.

## 30-second demo

- **0–5 s** Introduce MoonSight and why terrain matters near the south pole.
- **5–10 s** Use the lunar atlas to choose two scenarios.
- **10–17 s** Show the Connecting Ridge result for both horizon models.
- **18–24 s** Use **Show the obstruction** to view Earth at the same time in both scenarios.
- **24–30 s** Show the GameOver team.

## Source and tool disclosures

- Ephemerides and site coordinates. [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/citations/20250002845)
- Terrain and local ephemeris tools. [NASA LOLA DEM](https://pgda.gsfc.nasa.gov/products/90) and [NAIF SPICE](https://naif.jpl.nasa.gov/naif/)
- Images and interactive models. [NASA SVS lunar image](https://svs.gsfc.nasa.gov/5605/), [NASA SVS south-pole horizon](https://svs.gsfc.nasa.gov/5228/), [Moon 3D model](https://solarsystem.nasa.gov/gltf_embed/2366/), and [Earth 3D model](https://solarsystem.nasa.gov/gltf_embed/2393/)
- Codex assisted with implementation, testing, and the submission draft. The demo uses synthetic narration. [unslop](https://github.com/heydamir/unslop) guided the visual polish.

## Publish

Put the public app and recorded demo links in the team’s NASA submission and verify them in a signed-out browser. Check the NASA project form for its current required fields. [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)
