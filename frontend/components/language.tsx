"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { languages, type Language, type Translate } from "@/lib/locale";
import { MaterialSymbol } from "./material-symbol";
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
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    selected.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  const description = t("Language");
  const currentLanguage = languages[language];
  return <div className="language-picker" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); close(); }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".language-option") ?? []);
    const index = options.findIndex((option) => option === document.activeElement);
    options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
  }}>
    <button ref={trigger} type="button" className="language-trigger" aria-label={description}
      title={`${description}: ${currentLanguage}`} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)}>
      <MaterialSymbol name="language" />
      <span>{language.toUpperCase()}</span>
      <MaterialSymbol name="expand_more" size={14} />
    </button>
    <div id={id} className="language-panel" role="group" aria-label={description} hidden={!open}>
      {(Object.keys(languages) as Language[]).map((code) => <button className="language-option" key={code}
        type="button" ref={code === language ? selected : undefined} aria-pressed={code === language}
        onClick={() => { choose(code); close(); }}>
        <span className="language-code" aria-hidden="true">{code.toUpperCase()}</span>
        <span lang={code}>{languages[code]}</span>
        {code === language && <MaterialSymbol name="check" size={16} />}
      </button>)}
    </div>
  </div>;
}
