import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { ChangeSeatDialogComponent } from './change-seat-dialog.component';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';
import { closeChangeSeatDialog } from '../../store/my-bookings.action';

/**
 * Renders the dialog's ERROR step for real (the logic-level spec next door
 * instantiates the component directly and never touches the template), so
 * "the Retry button is not in the DOM" is asserted against the DOM and not
 * against a component flag.
 *
 * OBRS-1489: a terminal availability rejection (`open-seating` / `max-count`
 * / `window-closed`) returns the same 400 on every retry, so offering Retry
 * hands the traveler the one action on screen that can never succeed.
 */
describe('ChangeSeatDialogComponent (error step — OBRS-1489)', () => {
  let fixture: ComponentFixture<ChangeSeatDialogComponent>;
  let store: MockStore;

  function buildState(overrides: Partial<MyBookingsState> = {}): MyBookingsState {
    return { ...initialMyBookingsState, changeSeatDialogBookingId: 5, ...overrides };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [ChangeSeatDialogComponent],
      providers: [provideMockStore({ initialState: { myBookings: buildState() } })],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(ChangeSeatDialogComponent);
    fixture.componentInstance.bookingId = 5;
    fixture.detectChanges();
  });

  function failWith(errorCode: string): void {
    store.setState({
      myBookings: buildState({
        changeSeatAvailabilityLoading: false,
        changeSeatAvailabilityError: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.OPEN_SEATING',
        changeSeatAvailabilityErrorCode: errorCode,
      }),
    });
    fixture.detectChanges();
  }

  function errorStepButtons(): HTMLButtonElement[] {
    return fixture.debugElement
      .queryAll(By.css('.change-seat-step--error button'))
      .map((debugEl) => debugEl.nativeElement as HTMLButtonElement);
  }

  it('offers NO Retry button when the availability rejection is terminal — only a Close that closes the dialog', () => {
    failWith('CHANGE_SEAT_ERROR_OPEN_SEATING');

    const labels = errorStepButtons().map((button) => button.textContent?.trim());
    expect(labels).not.toContain('MY_BOOKINGS.RETRY');
    expect(labels).toContain('COMMON.CLOSE');

    const dispatch = spyOn(store, 'dispatch');
    errorStepButtons()[0].click();
    expect(dispatch).toHaveBeenCalledWith(closeChangeSeatDialog());
  });

  it('still offers Retry when the rejection is NOT terminal — a transient failure is retryable (OBRS-170)', () => {
    failWith('GENERIC');

    const labels = errorStepButtons().map((button) => button.textContent?.trim());
    expect(labels).toContain('MY_BOOKINGS.RETRY');
    expect(labels).not.toContain('COMMON.CLOSE');
  });
});
