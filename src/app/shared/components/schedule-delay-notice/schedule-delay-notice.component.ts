import { Component, Input, OnChanges } from '@angular/core';
import {
  DelayDisclosure,
  delayDisclosureOf,
} from '../../lib/schedule-delay-disclosure';

/**
 * OBRS-1141 — the "this round was announced as delayed" disclosure that sits
 * beside a schedule row's departure time.
 *
 * It renders the PLANNED departure and a delayed badge; the EFFECTIVE departure
 * stays where every surface already draws it, so this component is purely
 * additive and a non-delayed row keeps its exact previous markup (AC2 — the
 * whole component collapses to nothing when `scheduledDepartureDateTime` is
 * absent, which is every ordinary round).
 *
 * ⚠️ Deliberately says nothing about buying time. Online sale still closes at
 * `planned - booking_offset_minutes` (OBRS-1099 AC1/AC9): a delayed round
 * disappears from search at its ORIGINAL cutoff, not the new one. Copy here
 * must never imply "there's still time because the bus is late" (AC4).
 *
 * Lives in `shared/` because three surfaces render rows from the same backend
 * query — customer search (both legs), reschedule options, and the parcel
 * schedule picker's label.
 */
@Component({
  selector: 'app-schedule-delay-notice',
  templateUrl: './schedule-delay-notice.component.html',
  styleUrl: './schedule-delay-notice.component.scss',
  standalone: false,
})
export class ScheduleDelayNoticeComponent implements OnChanges {
  /** The row's effective departure — planned plus the announced delay. */
  @Input() departureDateTime: string | null | undefined;

  /**
   * The row's originally planned departure. Non-null ONLY when the round has an
   * announced delay, so its presence is itself the flag (OBRS-1099).
   */
  @Input() scheduledDepartureDateTime: string | null | undefined;

  disclosure: DelayDisclosure | null = null;

  ngOnChanges(): void {
    this.disclosure = delayDisclosureOf(
      this.departureDateTime,
      this.scheduledDepartureDateTime
    );
  }
}
