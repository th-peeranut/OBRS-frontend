import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { AlertService } from '../../shared/services/alert.service';
import { ParcelMeDto } from '../../shared/interfaces/parcel.interface';
import { MyParcelsComponent } from './my-parcels.component';
import { invokeLoadMyParcelsApi } from './store/my-parcels.action';
import { initialMyParcelsState, MyParcelsState } from './store/my-parcels.model';
import { MY_PARCELS_FEATURE_KEY } from './store/my-parcels.selector';

/**
 * Scrutinize finding (2026-07-16): the previous version of this spec did
 * `.overrideComponent(MyParcelsComponent, { set: { template: '' } })`,
 * which blanks the template before any test runs — no binding was ever
 * exercised, so a `ParcelMeDto` field mismatch (the FE type had 6 required
 * fields the backend didn't send) rendered visibly broken (`- → -`, an
 * empty weight, the WRONG amount-paid/due label, and — worst — the
 * `CREATED_ACTION_HINT` that is this page's entire reason for existing
 * never rendering) while every test stayed green. This version renders the
 * REAL template via `TestBed.createComponent` + `fixture.detectChanges()`
 * and asserts against the rendered DOM, using a `ParcelMeDto` fixture
 * shaped exactly like the backend's `ParcelMineRespDto` (field-for-field,
 * see that interface's own doc comment). `<app-navbar>`/`<app-footer>` are
 * unknown elements under `NO_ERRORS_SCHEMA` (same pattern as
 * `my-bookings.component.*-dom.spec.ts`) so this doesn't need to stand up
 * the auth/footer dependency chain to render the page's own markup.
 */
describe('MyParcelsComponent (DOM rendering)', () => {
  let fixture: ComponentFixture<MyParcelsComponent>;
  let store: MockStore;
  let alertService: jasmine.SpyObj<AlertService>;

  function buildRow(overrides: Partial<ParcelMeDto> = {}): ParcelMeDto {
    return {
      parcelId: 1,
      trackingNumber: 'PCL0000001',
      bookingId: 10,
      bookingNumber: 'BK0000001',
      amount: 120,
      deliveryStatus: 'created',
      bookingStatus: 'confirmed',
      collectionCode: null,
      recipientName: 'Somchai Jaidee',
      pickupStop: { slug: 'nong_chak', name: 'Nong Chak' },
      dropoffStop: { slug: 'bts_mo_chit', name: 'BTS Mo Chit' },
      departureDateTime: '2026-08-01T08:00:00+07:00',
      weightKg: 5.5,
      expiresAt: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    alertService = jasmine.createSpyObj('AlertService', ['toast']);

    await TestBed.configureTestingModule({
      declarations: [MyParcelsComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore({
          initialState: { [MY_PARCELS_FEATURE_KEY]: initialMyParcelsState },
        }),
        { provide: AlertService, useValue: alertService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(MockStore);
  });

  function renderWithState(state: Partial<MyParcelsState>): void {
    store.setState({ [MY_PARCELS_FEATURE_KEY]: { ...initialMyParcelsState, ...state } });
    fixture = TestBed.createComponent(MyParcelsComponent);
    fixture.detectChanges();
  }

  function cardText(index = 0): string {
    return fixture.debugElement.queryAll(By.css('.parcel-card'))[index].nativeElement.textContent;
  }

  it('dispatches the initial load on init', () => {
    spyOn(store, 'dispatch');
    renderWithState({});
    expect(store.dispatch).toHaveBeenCalledWith(invokeLoadMyParcelsApi({ page: 0, append: false }));
  });

  it('renders the real route (pickup -> dropoff), not "- -> -" placeholders', () => {
    renderWithState({ items: [buildRow()], loaded: true });

    const text = cardText();
    expect(text).toContain('Nong Chak');
    expect(text).toContain('BTS Mo Chit');
    expect(text).not.toContain('- → -');
  });

  it('renders the real weight (interpolated into WEIGHT_VALUE), not an empty "kg"', () => {
    // Every other test in this file asserts on the RAW i18n key (this repo's
    // established DOM-spec convention — no loader is registered) so a wrong
    // template branch is visible. That convention can't prove the *value*
    // reached the pipe, though — the original bug (`{{ row.weightKg }} kg`
    // rendering as a bare " kg" when the field was undefined) was a value
    // problem, not a branch problem. Load a real translation for exactly
    // this key so ngx-translate actually interpolates it.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      PARCEL_BOOKING: { MY_PARCELS: { WEIGHT_VALUE: '{{weight}} kg' } },
    });
    translate.use('en');

    renderWithState({ items: [buildRow({ weightKg: 7.25 })], loaded: true });

    expect(cardText()).toContain('7.25 kg');
  });

  it('a PAID, created row shows the AMOUNT_PAID label and the CREATED_ACTION_HINT', () => {
    renderWithState({
      items: [buildRow({ deliveryStatus: 'created', bookingStatus: 'confirmed' })],
      loaded: true,
    });

    const text = cardText();
    expect(text).toContain('PARCEL_BOOKING.MY_PARCELS.AMOUNT_PAID');
    expect(text).not.toContain('PARCEL_BOOKING.MY_PARCELS.AMOUNT_DUE');
    expect(text).toContain('PARCEL_BOOKING.MY_PARCELS.CREATED_ACTION_HINT');
    expect(text).not.toContain('PARCEL_BOOKING.MY_PARCELS.UNPAID_BADGE');
  });

  it('an UNPAID (pending) row shows the unpaid badge + expiresAt, and NOT the created hint', () => {
    renderWithState({
      items: [
        buildRow({
          deliveryStatus: 'created',
          bookingStatus: 'pending',
          expiresAt: '2026-08-01T08:15:00+07:00',
        }),
      ],
      loaded: true,
    });

    const text = cardText();
    expect(text).toContain('PARCEL_BOOKING.MY_PARCELS.AMOUNT_DUE');
    expect(text).not.toContain('PARCEL_BOOKING.MY_PARCELS.AMOUNT_PAID');
    expect(text).toContain('PARCEL_BOOKING.MY_PARCELS.UNPAID_BADGE');
    expect(text).toContain('PARCEL_BOOKING.MY_PARCELS.EXPIRES_AT');
    expect(text).not.toContain('PARCEL_BOOKING.MY_PARCELS.CREATED_ACTION_HINT');
  });

  it('renders the customer-facing "created" status label, not the driver copy', () => {
    renderWithState({ items: [buildRow({ deliveryStatus: 'created' })], loaded: true });

    const text = cardText();
    expect(text).toContain('PARCEL_TRACKING.STATUS.CREATED');
    expect(text).not.toContain('STAFF.PARCEL_DELIVERY.STATUS.CREATED');
  });

  it('renders the empty state and its CTA when loaded with no items', () => {
    renderWithState({ items: [], loaded: true });

    const empty = fixture.debugElement.query(By.css('.state-card--empty'));
    expect(empty).not.toBeNull();
    expect(empty.nativeElement.textContent).toContain('PARCEL_BOOKING.MY_PARCELS.EMPTY');
    expect(
      fixture.debugElement.query(By.css('.state-card--empty a[routerLink="/parcel-booking"]'))
    ).not.toBeNull();
  });

  it('renders the error state with a retry button that re-dispatches the load', () => {
    renderWithState({ error: 'boom', loaded: true });
    spyOn(store, 'dispatch');

    const retryBtn = fixture.debugElement.query(By.css('.state-card--error button'))
      .nativeElement as HTMLButtonElement;
    retryBtn.click();

    expect(store.dispatch).toHaveBeenCalledWith(invokeLoadMyParcelsApi({ page: 0, append: false }));
  });

  it('renders the load-more button only when hasMore is true, and dispatches an append load', () => {
    renderWithState({ items: [buildRow()], loaded: true, hasMore: true, page: 0 });
    spyOn(store, 'dispatch');

    const loadMoreBtn = fixture.debugElement.query(By.css('.my-parcels__load-more button'))
      .nativeElement as HTMLButtonElement;
    loadMoreBtn.click();

    expect(store.dispatch).toHaveBeenCalledWith(invokeLoadMyParcelsApi({ page: 1, append: true }));
  });

  it('does not render the load-more button when hasMore is false', () => {
    renderWithState({ items: [buildRow()], loaded: true, hasMore: false });
    expect(fixture.debugElement.query(By.css('.my-parcels__load-more'))).toBeNull();
  });

  it('copyTrackingNumber uses the clipboard API and toasts on success', async () => {
    renderWithState({ items: [buildRow()], loaded: true });
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    const copyBtn = fixture.debugElement.query(By.css('.parcel-card .icon-btn'))
      .nativeElement as HTMLButtonElement;
    copyBtn.click();
    await fixture.whenStable();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PCL0000001');
    expect(alertService.toast).toHaveBeenCalled();
  });
});
