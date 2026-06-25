import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WalkInRouteGroupDto, WalkInTripDto } from '../../../../services/staff/staff-api.service';
import dayjs from 'dayjs';

/** A selected trip carries its owning route slug so the sell page can fetch the
 *  route's stop pairs (pickup/drop-off + segment fares). */
export interface WalkInTripSelection {
  trip: WalkInTripDto;
  routeSlug: string;
}

@Component({
  selector: 'app-walk-in-trip-browser',
  templateUrl: './walk-in-trip-browser.component.html',
  styleUrl: './walk-in-trip-browser.component.scss',
})
export class WalkInTripBrowserComponent {
  @Input() isLoading = false;
  @Input() routeGroups: WalkInRouteGroupDto[] = [];
  @Input() selectedTripId: number | null = null;

  @Output() dateChanged = new EventEmitter<Date>();
  @Output() tripSelected = new EventEmitter<WalkInTripSelection>();

  protected selectedDate: Date = new Date();
  protected readonly today: Date = new Date();

  protected onDateChange(value: Date | null): void {
    if (value) {
      this.dateChanged.emit(value);
    }
  }

  protected selectTrip(trip: WalkInTripDto, routeSlug: string): void {
    this.tripSelected.emit({ trip, routeSlug });
  }

  protected formatTime(dateTime: string): string {
    return dayjs(dateTime).format('HH:mm');
  }

  protected get sortedGroups(): WalkInRouteGroupDto[] {
    return this.routeGroups.map(group => ({
      ...group,
      trips: [...group.trips].sort((a, b) =>
        a.departureDateTime.localeCompare(b.departureDateTime)
      ),
    }));
  }
}
