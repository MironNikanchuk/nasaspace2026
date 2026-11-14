"use client";

import { LanguageSelect, useLanguage } from "@/components/language";
import Link from "next/link";

export default function Privacy() {
  const { t } = useLanguage();
  return <main className="app-main privacy-page">
    <Link className="text-link" href="/">MoonSight</Link> <LanguageSelect />
    <h1>{t("Privacy")}</h1>
    <section>
      <h2>{t("Guest use")}</h2>
      <p>{t("You can compare landing sites without signing in. Guest scenarios are stored in your browser. Clearing MoonSight site data removes them.")}</p>
    </section>
    <section>
      <h2>{t("Accounts")}</h2>
      <p>{t("Role and location are optional and saved with your account profile.")}</p>
      <p>{t("If you sign in with Google, Supabase Auth receives your Google account identifier, email address, and basic profile information to create and identify your MoonSight account. MoonSight displays your email on the Account page. Supabase stores the scenarios you save while signed in and restricts access to your account.")}</p>
      <p>{t("MoonSight requests basic sign-in information from Google. You can revoke app access from your Google account settings and remove saved scenarios on the Saved page.")}</p>
    </section>
    <section>
      <h2>{t("Contact")}</h2>
      <p>{t("For privacy questions or to request account deletion, use the support contact shown on the Google consent screen.")}</p>
    </section>
  </main>;
}
