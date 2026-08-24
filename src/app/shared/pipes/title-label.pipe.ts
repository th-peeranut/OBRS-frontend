import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { TITLE_OPTIONS } from '../constants/title-options';

const TITLE_CODES = new Set(TITLE_OPTIONS.map((option) => option.code));

/**
 * OBRS-1232 — renders a PERSISTED title code (`MISS`) as the word for the active language
 * (`นางสาว` / `Miss` / `小姐`), the same FE-takeover pattern as role slug (OBRS-330) and status
 * code (OBRS-353).
 *
 * A value that is not one of the nine codes is returned VERBATIM. That is the AC-5 case, not a
 * defensive guard: the admin and account forms were free text for months, so the column holds
 * strings the migration deliberately left alone (`คุณ`, a typo). Printing what the user typed beats
 * printing a missing translation key.
 *
 * `pure: false` on purpose. A pure pipe caches on its input, and the input here — the code — does
 * not change when the reader switches language, so the old word would stay on screen until the next
 * refetch. That is the exact defect family this card belongs to (OBRS-1096 / OBRS-1365). The work
 * per call is one Set lookup and one already-loaded translation read.
 */
@Pipe({
  name: 'titleLabel',
  standalone: true,
  pure: false,
})
export class TitleLabelPipe implements PipeTransform {
  constructor(private readonly translate: TranslateService) {}

  /**
   * With no `name`, returns the title on its own (dropdown options). With a `name`, returns the two
   * joined by a single space, skipping whichever is absent — so a passenger with no title never
   * renders with a leading space, and the composition rule lives in ONE place instead of at each of
   * the six surfaces that print a passenger's name. This mirrors the server's `TitleLabel.withTitle`
   * for the two outputs no client can translate (boarding manifest, payment e-mail).
   */
  transform(code: string | null | undefined, name?: string | null): string {
    const trimmed = (code ?? '').trim();
    const label = !trimmed
      ? ''
      : TITLE_CODES.has(trimmed)
        ? this.translate.instant(`COMMON.TITLES.${trimmed}`)
        : trimmed;

    if (name === undefined) return label;

    return [label, (name ?? '').trim()].filter((part) => !!part).join(' ');
  }
}
