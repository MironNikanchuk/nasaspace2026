"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "./icon";

const models = {
  moon: { title: "Moon", url: "https://solarsystem.nasa.gov/gltf_embed/2366/" },
  earth: { title: "Earth", url: "https://solarsystem.nasa.gov/gltf_embed/2393/" },
};

export function Atlas() {
  const [body, setBody] = useState<keyof typeof models>("moon");
  const [loaded, setLoaded] = useState(false);
  const model = models[body];
  return <>
    <div className="workspace-heading"><div><h1>3D atlas</h1><p>Explore NASA’s interactive models of the Moon and Earth.</p></div></div>
    <section className="panel atlas-panel">
      <header><div className="segmented" aria-label="Celestial body">
        {(Object.keys(models) as (keyof typeof models)[]).map((key) => <button type="button" key={key}
          aria-pressed={body === key} onClick={() => setBody(key)}>{models[key].title}</button>)}
      </div><a className="button button-small" href={model.url} target="_blank" rel="noreferrer">Open on NASA <Icon name="arrow-top-right" /></a></header>
      {loaded ? <iframe key={body} title={`NASA 3D model of ${model.title}`} src={model.url} allow="fullscreen" allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-pointer-lock" referrerPolicy="no-referrer" /> :
        <div className="atlas-cover">
          <Image alt="" src={body === "moon" ? "/media/moon.jpg" : "/media/lunar-horizon.jpg"} fill sizes="80vw" />
          <div><h2>{model.title}</h2><button type="button" className="button button-primary" onClick={() => setLoaded(true)}>
            Load NASA 3D model <Icon name="arrow-right" /></button></div>
        </div>}
      <p>Interactive reference models from NASA Solar System Exploration.</p>
    </section>
  </>;
}
