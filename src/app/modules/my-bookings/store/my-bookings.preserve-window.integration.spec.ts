import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore, Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';

import { MyBookingsEffect } from './my-bookings.effect';
import { myBookingsReducer } from './my-bookings.reducer';
import { MY_BOOKINGS_FEATURE_KEY } from './my-bookings.selector';
import {
  invokeLoadMoreMyBookingsApi,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiSuccess,
} from './my-bookings.action';
import { AlertService } from '../../../shared/services/alert.service';

/**
 * OBRS-577 Scrutinize round 2 — the ONLY test in this module that wires the
 * REAL store + REAL reducer + REAL effect together, with no `overrideSelector`
 * anywhere. Every other spec in this directory uses `provideMockStore` and
 * `store.overrideSelector(selectMyBookings, { pagesLoaded: 5, ... })`, which
 * hard-wires the selector's return value and divorces it from whatever the
 * reducer actually wrote — exactly the property that let round 1's
 * regression (an unconditional `pagesLoaded: 0`/`totalPages: 0` reset on
 * EVERY `invokeLoadMyBookingsApi`, including `preserveWindow: true`) ship
 * with a fully green suite. NgRx runs the reducer for an action before any
 * effect observes that same action (`this.next(state)` then
 * `scannedActions.next(action)`, `@ngrx/store/fesm2022/ngrx-store.mjs`), so
 * only a real store reproduces "does the effect read what the reducer JUST
 * wrote for this exact dispatch" — a mocked selector cannot, by
 * construction, ever disagree with itself.
 */
describe('MyBookingsEffect + myBookingsReducer — REAL store/effect wiring (OBRS-577 regression pin)', () => {
  let store: Store;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore(),
        provideState(MY_BOOKINGS_FEATURE_KEY, myBookingsReducer),
        provideEffects([MyBookingsEffect]),
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error', 'info', 'confirm']),
        },
      ],
    }).compileComponents();

    store = TestBed.inject(Store);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('a preserveWindow:true mutation-reload after 5 REAL pages requests size=100, not size=20', () => {
    // Seed "5 pages (100 rows) already loaded" through the REAL success
    // action + REAL reducer — not a hand-built state object — so
    // `pagesLoaded` is derived exactly the way the app derives it.
    const bookings = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    store.dispatch(invokeLoadMyBookingsApiSuccess({ bookings, totalElements: 137, totalPages: 7 }));

    // A mutation reload (cancel/reschedule/change-seat/change-stop
    // settle/abandon) dispatches exactly this shape.
    store.dispatch(invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true }));

    const req = httpMock.expectOne((r) => r.url.includes('/api/private/bookings/me'));
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('100');
    req.flush({
      code: 200,
      message: 'OK',
      data: { content: [], totalElements: 137, totalPages: 7 },
    });
  });

  it('a NON-preserveWindow reload (status switch/Retry) still requests the plain default size=20 — the reset half of the fix stays correct', () => {
    const bookings = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    store.dispatch(invokeLoadMyBookingsApiSuccess({ bookings, totalElements: 137, totalPages: 7 }));

    store.dispatch(invokeLoadMyBookingsApi({ status: null }));

    const req = httpMock.expectOne((r) => r.url.includes('/api/private/bookings/me'));
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({
      code: 200,
      message: 'OK',
      data: { content: [], totalElements: 0, totalPages: 0 },
    });
  });

  /**
   * OBRS-577 Scrutinize round 3 — the QA agent verified this exact click
   * live on SIT and measured `requests during click: []`. Root cause:
   * `loadMoreMyBookings$`'s `filter` read `!state.loadingMore`, but
   * `invokeLoadMoreMyBookingsApi`'s OWN reducer case sets `loadingMore: true`
   * — and NgRx runs the reducer for an action before any effect observes
   * that SAME action, so the filter always sampled `loadingMore: true` and
   * rejected every dispatch, forever. Every unit test in
   * `my-bookings.effect.spec.ts` used `overrideSelector` to hand-set
   * `loadingMore: false`, which a real reducer→effect dispatch can never
   * produce for this action — structurally blind to this class of bug. Only
   * a real store, with no override anywhere, can see it.
   */
  it('clicking Load more after a real 1-page load fires page=1&size=20 (the click that measured ZERO requests live on SIT)', () => {
    // Seed "1 page (20 rows) already loaded (pagesLoaded=1, 0-indexed page
    // 0), more remain" through the REAL success action + REAL reducer — the
    // ordinary first-load state a traveler is in the instant the Load-more
    // button first appears.
    const bookings = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));
    store.dispatch(invokeLoadMyBookingsApiSuccess({ bookings, totalElements: 137, totalPages: 7 }));

    // The click.
    store.dispatch(invokeLoadMoreMyBookingsApi());

    const req = httpMock.expectOne((r) => r.url.includes('/api/private/bookings/me'));
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({
      code: 200,
      message: 'OK',
      data: { content: [], totalElements: 137, totalPages: 7 },
    });
  });
});
