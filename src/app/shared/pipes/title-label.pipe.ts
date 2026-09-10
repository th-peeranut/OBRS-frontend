import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { TITLE_OPTIONS } from '../constants/title-options';

const TITLE_CODES = new Set(TITLE_OPTIONS.map((option) => option.code));

const THAI_SCRIPT_FIRST = /^[\u0E00-\u0E7F]/;

/**
 * OBRS-1644, mirroring the server's `TitleLabel.separator` (OBRS-1609): Thai writes the title
 * attached to the given name — `นางสาวกุลธิดา นาใจคง` — because in Thai the space belongs between
 * the given name and the surname, so a space after the title reads as a slip. BOTH sides have to
 * be Thai script for that to hold: a legacy free-text `Rev.` keeps its space, and so does a Thai
 * title in front of a Latin name (`นางสาว Passenger Name`), which is how Thai sets a Latin word
 * inside Thai text.
 *
 * The test is the SCRIPT, not the reader's language: the column holds legacy values typed in Thai
 * that no code matches, and those must attach exactly as the catalogue's own do — otherwise one
 * passenger list spells `คุณ` two ways.
 */
function separator(label: string, name: string): string {
  return THAI_SCRIPT_FIRST.test(label) && THAI_SCRIPT_FIRST.test(name) ? '' : ' ';
}

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
   * joined as that script joins them (see `separator`), skipping whichever is absent — so a
   * passenger with no title never renders with a leading space, and the composition rule lives in
   * ONE place instead of at each of the six surfaces that print a passenger's name. This mirrors
   * the server's `TitleLabel.withTitle` for the two outputs no client can translate (boarding
   * manifest, payment e-mail).
   *
   * It mirrors `withTitle` and NOT `TitleLabel.forGreeting`. The greeting method is the one that
   * supplies `คุณ` for a missing title and puts a Chinese honorific AFTER the name; it renders the
   * e-mail salutation only, and none of the surfaces here is a salutation.
   */
  transform(code: string | null | undefined, name?: string | null): string {
    const trimmed = (code ?? '').trim();
    const label = !trimmed
      ? ''
      : TITLE_CODES.has(trimmed)
        ? this.translate.instant(`COMMON.TITLES.${trimmed}`)
        : trimmed;

    if (name === undefined) return label;

    const safeName = (name ?? '').trim();
    if (!label || !safeName) return label || safeName;

    return label + separator(label, safeName) + safeName;
  }
}
