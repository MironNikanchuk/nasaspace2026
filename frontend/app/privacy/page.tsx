import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return <main className="app-main privacy-page">
    <Link className="text-link" href="/">MoonSight</Link>
    <h1>Privacy</h1>
    <section>
      <h2>Guest use</h2>
      <p>You can compare landing sites without signing in. Guest scenarios are stored in your browser. Clearing MoonSight site data removes them.</p>
    </section>
    <section>
      <h2>Accounts</h2>
      <p>If you sign in with Google, Supabase Auth receives your Google account identifier, email address, and basic profile information to create and identify your MoonSight account. MoonSight displays your email on the Account page. Supabase stores the scenarios you save while signed in and restricts access to your account.</p>
      <p>MoonSight requests basic sign-in information from Google. You can revoke app access from your Google account settings and remove saved scenarios on the Saved page.</p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>For privacy questions or to request account deletion, use the support contact shown on the Google consent screen.</p>
    </section>
  </main>;
}
