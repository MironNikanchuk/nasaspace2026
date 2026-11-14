"use client";

import { Shell } from "@/components/shell";
import { useLanguage } from "@/components/language";

const github = "https://github.com/MironNikanchuk/nasaspace2026";
const resources = [
  ["Frontend", github + "/tree/main/frontend"],
  ["FastAPI backend", github + "/tree/main/backend"],
  ["Database migrations", github + "/tree/main/supabase"],
  ["Documentation", github + "#readme"],
  ["Voiceover script", github + "/blob/main/docs/voiceover.md"],
  ["JPL Horizons", "https://ssd.jpl.nasa.gov/horizons/"],
  ["LOLA elevation data", "https://pgda.gsfc.nasa.gov/products/90"],
  ["NASA Moon model", "https://solarsystem.nasa.gov/gltf_embed/2366/"],
  ["NASA Earth model", "https://solarsystem.nasa.gov/gltf_embed/2393/"],
  ["NASA Solar Dynamics Observatory", "https://svs.gsfc.nasa.gov/14709/"],
  ["NASA VIIRS Earth", "https://science.nasa.gov/photojournal/earth/"],
  ["NASA Deep Star Maps", "https://svs.gsfc.nasa.gov/4851/"],
  ["B612 / B612 Mono", "https://fonts.google.com/specimen/B612"],
];

export default function Sources() {
  const { t } = useLanguage();
  return <Shell current="sources" title="Sources">
    <div className="workspace-heading"><h1>{t("Sources")}</h1></div>
    <section className="sources-content">
      <a className="repo-card" href={github}>
        <img src="/media/github-dark.svg" alt="" width="26" height="26" />
        <div><strong>{t("GitHub repository")}</strong><p>{t("Code, datasets and documentation")}</p></div>
        <span aria-hidden="true">↗</span>
      </a>
      <ul>{resources.map(([name, url]) => <li key={url}><a href={url}>{t(name)} <span aria-hidden="true">↗</span></a></li>)}</ul>
    </section>
  </Shell>;
}
