import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** OBRS-1967: a stop name per locale, as the manifest payload carries it. */
export type StopLabels = Record<string, string> | null | undefined;

/**
 * OBRS-1967: the name to print for a stop, `locale` -> `en` -> the slug — the same ladder the
 * server walks in `StopDtoService#labelOrSlug`, over a bag the server has already resolved per
 * locale (so the operator overlay OBRS-1679 allows is settled before it reaches us; there is no
 * choice left to make here).
 *
 * The slug is the LAST resort, not a bug: it is what a stop with no translation row has always
 * rendered as, and printing `nong_chak` beats printing a blank cell on a driver-facing list.
 */
export function resolveStopLabel(
  labels: StopLabels,
  slug: string | null | undefined,
  locale: string | null | undefined
): string {
  const fallback = slug ?? '';
  if (!labels) {
    return fallback;
  }
  return (locale ? labels[locale] : undefined) ?? labels['en'] ?? fallback;
}

/**
 * OBRS-1967 — renders the localized stop name the manifest payload carries, keyed by the active
 * language, with the stop SLUG as the fallback. Same FE-takeover shape as `titleLabel`
 * (OBRS-1232): the row keeps carrying the key (`fromStop`, which groups the table, feeds the stop
 * filter and is what the backend ordered by) and the template renders the name beside it.
 *
 * `pure: false` for the reason spelled out on `TitleLabelPipe`: the input — the labels bag — does
 * not change when the reader switches language, so a pure pipe would hold yesterday's word on
 * screen until the next refetch. The work per call is two property reads.
 */
@Pipe({
  name: 'stopLabel',
  standalone: true,
  pure: false,
})
export class StopLabelPipe implements PipeTransform {
  constructor(private readonly translate: TranslateService) {}

  transform(labels: StopLabels, slug: string | null | undefined): string {
    return resolveStopLabel(labels, slug, this.translate.currentLang);
  }
}
