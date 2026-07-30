import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
    selector: 'app-passenger-seat-box',
    templateUrl: './passenger-seat-box.component.html',
    styleUrl: './passenger-seat-box.component.scss',
    standalone: false
})
export class PassengerSeatBoxComponent implements OnChanges {
  @Input() label: string = '';
  @Input() isDisabled: boolean = false;
  @Input() gender: string = ''; // MALE, FEMALE, MONK, SELECTED, ORIGINAL
  /**
   * Owner badge for the collapsed shared seat map (OBRS-242): a short label
   * (e.g. passenger ordinal "1", "2") naming which passenger a seat belongs
   * to, shown as a corner badge alongside the gender icon. Null (the
   * default) renders no badge — every existing single-passenger call site
   * (change-seat dialog, walk-in, trip-details-edit) is unaffected.
   */
  @Input() ownerLabel: string | null = null;
  /**
   * Whether this seat belongs to the currently ACTIVE passenger in the
   * shared seat map, for a visual emphasis ring distinct from other owned
   * seats. False (the default) changes nothing for existing call sites.
   */
  @Input() isActiveOwner: boolean = false;
  /**
   * Seat-attribute badges (OBRS-362) — whether this specific seat is
   * wheelchair-accessible / has extra legroom, per the schedule's seat map.
   * Both false by default (every existing call site unaffected). Unlike the
   * owner/gender/original markers above, these render UNCONDITIONALLY (not
   * gated by `isDisabled`) — accessibility info is relevant even on an
   * already-taken seat.
   */
  @Input() hasWheelchairBadge: boolean = false;
  @Input() hasExtraLegroomBadge: boolean = false;
  /** Pre-translated aria-labels for the two badges above, sourced from the
   *  host (this component stays a dumb/presentational leaf with no
   *  TranslateModule dependency). */
  @Input() wheelchairBadgeAriaLabel: string = '';
  @Input() extraLegroomBadgeAriaLabel: string = '';

  @Output() passengerSeatOutput = new EventEmitter<string>();

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {}

  setPassengerSeatOuput(passengerSeat: string) {
    if (this.isDisabled) {
      return;
    }
    this.passengerSeatOutput.emit(passengerSeat);
  }
}
