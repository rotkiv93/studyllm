import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { es } from "./locales/es";
import { en } from "./locales/en";

export type Lang = "es" | "en";

/** localStorage key that persists the user's chosen UI language across launches. */
const STORAGE_KEY = "studyllm.lang";

/** Spanish is the source-of-truth dictionary; every key that exists in `es` should exist in `en`. */
export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;

const dictionaries: Record<Lang, Messages> = { es, en };

/** Human-readable label for the language picker. */
export const LANGUAGE_LABELS: Record<Lang, string> = {
  es: "Español",
  en: "English",
};

/** Reads the persisted language, defaulting to Spanish (project requirement). */
export function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return "es";
}

/** Replaces `{name}` placeholders in a template with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

export type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failure */
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const dict = dictionaries[lang];
      const template = (dict[key] ?? es[key] ?? key) as string;
      return interpolate(template, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

/** Convenience hook when a component only needs the translate function. */
export function useT(): TranslateFn {
  return useI18n().t;
}
