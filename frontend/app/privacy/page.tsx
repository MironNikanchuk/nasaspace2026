"use client";

import { LanguageSelect, useLanguage } from "@/components/language";
import Link from "next/link";

export default function Privacy() {
  const { t } = useLanguage();
  return <main className="app-main privacy-page">
    <Link className="text-link" href="/">MoonSight</Link> <LanguageSelect />
    <h1>{t("Privacy")}</h1>
    <section>
      <h2>{t("Browser storage")}</h2>
      <p>{t("Saved comparisons and language preferences stay in your browser. Clearing MoonSight site data removes them.")}</p>
    </section>
  </main>;
}
