"use client";

import { HeroMoon, TerrainAnimation } from "@/components/landing-scenes";
import Link from "next/link";
import { LanguageSelect, useLanguage } from "@/components/language";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { demoComparison } from "@/lib/demo";
import { PRESETS } from "@/lib/presets";
import type { Result } from "@/lib/types";
import styles from "./landing.module.css";

const team = [
  ["Nikanchuk Miron", "NM", "Team lead and full-stack developer"],
  ["Topuzov Ruslan", "TR", "Frontend development and research"],
  ["Bekturov Shoxruz", "BS", "Backend development and research"],
  ["Alixonov Amirxon", "AA", "Research, presentation and script"],
];

const terrainPreset = PRESETS.find((preset) => preset.id === "terrain-impact");
const terrainExample = terrainPreset && demoComparison(terrainPreset.scenarios);
const exampleLink = "/workspace?preset=terrain-impact";
function visibilityPercent(value: number) {
  return `${(Math.round(value * 100) / 100).toFixed(2)}%`;
}

function VisibilityRow({ result }: { result: Result }) {
  const { t } = useLanguage();
  const start = Date.parse(result.start_utc);
  const span = Date.parse(result.end_utc) - start;
  const value = visibilityPercent(result.summary.earth_visible_percent);
  const label = result.model.horizon === "geometric" ? "Geometric horizon" : "LOLA terrain horizon";

  return (
    <div className={styles.visibilityRow}>
      <div><span>{t(label)}</span><strong>{value}</strong></div>
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
  const { t, language } = useLanguage();
  const dateFormat = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
  return (
    <div className={styles.landing}>
      <a className={styles.skip} href="#main">{t("Skip to content")}</a>
      <header className={`${styles.wrap} ${styles.nav}`}>
        <Brand />
        <nav aria-label={t("Main navigation")}>
          <Link href="/atlas"><Icon name="globe-alt" width={18} />{t("Lunar atlas")}</Link>
          <a href="#method"><Icon name="file-document" width={18} />{t("Method")}</a>
          <a href="#team"><Icon name="profile" width={18} />{t("Team")}</a>
        </nav>
        <div className={styles.navActions}><LanguageSelect /></div>
      </header>

      <main id="main" tabIndex={-1}>
        <div className={styles.heroSpace}><section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">{t("Lunar landing sites")}</h1>
            <p>{t("Check when the Sun and Earth are visible from landing sites near the Moon’s south pole.")}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/workspace">
                {t("Workspace")} <Icon name="arrow-right" width={18} />
              </Link>
            </div>
          </div>
          <div className={styles.heroFigure}><HeroMoon /></div>
        </section></div>

        <section className={`${styles.wrap} ${styles.evidence}`} id="method" aria-labelledby="method-title">
          <div className={styles.evidenceCopy}>
            <h2 id="method-title">{t("When the ridge hides Earth")}</h2>
            <p>{t("From Connecting Ridge, Earth can be above the 0° horizon and still be hidden by the ridge.")}</p>
            {terrainExample && (
              <figure className={styles.visibility}>
                <figcaption>
                  <strong>{t("Earth visibility")}</strong>
                  <span>{dateFormat.formatRange(new Date(terrainExample.scenarios[0].start_utc), new Date(terrainExample.scenarios[0].end_utc)).replace(/[\u2009\u202f\u00a0]/g, " ")} UTC</span>
                </figcaption>
                {terrainExample.scenarios.map((result) => <VisibilityRow key={result.model.horizon} result={result} />)}
              </figure>
            )}
            <Link className={styles.inlineAction} href={exampleLink}>
              {t("Run this comparison")} <Icon name="arrow-right" width={17} />
            </Link>
          </div>
          {terrainExample && <TerrainAnimation frames={terrainExample.scenarios[1].samples
            .filter((sample) => sample.time_utc >= "2027-01-10" && sample.time_utc < "2027-01-13")
            } />}
        </section>

        <section className={`${styles.wrap} ${styles.team}`} id="team" aria-labelledby="team-title">
          <div>
            <h2 id="team-title"><img className={styles.teamLogo} src="/media/gameover.svg" alt="GameOver" /></h2>
            <p>{t("Built for the Lunar Landing Site Navigator challenge.")}</p>
          </div>
          <ul>{team.map(([name, initials, role]) => <li key={name}>
            <div className={styles.portrait} aria-hidden="true">{initials}</div>
            <strong>{name}</strong><span>{t(role)}</span>
          </li>)}</ul>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <Brand small />
        <a className={styles.eventMark} href="https://www.spaceappschallenge.org/2026/"><img src="/media/space-apps.webp" alt="NASA Space Apps Challenge 2026" /></a>
        <div className={styles.footerLinks}><Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/sources">{t("Sources")}</Link>
          <a className={styles.githubLink} href="https://github.com/MironNikanchuk/nasaspace2026"><img src="/media/github-dark.svg" width="17" height="17" alt="" /> {t("Project source on GitHub")}</a></div>
      </footer>
    </div>
  );
}
