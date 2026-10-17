import type { MessageKey, TranslateFn } from "./i18n";

/** An error whose student-facing text is a locale key, so lib code can fail without hardcoding a language. */
export class LocalizedError extends Error {
  readonly key: MessageKey;
  readonly params: Record<string, string | number>;

  constructor(english: string, key: MessageKey, params: Record<string, string | number> = {}) {
    super(english);
    this.name = "LocalizedError";
    this.key = key;
    this.params = params;
  }
}

/** The localized text for `err` when it knows its key, else its own message, else `fallback`. */
export function errorText(t: TranslateFn, err: unknown, fallback: string): string {
  if (err instanceof LocalizedError) return t(err.key, err.params);
  return err instanceof Error && err.message ? err.message : fallback;
}
