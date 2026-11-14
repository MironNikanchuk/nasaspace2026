# LunaWindow submission handoff

**Team** GameOver — Miron Nikanchuk, Topuzov Ruslan, Bekturov Shoxruz, Alixonov Amirxon

**Challenge** Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

## Project summary

LunaWindow compares candidate landing scenarios near the Moon’s south pole. Select two sites or dates to see when the centers of the Sun and Earth are above the horizon, how long their visibility overlaps, and how local terrain changes those estimates. The comparison uses JPL Horizons ephemerides and two terrain profiles built from NASA’s Lunar Orbiter Laser Altimeter data.

For a seven-day example on Connecting Ridge, including the modeled terrain reduces Earth-center visibility from 40.76% to 28.31%. Over that period, the longest stretch without Earth-center visibility increases from about 99.5 to 120.4 hours. The values estimate geometric line of sight under the stated model.

## 30-second demo

- **0–5 s** Start at the landing page. “At the lunar south pole, hills can block a line of sight that looks open on a map.”
- **5–13 s** Open the workspace and select **Terrain impact**. “LunaWindow compares the same site and dates with two horizon models.”
- **13–23 s** Show the Earth visibility cards and timeline. “With data from NASA’s Lunar Orbiter, Earth visibility at Connecting Ridge drops from 40.8% to 28.3% in this example.”
- **23–30 s** Show the overlap tracks and Share control. “Compare, save, and share a landing scenario built on NASA data.”

## Source and tool disclosures

- Ephemerides and site coordinates. [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/citations/20250002845)
- Terrain and local ephemeris tools. [NASA LOLA DEM](https://pgda.gsfc.nasa.gov/products/90) and [NAIF SPICE](https://naif.jpl.nasa.gov/naif/)
- Images and interactive models. [NASA SVS lunar image](https://svs.gsfc.nasa.gov/5605/), [NASA SVS south-pole horizon](https://svs.gsfc.nasa.gov/5228/), [Moon 3D model](https://solarsystem.nasa.gov/gltf_embed/2366/), and [Earth 3D model](https://solarsystem.nasa.gov/gltf_embed/2393/)
- Codex assisted with implementation, testing, and the submission draft. [unslop](https://github.com/heydamir/unslop) guided the visual polish.

## Publish

Put the public app and recorded demo links in the team’s NASA submission and verify them in a signed-out browser. Check the NASA project form for its current required fields. [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)
