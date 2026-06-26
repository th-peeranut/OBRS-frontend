import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
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
  @Input() canManageSchedules: boolean = false;

  @Output() dateChanged = new EventEmitter<Date>();
  @Output() tripSelected = new EventEmitter<WalkInTripSelection>();
  @Output() addScheduleClicked = new EventEmitter<void>();
  @Output() addScheduleForRouteClicked = new EventEmitter<{ routeSlug: string; date: Date }>();
  @Output() editScheduleClicked = new EventEmitter<{ trip: WalkInTripDto; routeSlug: string }>();
  @Output() deleteScheduleClicked = new EventEmitter<{ trip: WalkInTripDto; routeSlug: string }>();

  @ViewChild('tripActionMenu') protected tripActionMenu!: Menu;

  protected tripActionMenuItems: MenuItem[] = [];
  protected lastTripMenuTrigger: HTMLButtonElement | null = null;

  protected selectedDate: Date = new Date();
  protected readonly today: Date = new Date();

  constructor(private readonly translate: TranslateService) {}

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

  protected onAddSchedule(e: Event): void {
    e.stopPropagation();
    this.addScheduleClicked.emit();
  }

  protected onAddForRoute(e: Event, routeSlug: string): void {
    e.stopPropagation();
    this.addScheduleForRouteClicked.emit({ routeSlug, date: this.selectedDate });
  }

  protected openTripMenu(e: Event, trip: WalkInTripDto, routeSlug: string): void {
    e.stopPropagation();
    this.tripActionMenuItems = [
      {
        label: this.translate.instant('STAFF.SELL.SCHEDULE_EDIT_ITEM'),
        command: () => this.editScheduleClicked.emit({ trip, routeSlug }),
      },
      {
        label: this.translate.instant('STAFF.SELL.SCHEDULE_DELETE_ITEM'),
        styleClass: 'text-danger',
        command: () => this.deleteScheduleClicked.emit({ trip, routeSlug }),
      },
    ];
    this.lastTripMenuTrigger = e.currentTarget as HTMLButtonElement;
    this.tripActionMenu.toggle(e);
  }

  protected onTripMenuHide(): void {
    this.lastTripMenuTrigger?.focus();
    this.lastTripMenuTrigger = null;
  }
}
