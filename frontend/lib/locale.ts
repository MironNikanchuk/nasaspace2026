export const languages = { en: "English", ru: "Русский", uz: "O‘zbekcha" } as const;
export type Language = keyof typeof languages;
export type Translate = (text: string) => string;
