"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { languages, type Language, type Translate } from "@/lib/locale";
import { messages } from "@/lib/messages";

const LanguageContext = createContext<{ language: Language; t: Translate; choose: (value: Language) => void }>({
  language: "en", t: (text) => text, choose: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("moonsight-language"); } catch { /* Storage can be blocked. */ }
    if (saved === "en" || saved === "ru" || saved === "uz") {
      setLanguage(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  function choose(value: Language) {
    document.documentElement.lang = value;
    try { localStorage.setItem("moonsight-language", value); } catch { /* Keep the current selection. */ }
    setLanguage(value);
  }

  const t: Translate = (text) => language === "en" ? text : messages[text]?.[language === "ru" ? 0 : 1] ?? text;
  return <LanguageContext.Provider value={{ language, t, choose }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageSelect() {
  const { language, t, choose } = useLanguage();
  return <select className="language-select" aria-label={t("Language")} value={language}
    onChange={(event) => choose(event.target.value as Language)}>
    {Object.entries(languages).map(([code, name]) => <option key={code} value={code} label={code.toUpperCase()}>{name}</option>)}
  </select>;
}
