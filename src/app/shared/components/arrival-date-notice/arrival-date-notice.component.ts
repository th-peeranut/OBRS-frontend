import { Component, Input, OnChanges } from '@angular/core';
import { arrivalDateWhenDayDiffers } from '../../lib/trip-format';

/**
 * OBRS-861 — the "this bus gets in on a different day" line that sits under a
 * trip's ARRIVAL time.
 *
 * It renders nothing at all for a trip that arrives on the day it left, which is
 * almost every trip, so an ordinary row keeps its exact previous markup (AC4).
 * The overnight case it exists for was showing a bare `05:30`: a customer reads
 * that as the date they picked in the search form and plans a day early.
 *
 * Owner picked the full date over an airline-style `+1` badge (2026-08-21) on
 * two grounds that were measured rather than assumed: Nakhonchai Air's own
 * booking page prints `วันที่ถึง : DD/MM/YYYY`, so Thai coach passengers already
 * read this shape; and the delay disclosure a few pixels away on the same card
 * already says `ออกเดินทางวันที่ {{date}}` (OBRS-1141), so a `+1` here would put
 * two different dialects on one row.
 *
 * Lives in `shared/` because four surfaces render the same trip — search
 * results, review, passenger-info and payment — each for both legs of a return
 * booking.
 */
@Component({
  selector: 'app-arrival-date-notice',
  templateUrl: './arrival-date-notice.component.html',
  styleUrl: './arrival-date-notice.component.scss',
  standalone: false,
})
export class ArrivalDateNoticeComponent implements OnChanges {
  /** The trip's departure — the day the arrival is compared against. */
  @Input() departureDateTime: string | null | undefined;

  /** The trip's arrival. Its date is what gets shown, when it differs. */
  @Input() arrivalDateTime: string | null | undefined;

  /** `DD/MM/YYYY`, or `null` for the same-day case — see `arrivalDateWhenDayDiffers`. */
  arrivalDate: string | null = null;

  ngOnChanges(): void {
    this.arrivalDate = arrivalDateWhenDayDiffers(
      this.departureDateTime,
      this.arrivalDateTime
    );
  }
}
