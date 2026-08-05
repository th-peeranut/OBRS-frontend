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

/** OBRS-1050: route groups the seller has collapsed, remembered across reloads.
 *  Versioned like the other obrs.* keys so a future shape change can be ignored
 *  rather than mis-read. */
export const SELL_COLLAPSED_ROUTE_GROUPS_KEY = 'obrs.staff.sellCollapsedRouteGroups.v1';

@Component({
    selector: 'app-walk-in-trip-browser',
    templateUrl: './walk-in-trip-browser.component.html',
    styleUrl: './walk-in-trip-browser.component.scss',
    standalone: false
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

  /** OBRS-1050: route slugs whose trip rows are hidden. Keyed by SLUG, never by the
   *  group object — `sortedGroups` below rebuilds every group object on each read
   *  (see the OBRS-919 note in the template), so an object key would be a new object
   *  every change-detection pass and match nothing. */
  private collapsedSlugs: Set<string> = readCollapsedRouteGroups();

  constructor(private readonly translate: TranslateService) {}

  protected isCollapsed(routeSlug: string): boolean {
    return this.collapsedSlugs.has(routeSlug);
  }

  /**
   * Collapsing is purely what the seller last asked for — a group holding the selected
   * trip is NOT force-expanded. That override was considered and dropped: a header that
   * silently springs back open reads as a broken click, and the selected trip's details
   * stay on screen in the centre panel either way, so nothing is actually lost from view.
   */
  protected toggleGroup(routeSlug: string): void {
    if (this.collapsedSlugs.has(routeSlug)) {
      this.collapsedSlugs.delete(routeSlug);
    } else {
      this.collapsedSlugs.add(routeSlug);
    }
    writeCollapsedRouteGroups(this.collapsedSlugs);
  }

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

/** Read the remembered collapsed slugs. Any unreadable/wrong-shaped value is treated as
 *  "nothing collapsed" — the state is a convenience, never worth failing the panel over. */
function readCollapsedRouteGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(SELL_COLLAPSED_ROUTE_GROUPS_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set<string>();
  }
}

function writeCollapsedRouteGroups(slugs: Set<string>): void {
  try {
    localStorage.setItem(SELL_COLLAPSED_ROUTE_GROUPS_KEY, JSON.stringify([...slugs]));
  } catch {
    // localStorage unavailable/full (private mode, quota) — this session still holds the
    // state in memory; only the "remembered after reload" part is lost.
  }
}
