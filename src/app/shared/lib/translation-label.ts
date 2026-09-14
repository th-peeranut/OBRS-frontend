/**
 * Resolves the label of a translation-backed option (stations, lookups) for one locale.
 *
 * <p>Accepts both shapes the catalog endpoints return - a `[{ locale, label }]` list or a
 * `{ th: { label }, en: { label } }` map - and falls back to the first entry that carries any
 * label at all, so a row missing the requested locale still renders something rather than blank.
 * Returns `null` (not `''`) when nothing usable is present so callers can chain `??` onto their
 * next fallback (`option.label ?? option.name ?? …`).
 *
 * <p>Extracted from the byte-identical private copies `dropdown-obrs` and `dropdown-group-obrs`
 * carried; the input stays `unknown` on purpose because the option lists those two components
 * take are still untyped, but the internals no longer need `any`.
 */

interface TranslationEntry {
  locale?: string | null;
  label?: string | null;
}

function asEntry(value: unknown): TranslationEntry | null {
  return value !== null && typeof value === 'object' ? (value as TranslationEntry) : null;
}

export function translationLabel(translations: unknown, locale: string): string | null {
  if (!translations || typeof translations !== 'object') {
    return null;
  }

  if (Array.isArray(translations)) {
    const entries = translations.map(asEntry);
    const matched = entries.find((item) => String(item?.locale ?? '').toLowerCase() === locale);

    return matched?.label ?? entries.find((item) => item?.label)?.label ?? null;
  }

  const translationMap = translations as Record<string, unknown>;
  return (
    asEntry(translationMap[locale])?.label ??
    Object.values(translationMap)
      .map(asEntry)
      .find((item) => item?.label)?.label ??
    null
  );
}
