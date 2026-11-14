import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { demoComparison } from "@/lib/demo";
import { PRESETS } from "@/lib/presets";
import type { Result } from "@/lib/types";
import styles from "./landing.module.css";

const team = [
  "Miron Nikanchuk",
  "Topuzov Ruslan",
  "Bekturov Shoxruz",
  "Alixonov Amirxon",
];

const terrainPreset = PRESETS.find((preset) => preset.id === "terrain-impact");
const terrainExample = terrainPreset && demoComparison(terrainPreset.scenarios);
const exampleLink = "/workspace?preset=terrain-impact";
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function visibilityPercent(value: number) {
  return `${(Math.round(value * 100) / 100).toFixed(2)}%`;
}

function VisibilityRow({ result }: { result: Result }) {
  const start = Date.parse(result.start_utc);
  const span = Date.parse(result.end_utc) - start;
  const value = visibilityPercent(result.summary.earth_visible_percent);
  const label = result.model.horizon === "geometric" ? "Geometric horizon" : "LOLA terrain horizon";

  return (
    <div className={styles.visibilityRow}>
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className={styles.track} aria-hidden="true">
        {result.windows.earth.map((window) => {
          const left = (Date.parse(window.start_utc) - start) / span * 100;
          const width = (Date.parse(window.end_utc) - Date.parse(window.start_utc)) / span * 100;
          return <span key={window.start_utc} style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className={styles.landing}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <header className={`${styles.wrap} ${styles.nav}`}>
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/atlas">Lunar atlas</Link>
          <a href="#method">Method</a>
          <a href="#team">Team</a>
        </nav>
        <Link className={styles.navAction} href="/workspace">
          Workspace <Icon name="arrow-top-right" width={16} />
        </Link>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">Find your window <span>on the Moon.</span></h1>
            <p>Compare sunlight and line of sight to Earth at landing sites near the lunar south pole.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/workspace">
                Compare landing sites <Icon name="arrow-right" width={18} />
              </Link>
              <Link className={styles.inlineAction} href="/atlas">
                Explore the atlas <Icon name="arrow-top-right" width={15} />
              </Link>
            </div>
          </div>
          <figure className={styles.heroFigure}>
            <div className={styles.moonVisual}>
              <Image
                src="/media/moon.jpg"
                alt="Earth-facing side of the Moon with the south polar region near its lower rim"
                fill
                preload
                unoptimized
                sizes="(max-width: 760px) 90vw, (max-width: 1120px) 49vw, 590px"
              />
            </div>
            <figcaption>
              <span>The Moon</span>
              <a href="https://svs.gsfc.nasa.gov/5605/">NASA Scientific Visualization Studio</a>
            </figcaption>
          </figure>
        </section>

        <section className={`${styles.wrap} ${styles.evidence}`} id="method" aria-labelledby="method-title">
          <div className={styles.evidenceCopy}>
            <h2 id="method-title">How terrain changes the view</h2>
            <p>At Connecting Ridge, the modeled terrain blocks the center of Earth for longer than the geometric horizon suggests. That shortens the potential direct link.</p>
            {terrainExample && (
              <figure className={styles.visibility}>
                <figcaption>
                  <strong>Earth above the horizon</strong>
                  <span>{dateFormat.formatRange(new Date(terrainExample.scenarios[0].start_utc), new Date(terrainExample.scenarios[0].end_utc))} UTC</span>
                </figcaption>
                {terrainExample.scenarios.map((result) => <VisibilityRow key={result.model.horizon} result={result} />)}
              </figure>
            )}
            <Link className={styles.inlineAction} href={exampleLink}>
              Run this comparison <Icon name="arrow-right" width={17} />
            </Link>
          </div>
          <figure className={styles.horizonFigure}>
            <Image
              src="/media/lunar-horizon.jpg"
              alt="Earth visible in the black sky above a computer-rendered lunar south-pole horizon"
              width={1024}
              height={576}
              sizes="(max-width: 760px) 90vw, 43vw"
            />
            <figcaption>
              <span>South-pole visualization</span>
              <a href="https://svs.gsfc.nasa.gov/5228/">NASA SVS</a>
            </figcaption>
          </figure>
        </section>

        <section className={`${styles.wrap} ${styles.team}`} id="team" aria-labelledby="team-title">
          <div>
            <h2 id="team-title">GameOver</h2>
            <p>Built for the Lunar Landing Site Navigator challenge.</p>
          </div>
          <ul>{team.map((name) => <li key={name}>{name}</li>)}</ul>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <Brand small />
        <span>NASA Space Apps Challenge 2026</span>
        <a href="https://github.com/MironNikanchuk/nasaspace2026">Project source <Icon name="arrow-top-right" width={15} /></a>
      </footer>
    </div>
  );
}
