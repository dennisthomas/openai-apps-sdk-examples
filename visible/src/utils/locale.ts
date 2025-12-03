/**
 * Locale Resolution Utility
 * 
 * Determines user's preferred language from document.documentElement.lang
 * Falls back to en-US if language not found in available messages.
 * 
 * Used for internationalization (i18n) in widgets.
 * Currently all content is English, but infrastructure supports multiple languages.
 * 
 * Usage:
 *   const messages = { 'en-US': {...}, 'es-ES': {...} };
 *   const locale = resolveLocale(messages); // Returns 'en-US' or 'es-ES'
 */

const DEFAULT_LOCALE = "en-US" as const;

function hasOwn<T extends Record<string, unknown>>(
  obj: T,
  key: PropertyKey
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function resolveLocale<T extends Record<string, unknown>>(messages: T): keyof T {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (lang && hasOwn(messages, lang)) {
      return lang;
    }
  }

  if (hasOwn(messages, DEFAULT_LOCALE)) {
    return DEFAULT_LOCALE as keyof T;
  }

  const [fallback] = Object.keys(messages);
  return (fallback ?? DEFAULT_LOCALE) as keyof T;
}

export const FALLBACK_LOCALE = DEFAULT_LOCALE;
