import { Component, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  CounterBookingSearchParams,
  CounterBookingSearchResultDto,
  StaffApiService,
} from '../../../../services/staff/staff-api.service';
import { extractApiErrorCode } from '../../../../shared/lib/api-error-code';
import { CounterCancelSearchEvent, CounterCancelSearchMode } from './counter-cancel-search-form/counter-cancel-search-form.component';

const PAGE_SIZE = 20;

/**
 * OBRS-766 — smart page for `/staff/cancel-booking`. Owns the active search
 * mode/query, the result page, the selected booking, and `isSearching`.
 * Component-local state only, no NgRx (this is an isolated new staff page
 * with nothing to plug into — same reasoning `OverrideCancelModalComponent`
 * already established for its own component-local state).
 *
 * Single title surface: `titleKey`/`subtitleKey` on the route (staff.module.ts)
 * render via the shell topbar — this component renders neither (design-system §7).
 */
@Component({
  selector: 'app-counter-cancel-page',
  templateUrl: './counter-cancel-page.component.html',
  styleUrl: './counter-cancel-page.component.scss',
})
export class CounterCancelPageComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  protected searchMode: CounterCancelSearchMode = 'phone';
  protected searchValue = '';
  protected results: CounterBookingSearchResultDto[] = [];
  protected currentPage = 1;
  protected totalPages = 0;
  protected isSearching = false;
  protected hasSearched = false;
  protected searchErrorMessage = '';

  protected selectedBooking: CounterBookingSearchResultDto | null = null;
  protected isModalOpen = false;

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly translate: TranslateService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSearch(event: CounterCancelSearchEvent): void {
    this.searchMode = event.mode;
    this.searchValue = event.value;
    this.currentPage = 1;
    this.hasSearched = true;
    this.fetchResults();
  }

  protected onPageChange(page: number): void {
    if (page < 1 || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
    this.fetchResults();
  }

  protected onSelectBooking(booking: CounterBookingSearchResultDto): void {
    // Modals/overlays must open optimistically — flip the flag synchronously,
    // the row already in hand renders the summary (design-system §6).
    this.selectedBooking = booking;
    this.isModalOpen = true;
  }

  protected onModalClosed(): void {
    this.isModalOpen = false;
  }

  protected onModalCancelled(): void {
    this.isModalOpen = false;
    // Re-run the search so the row reflects its true post-cancel state (UX spec).
    this.fetchResults();
  }

  private fetchResults(): void {
    this.isSearching = true;
    this.searchErrorMessage = '';

    const params: CounterBookingSearchParams = {
      page: this.currentPage - 1,
      size: PAGE_SIZE,
      ...(this.searchMode === 'phone'
        ? { phone: this.searchValue }
        : { bookingNumber: this.searchValue }),
    };

    this.staffApiService
      .searchBookings(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const page = response.data;
          this.results = page?.content ?? [];
          this.currentPage = (page?.number ?? 0) + 1;
          this.totalPages = page?.totalPages ?? 0;
          this.isSearching = false;
        },
        error: (error) => {
          this.isSearching = false;
          this.results = [];
          this.totalPages = 0;
          const code = extractApiErrorCode(error, null);
          this.searchErrorMessage =
            code === 'booking.search.error.criteria-required'
              ? this.translate.instant('STAFF.CANCEL_BOOKING.SEARCH.CRITERIA_REQUIRED')
              : this.translate.instant('STAFF.CANCEL_BOOKING.SEARCH.LOAD_FAILED');
        },
      });
  }
}
