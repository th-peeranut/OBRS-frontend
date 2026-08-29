import { BehaviorSubject, of, throwError } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ParcelShareClawbacksSectionComponent } from './parcel-share-clawbacks-section.component';
import { ParcelShareClawbacksStore } from '../parcel-share-clawbacks.store';
import {
  AdminApiService,
  ParcelShareClawbackRowDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { AdminSharedModule } from '../../../admin-shared.module';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeRow(overrides: Partial<ParcelShareClawbackRowDto> = {}): ParcelShareClawbackRowDto {
  return {
    clawbackId: 7,
    parcelId: 12,
    scheduleId: 3,
    payeeRole: 'SALESPERSON',
    payeeUserId: 44,
    payeeName: 'Somchai',
    businessDate: '2026-07-15',
    amount: '10.00',
    status: 'OUTSTANDING',
    reason: 'PARCEL_CANCEL',
    collectedAt: null,
    collectedVia: null,
    note: null,
    ...overrides,
  };
}

function makeStoreStub(rows: ParcelShareClawbackRowDto[] | null) {
  const data$ = new BehaviorSubject<ParcelShareClawbackRowDto[] | null>(rows);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    filter: 'OUTSTANDING' as const,
    hasValue: rows !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setFilter: jasmine.createSpy('setFilter'),
    mutate: jasmine.createSpy('mutate').and.callFake((fn: (c: ParcelShareClawbackRowDto[]) => ParcelShareClawbackRowDto[]) => {
      data$.next(fn(data$.value ?? []));
    }),
  };
}

describe('ParcelShareClawbacksSectionComponent', () => {
  let fixture: ComponentFixture<ParcelShareClawbacksSectionComponent>;
  let store: ReturnType<typeof makeStoreStub>;
  let adminApi: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  function configure(rows: ParcelShareClawbackRowDto[] | null) {
    store = makeStoreStub(rows);
    adminApi = jasmine.createSpyObj('AdminApiService', ['collectParcelShareClawback']);
    alert = jasmine.createSpyObj('AlertService', ['confirm', 'success', 'error']);
    alert.confirm.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [ParcelShareClawbacksSectionComponent],
      providers: [
        { provide: ParcelShareClawbacksStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
        { provide: TranslateService, useValue: createTranslateStub() },
      ],
    });
    fixture = TestBed.createComponent(ParcelShareClawbacksSectionComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  function rowEls(): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="parcel-share-clawback-row"]')
    );
  }

  it('refreshes the store on init', () => {
    configure([]);
    fixture.detectChanges();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('renders the empty state rather than a bare table when there are no clawbacks', () => {
    configure([]);
    fixture.detectChanges();

    expect(rowEls().length).toBe(0);
    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawbacks-empty"]')
    ).not.toBeNull();
  });

  it('renders a row with its amount and a translated role', () => {
    configure([makeRow()]);
    fixture.detectChanges();

    expect(rowEls().length).toBe(1);
    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-amount"]').textContent
    ).toContain('10.00');
    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-role"]').textContent
    ).toContain('ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ROLE.SALESPERSON');
  });

  /** An OUTSTANDING row has no `collectedVia` — the cell must not print the
   * i18n key for `null`, which is what a naive `CHANNEL.{{value}}` does. */
  it('shows a dash, not a raw i18n key, for an uncollected row channel', () => {
    configure([makeRow()]);
    fixture.detectChanges();

    const channel = fixture.nativeElement.querySelector(
      '[data-testid="parcel-share-clawback-channel"]'
    );
    expect(channel.textContent.trim()).toBe('—');
  });

  it('offers the collect button only on OUTSTANDING rows', () => {
    configure([makeRow({ status: 'COLLECTED', collectedVia: 'MANUAL', collectedAt: '2026-07-16T03:00:00Z' })]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]')
    ).toBeNull();
  });

  it('confirms before collecting and does NOT call the API when the owner cancels', async () => {
    configure([makeRow()]);
    fixture.detectChanges();
    alert.confirm.and.resolveTo(false);

    fixture.nativeElement
      .querySelector('[data-testid="parcel-share-clawback-collect"]')
      .click();
    await fixture.whenStable();

    expect(alert.confirm).toHaveBeenCalled();
    expect(adminApi.collectParcelShareClawback).not.toHaveBeenCalled();
  });

  it('posts the typed note with the collect', async () => {
    configure([makeRow()]);
    fixture.detectChanges();
    adminApi.collectParcelShareClawback.and.returnValue(
      of({ code: 200, message: 'OK', data: makeRow({ status: 'COLLECTED' }) }) as any
    );

    const noteInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="parcel-share-clawback-note"]'
    );
    noteInput.value = '  handed back in cash  ';
    noteInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]').click();
    await fixture.whenStable();

    expect(adminApi.collectParcelShareClawback).toHaveBeenCalledWith(7, 'handed back in cash');
    expect(alert.success).toHaveBeenCalled();
  });

  /** An empty note must be OMITTED, not sent as `''` — the backend stores the
   * value verbatim, and a blank note is indistinguishable from "no note" to a
   * reader but is a real column write. */
  it('omits the note entirely when the field was left blank', async () => {
    configure([makeRow()]);
    fixture.detectChanges();
    adminApi.collectParcelShareClawback.and.returnValue(
      of({ code: 200, message: 'OK', data: makeRow({ status: 'COLLECTED' }) }) as any
    );

    fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]').click();
    await fixture.whenStable();

    expect(adminApi.collectParcelShareClawback).toHaveBeenCalledWith(7, undefined);
  });

  it('drops the row from the list under the default OUTSTANDING filter after a collect', async () => {
    configure([makeRow(), makeRow({ clawbackId: 8, payeeUserId: 45 })]);
    fixture.detectChanges();
    adminApi.collectParcelShareClawback.and.returnValue(
      of({ code: 200, message: 'OK', data: makeRow({ status: 'COLLECTED' }) }) as any
    );

    fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rowEls().length).toBe(1);
  });

  /**
   * The 409 path is the reason this branch exists: another owner session (or
   * the driver's daily return) already took the money. Showing the mapped
   * message is not enough — the list still holds a row that says OUTSTANDING,
   * so it must be re-fetched or the owner is invited to collect twice.
   */
  it('maps a 409 ALREADY_COLLECTED to its own message and re-fetches the list', async () => {
    configure([makeRow()]);
    fixture.detectChanges();
    store.refresh.calls.reset();
    adminApi.collectParcelShareClawback.and.returnValue(
      throwError(() => ({ status: 409, error: { errorCode: 'PARCEL_SHARE_CLAWBACK_ALREADY_COLLECTED' } })) as any
    );

    fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]').click();
    await fixture.whenStable();

    expect(alert.error).toHaveBeenCalledWith(
      'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ERROR.ALREADY_COLLECTED'
    );
    expect(store.refresh).toHaveBeenCalled();
  });

  it('falls back to the generic failure message for an unknown error code', async () => {
    configure([makeRow()]);
    fixture.detectChanges();
    adminApi.collectParcelShareClawback.and.returnValue(
      throwError(() => ({ status: 500, error: {} })) as any
    );

    fixture.nativeElement.querySelector('[data-testid="parcel-share-clawback-collect"]').click();
    await fixture.whenStable();

    expect(alert.error).toHaveBeenCalledWith(
      'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ERROR.COLLECT_FAILED'
    );
  });

  it('passes the filter through to the store as a wire-shaped value', () => {
    configure([]);
    fixture.detectChanges();

    fixture.componentInstance['onFilterChange']('ALL');

    expect(store.setFilter).toHaveBeenCalledWith('ALL');
  });

  // OBRS-1631: the dropdown renders its own `[placeholder]` as a clickable row emitting `''`
  // (admin-dropdown.component.html:42-57). `'' as ParcelShareClawbackFilter` is not one of the
  // three wire values, and it is not 'ALL' either, so the store sent `status=` to the API.
  it('ignores the empty value the dropdown placeholder emits', () => {
    configure([]);
    fixture.detectChanges();
    store.setFilter.calls.reset();

    fixture.componentInstance['onFilterChange']('');

    expect(store.setFilter).not.toHaveBeenCalled();
  });

  it('shows the load error only when there is nothing cached to show', () => {
    configure(null);
    fixture.detectChanges();
    store.error$.next(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawbacks-error"]')
    ).not.toBeNull();
  });

  it('keeps the cached rows and hides the error when a background revalidate fails', () => {
    configure([makeRow()]);
    fixture.detectChanges();
    store.error$.next(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="parcel-share-clawbacks-error"]')
    ).toBeNull();
    expect(rowEls().length).toBe(1);
  });
});
