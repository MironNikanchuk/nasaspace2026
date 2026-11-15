import { numberLabel } from "@/lib/format";
import { useState } from "react";
import { BodyView } from "./body-view";
import { ViewMode, type SceneMode } from "./view-mode";
import { useLanguage } from "./language";
import type { CSSProperties } from "react";
import type { Position, Sample } from "@/lib/types";
import styles from "./visibility-overview.module.css";

function clearance(position: Position) {
  return position.elevation_deg - position.horizon_elevation_deg;
}

function verticalPosition(position: Position) {
  return 50 - Math.max(-1, Math.min(1, clearance(position) / 10)) * 19;
}

function Body({ name, position }: { name: "Sun" | "Earth"; position: Position }) {
  const { t } = useLanguage();
  const margin = clearance(position);
  const rounded = Number(margin.toFixed(2));
  const angle = `${rounded > 0 ? "+" : ""}${numberLabel(rounded)}°`;
  return <div className={name === "Sun" ? styles.sun : styles.earth}>
    <img className={styles.bodyPortrait} src={name === "Sun" ? "/media/visibility-sun.webp" : "/media/visibility-earth.webp"} width="384" height="384" alt="" />
    <div className={styles.bodyLabel}>
      <strong>{t(name)}</strong>
      <span><span className={styles.angle}>{angle}</span> · {t(position.above_horizon ? "Visible" : "Hidden")}</span>
    </div>
  </div>;
}

export function VisibilityOverview({ sample, site, view, select }: {
  sample: Sample; site: string; view: 0 | 1; select: (view: 0 | 1) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<SceneMode>("3d");
  const sunY = verticalPosition(sample.sun);
  const earthY = verticalPosition(sample.earth);
  const positions = { "--sun-y": `${sunY}%`, "--earth-y": `${earthY}%` } as CSSProperties;

  return <figure className={styles.overview} aria-labelledby="visibility-overview-title" style={positions}>
    <div className={styles.header}>
      <h3 id="visibility-overview-title">{t("Sun and Earth from the Moon")}</h3>
      <div className={styles.controls}><div className="segmented" role="group" aria-label={t("Overview scenario")}>
        <button type="button" aria-pressed={view === 0} onClick={() => select(0)}>{t("Scenario A")}</button>
        <button type="button" aria-pressed={view === 1} onClick={() => select(1)}>{t("Scenario B")}</button>
      </div><ViewMode mode={mode} onChange={setMode} /></div>
    </div>
    <div className={styles.scene}>{mode === "3d" ? <BodyView sample={sample} site={site} /> : <>
      <svg className={styles.rays} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line className={styles.horizon} x1="0" x2="100" y1="50" y2="50" />
        <line className={styles.sunRay} x1="16" y1={sunY} x2="50" y2="50" data-visible={sample.sun.above_horizon} />
        <line className={styles.earthRay} x1="50" y1="50" x2="84" y2={earthY} data-visible={sample.earth.above_horizon} />
      </svg>
      <Body name="Sun" position={sample.sun} />
      <div className={styles.moon}>
        <img className={styles.bodyPortrait} src="/media/moon-poster.webp" width="720" height="720" alt="" />
        <div className={styles.bodyLabel}><strong>{t("Moon")}</strong><span>{site}</span></div>
      </div>
      <Body name="Earth" position={sample.earth} />
      </>}
    </div>
    <figcaption>{t("Angles are relative to the local horizon. Bodies and distances are not to scale.")} <span>{t("Left and right are schematic. Azimuth clockwise from north:")} {t("Sun")} {numberLabel(sample.sun.azimuth_deg, 1)}° · {t("Earth")} {numberLabel(sample.earth.azimuth_deg, 1)}°</span></figcaption>
  </figure>;
}
