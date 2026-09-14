import { TestBed } from '@angular/core/testing';
import { PrimeNG, providePrimeNG } from 'primeng/config';
import { DatePicker } from 'primeng/datepicker';

import enI18n from '../../../../public/i18n/en.json';
import thI18n from '../../../../public/i18n/th.json';
import zhI18n from '../../../../public/i18n/zh.json';
import { withShortDayName } from './language.service';

/**
 * OBRS-1815 AC-3 — a date field that can be typed into must accept what a
 * person writes into it.
 *
 * PrimeNG resolves ONE format string for both directions (`getDateFormat()` =
 * `this.dateFormat || getTranslation('dateFormat')`, primeng 21.1.9
 * `primeng-datepicker.mjs:2820`). So `CALENDAR.dateFormat` is not a display
 * preference: it is the GRAMMAR every picker that lacks its own `[dateFormat]`
 * parses user input against. This spec is the gate on that, and it runs
 * against the SHIPPED locale files rather than a table copied out of them.
 *
 * The rule it enforces — no `D` in the grammar — is the one the app already
 * followed without stating: the only four pickers bound to the weekday-bearing
 * `calendarDateFormat()` are the same four carrying `[readonlyInput]="true"`,
 * which OBRS-1036 paid for after a customer typing `03/08/2026` watched the box
 * empty itself. `scripts/check-calendar-date-format.mjs` holds the other half
 * of the invariant, over the templates.
 */
describe('OBRS-1815 — CALENDAR.dateFormat is a grammar a person can type', () => {
  /** A Monday, so `D` has something non-trivial to render. */
  const DATE = new Date(2026, 7, 3);

  type Calendar = Record<string, unknown>;

  const SHIPPED: ReadonlyArray<readonly [string, Calendar]> = [
    ['th', (thI18n as { CALENDAR: Calendar }).CALENDAR],
    ['en', (enI18n as { CALENDAR: Calendar }).CALENDAR],
    ['zh', (zhI18n as { CALENDAR: Calendar }).CALENDAR],
  ];

  let picker: DatePicker;
  let config: PrimeNG;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [providePrimeNG({})] });
    config = TestBed.inject(PrimeNG);
    picker = TestBed.createComponent(DatePicker).componentInstance;
  });

  SHIPPED.forEach(([lang, calendar]) => {
    describe(lang, () => {
      let grammar: string;

      beforeEach(() => {
        config.setTranslation(calendar);
        grammar = calendar['dateFormat'] as string;
      });

      it('parses back the date it rendered', () => {
        const typed = picker.formatDate(DATE, grammar);

        // Vacuous-pass guard: parseDate returns null for '' without throwing.
        expect(typed.length).toBeGreaterThan(0);
        expect(picker.parseDate(typed, grammar)).toEqual(DATE);
      });

      it('carries no weekday token, because nobody types one', () => {
        expect(grammar).not.toContain('D');
      });

      it('would become untypeable if the weekday were added to it — the reason for the rule above', () => {
        // The negative control. `calendarDateFormat()` is this same grammar
        // plus `D`; binding it to a field a person can type into is the
        // OBRS-1036 defect, and this is that defect reproduced deliberately so
        // the rule is proven rather than asserted.
        const display = withShortDayName(grammar) as string;
        expect(display).toContain('D');

        const typed = picker.formatDate(DATE, grammar);
        expect(() => picker.parseDate(typed, display)).toThrow();
      });

      it('still round-trips the richer display format on a read-only field', () => {
        // The four `[readonlyInput]="true"` pickers get their value from the
        // calendar, never from the keyboard — but PrimeNG re-parses what is in
        // the box on blur, so the display format must survive its own output.
        const display = withShortDayName(grammar) as string;
        const shown = picker.formatDate(DATE, display);

        expect(shown.length).toBeGreaterThan(0);
        expect(picker.parseDate(shown, display)).toEqual(DATE);
      });
    });
  });
});
