import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";

const team = [
  ["MN", "Miron Nikanchuk"], ["TR", "Topuzov Ruslan"],
  ["BS", "Bekturov Shoxruz"], ["AA", "Alixonov Amirxon"],
];

export default function Landing() {
  return <div className="landing">
    <header className="landing-nav wrap">
      <Brand />
      <nav aria-label="Main navigation">
        <a href="#method">Method</a>
        <Link href="/atlas">3D atlas</Link>
        <a href="#team">Team</a>
      </nav>
      <Link className="button nav-launch" href="/workspace">Open workspace <Icon name="arrow-top-right" width={16} /></Link>
    </header>

    <main>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
          <div className="moon-photo">
            <Image src="/media/moon.jpg" alt="" fill priority sizes="(max-width: 800px) 85vw, 660px" />
          </div>
          <span className="moon-indicator"><i /> Lunar south pole</span>
        </div>
        <div className="hero-copy">
          <div className="eyebrow"><span /> NASA SPACE APPS CHALLENGE 2026</div>
          <h1 id="hero-title">Find your window<br />on the Moon<span>.</span></h1>
          <p>Compare lunar landing sites by sunlight and direct line of sight to Earth. See what changes when you move the landing date or account for terrain.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/workspace">Compare landing sites <Icon name="arrow-right" width={18} /></Link>
            <Link className="button button-secondary" href="/atlas">Explore the atlas</Link>
          </div>
        </div>
        <div className="hero-footer">
          <span><i /> LUNAR LANDING SITE NAVIGATOR</span>
          <span>NASA / JPL HORIZONS · LRO LOLA</span>
          <a href="https://svs.gsfc.nasa.gov/5605/">Moon image by NASA SVS <Icon name="arrow-top-right" width={14} /></a>
        </div>
      </section>

      <section className="landing-section wrap" id="method">
        <div className="section-intro">
          <p className="eyebrow"><span /> THE METHOD</p>
          <h2>Same site. Different horizon.</h2>
          <p>At Connecting Ridge, nearby terrain reduces the estimated time with Earth above the horizon from <strong>40.76%</strong> to <strong>28.31%</strong> during the same seven-day window.</p>
          <Link className="text-link" href="/workspace?preset=terrain-impact">Run this comparison <Icon name="arrow-right" width={18} /></Link>
        </div>
        <figure className="method-figure">
          <Image src="/media/lunar-horizon.jpg" alt="Earth above a modeled lunar south-pole horizon" width={1024} height={576} />
          <figcaption>South-pole visualization by NASA SVS. <a href="https://svs.gsfc.nasa.gov/5228/">Image source</a></figcaption>
        </figure>
      </section>

      <section className="team-section wrap" id="team">
        <div>
          <p className="eyebrow"><span /> THE TEAM</p>
          <h2>GameOver</h2>
          <p>Built for the Lunar Landing Site Navigator challenge.</p>
        </div>
        <ul className="team-list">{team.map(([initials, name]) =>
          <li key={name}><span>{initials}</span>{name}</li>)}</ul>
      </section>
    </main>

    <footer className="landing-footer wrap">
      <Brand small />
      <div><Link href="/workspace">Workspace</Link><Link href="/atlas">NASA 3D models</Link><Link href="/account">Account</Link></div>
      <span>GameOver · 2026</span>
    </footer>
  </div>;
}
