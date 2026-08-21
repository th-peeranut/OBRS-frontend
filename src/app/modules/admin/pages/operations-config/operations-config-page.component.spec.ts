import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { OperationsConfigPageComponent } from './operations-config-page.component';
import { ConfigSourceBadgeComponent } from '../cancel-reschedule-policy-config/config-source-badge/config-source-badge.component';
import { OperationsConfigStore } from './operations-config.store';
import { AdminRefreshHintComponent } from '../../components/admin-refresh-hint/admin-refresh-hint.component';
import { AdminApiService, OwnerOperationsConfigDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain } from '../../../../testing/contrast';

/** Platform-default everywhere — the state an owner who has never saved sees. */
const ALL_DEFAULT: OwnerOperationsConfigDto = {
  seatReservationMinutes: 10,
  seatReservationMinutesOverridden: false,
  reschedulePaymentTimeoutMinutes: 15,
  reschedulePaymentTimeoutMinutesOverridden: false,
  noShowCutoffMinutes: 10,
  noShowCutoffMinutesOverridden: false,
  nearFullAlertThresholdPercent: 90,
  nearFullAlertThresholdPercentOverridden: false,
};

function allOverridden(): OwnerOperationsConfigDto {
  return {
    ...ALL_DEFAULT,
    seatReservationMinutesOverridden: true,
    reschedulePaymentTimeoutMinutesOverridden: true,
    noShowCutoffMinutesOverridden: true,
    nearFullAlertThresholdPercentOverridden: true,
  };
}

/** Two of four owned — the arm that can only arrive from data written outside
 * this UI, and that a page rendering "all default" would lie about. */
function mixed(): OwnerOperationsConfigDto {
  return {
    ...ALL_DEFAULT,
    seatReservationMinutesOverridden: true,
    noShowCutoffMinutesOverridden: true,
  };
}

function makeStoreStub() {
  const data$ = new BehaviorSubject<OwnerOperationsConfigDto | null>(null);
  const errorStatus$ = new BehaviorSubject<number | null>(null);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$,
    errorStatus$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate'),
    get hasValue() {
      return data$.value !== null;
    },
    get errorStatus() {
      return errorStatus$.value;
    },
    /** Fail with `status`, in the base class's order (status, then flag). */
    failWith(status: number | null) {
      errorStatus$.next(status);
      error$.next(true);
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
  const component = new OperationsConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

function okResponse(data: OwnerOperationsConfigDto) {
  return of({ code: 200, message: 'OK', data });
}

describe('OperationsConfigPageComponent (OBRS-703)', () => {
  it('subscribes to store.data$ and calls store.refresh() on init', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('loads the four values onto the form', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next(ALL_DEFAULT);

    expect(component.form.get('seatReservationMinutes').value).toBe(10);
    expect(component.form.get('reschedulePaymentTimeoutMinutes').value).toBe(15);
    expect(component.form.get('noShowCutoffMinutes').value).toBe(10);
    expect(component.form.get('nearFullAlertThresholdPercent').value).toBe(90);
  });

  describe('separating "the owner set this" from "this is inherited"', () => {
    it('reports ALL_DEFAULT with nothing overridden', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);

      expect(component['overriddenCount']).toBe(0);
      expect(component['inheritedCount']).toBe(4);
      expect(component['stateKey']).toBe('ADMIN.OPERATIONS_CONFIG.STATE.ALL_DEFAULT');
    });

    it('reports MIXED rather than pretending a partly-owned config is all default', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(mixed());

      expect(component['overriddenCount']).toBe(2);
      expect(component['inheritedCount']).toBe(2);
      expect(component['stateKey']).toBe('ADMIN.OPERATIONS_CONFIG.STATE.MIXED');
    });

    it('reports ALL_CUSTOM once all four are the owner’s', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(allOverridden());

      expect(component['overriddenCount']).toBe(4);
      expect(component['stateKey']).toBe('ADMIN.OPERATIONS_CONFIG.STATE.ALL_CUSTOM');
    });
  });

  // OBRS-727 pattern — `requiredRoles: ['owner']` does not hide this tab from
  // an admin (AuthService.ROLE_GRANTS is symmetric today), so a real 403 is
  // reachable and must render as "not yours", never the generic LOAD_FAILED
  // text or an empty form.
  describe('the 403 state', () => {
    it('sets isForbidden and a permission-specific message, not the generic load-failed text', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.failWith(403);

      expect(component['isForbidden']).toBeTrue();
      expect(component['errorMessage']).toBe('ADMIN.OPERATIONS_CONFIG.FORBIDDEN');
    });

    it('does not set isForbidden for a non-403 failure', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.failWith(500);

      expect(component['isForbidden']).toBeFalse();
      expect(component['errorMessage']).toBe('ADMIN.OPERATIONS_CONFIG.LOAD_FAILED');
    });
  });

  describe('save()', () => {
    it('sends nothing and warns when the form is invalid', async () => {
      const update = jasmine.createSpy('updateOperationsOwnerConfig');
      const { component, store, alert } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      component.form.get('noShowCutoffMinutes').setValue(0); // below the 1-240 range

      await component['save']();

      expect(update).not.toHaveBeenCalled();
      expect(alert.warning).toHaveBeenCalled();
    });

    it('asks before converting inherited values, and sends nothing if the owner declines', async () => {
      const update = jasmine.createSpy('updateOperationsOwnerConfig');
      const { component, store, alert } = makeComponent({ updateOperationsOwnerConfig: update });
      alert.confirm.and.resolveTo(false);
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      component.form.markAsDirty();

      await component['save']();

      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('does NOT ask when all four are already the owner’s — a routine edit gets no dialog', async () => {
      const update = jasmine
        .createSpy('updateOperationsOwnerConfig')
        .and.returnValue(okResponse(allOverridden()));
      const { component, store, alert } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(alert.confirm).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('sends the payload with exactly the four wire fields', async () => {
      const update = jasmine
        .createSpy('updateOperationsOwnerConfig')
        .and.returnValue(okResponse(allOverridden()));
      const { component, store } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(update).toHaveBeenCalledWith({
        seatReservationMinutes: 10,
        reschedulePaymentTimeoutMinutes: 15,
        noShowCutoffMinutes: 10,
        nearFullAlertThresholdPercent: 90,
      });
    });

    it('leaves the form pristine and re-reads the badges from the server response', async () => {
      const saved = allOverridden();
      const update = jasmine
        .createSpy('updateOperationsOwnerConfig')
        .and.returnValue(okResponse(saved));
      const { component, store } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      component.form.markAsDirty();

      await component['save']();

      expect(component.form.pristine).toBeTrue();
      expect(store.mutate).toHaveBeenCalled();
      expect(store.mutate.calls.mostRecent().args[0](ALL_DEFAULT)).toBe(saved);
    });
  });

  describe('the 400 path — server-named field errors', () => {
    function rejection() {
      return new HttpErrorResponse({
        status: 400,
        error: {
          message: 'All four fields are required.',
          errors: [
            {
              field: 'noShowCutoffMinutes',
              rejectedValue: null,
              reason: 'must not be blank',
            },
          ],
        },
      });
    }

    it('marks the control the server named', async () => {
      const update = jasmine
        .createSpy('updateOperationsOwnerConfig')
        .and.returnValue(throwError(() => rejection()));
      const { component, store } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(component.form.get('noShowCutoffMinutes').hasError('server')).toBeTrue();
      expect(component['errorKey']('noShowCutoffMinutes')).toBe(
        'ADMIN.VALIDATION.SERVER_FIELD_ERROR'
      );
    });

    it('keeps the reason on screen after the toast, and clears it on the next edit', async () => {
      const update = jasmine
        .createSpy('updateOperationsOwnerConfig')
        .and.returnValue(throwError(() => rejection()));
      const { component, store, alert } = makeComponent({ updateOperationsOwnerConfig: update });
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(alert.error).toHaveBeenCalled();
      expect(component['serverErrorMessage']).toBe('All four fields are required.');

      component.form.get('noShowCutoffMinutes').setValue(12);
      expect(component['serverErrorMessage']).toBe('');
    });
  });

  describe('use the platform default (DELETE)', () => {
    it('sends nothing when the confirm is dismissed', async () => {
      const reset = jasmine.createSpy('resetOperationsOwnerConfig');
      const { component, store, alert } = makeComponent({ resetOperationsOwnerConfig: reset });
      alert.confirm.and.resolveTo(false);
      component.ngOnInit();
      store.data$.next(allOverridden());

      await component['resetToPlatformDefault']();

      expect(reset).not.toHaveBeenCalled();
    });

    it('ends PRISTINE on success, so the unsaved-changes guard does not fire on the next tab switch', async () => {
      const reset = jasmine
        .createSpy('resetOperationsOwnerConfig')
        .and.returnValue(okResponse(ALL_DEFAULT));
      const { component, store } = makeComponent({ resetOperationsOwnerConfig: reset });
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.get('seatReservationMinutes').setValue(30);
      // `setValue` alone never marks a control dirty — only user interaction
      // does, so the pre-condition has to be set explicitly.
      component.form.get('seatReservationMinutes').markAsDirty();
      expect(component.form.dirty).toBeTrue();

      await component['resetToPlatformDefault']();

      expect(reset).toHaveBeenCalledTimes(1);
      expect(component.form.pristine).toBeTrue();
      expect(component.form.get('seatReservationMinutes').value).toBe(10);
    });

    it('renders the failure inline and leaves the values untouched', async () => {
      const reset = jasmine
        .createSpy('resetOperationsOwnerConfig')
        .and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))
        );
      const { component, store } = makeComponent({ resetOperationsOwnerConfig: reset });
      component.ngOnInit();
      store.data$.next(allOverridden());

      await component['resetToPlatformDefault']();

      expect(component['resetErrorMessage']).toBe('boom');
      expect(component.form.get('seatReservationMinutes').value).toBe(10);
    });
  });

  // ── WCAG contrast, light AND dark (SPEC §7.6) ────────────────────────────
  describe('contrast', () => {
    let fixture: ComponentFixture<OperationsConfigPageComponent>;
    let store: ReturnType<typeof makeStoreStub>;
    let teardown: (() => void) | null = null;

    beforeEach(async () => {
      store = makeStoreStub();
      await TestBed.configureTestingModule({
        declarations: [
          OperationsConfigPageComponent,
          ConfigSourceBadgeComponent,
          AdminRefreshHintComponent,
        ],
        imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
        providers: [
          { provide: OperationsConfigStore, useValue: store },
          { provide: AdminApiService, useValue: {} },
          {
            provide: AlertService,
            useValue: {
              success: () => Promise.resolve(),
              error: () => Promise.resolve(),
              warning: () => Promise.resolve(),
              confirm: () => Promise.resolve(true),
            },
          },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(OperationsConfigPageComponent);
      TestBed.inject(TranslateService).use('en');
    });

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    /** Renders every measured element at once: a MIXED config gives both
     * badge variants, a dirty form gives the takeover warning, an
     * out-of-range value gives the field error, and the two persistent
     * money/near-full warnings render unconditionally. */
    function mountEverything(dark: boolean): void {
      fixture.detectChanges();
      store.data$.next(mixed());
      const component = fixture.componentInstance as any;
      component.form.get('noShowCutoffMinutes').setValue(999);
      component.form.get('noShowCutoffMinutes').markAsTouched();
      component.form.markAsDirty();
      component.serverErrorMessage = 'The server rejected this config.';
      fixture.detectChanges();
      teardown = mountInChain(fixture.nativeElement, ['admin-shell theme-admin'], dark);
      fixture.detectChanges();
    }

    function el(selector: string): HTMLElement {
      const found = fixture.nativeElement.querySelector(selector) as HTMLElement | null;
      if (!found) {
        throw new Error(`contrast spec found no "${selector}" — the measurement would be vacuous`);
      }
      return found;
    }

    function ratio(element: HTMLElement): number {
      return contrast(fgOf(element), effectiveBg(element));
    }

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the "platform default" badge is readable on its own fill`, () => {
        mountEverything(dark);
        const neutral = el('app-config-source-badge .admin-status.is-neutral');
        expect(ratio(neutral)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the "your setting" badge is readable on its own fill`, () => {
        mountEverything(dark);
        const info = el('app-config-source-badge .admin-status.is-info');
        expect(ratio(info)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the takeover warning is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="operations-config-takeover-warning"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the no-show money warning is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="operations-config-no-show-warning"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the near-full 100% warning is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="operations-config-near-full-warning"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: a per-field error is readable on the card`, () => {
        mountEverything(dark);
        expect(ratio(el('#noShowCutoffMinutes-error'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the persistent server-rejection banner is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="operations-config-server-error"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the muted helper text is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('#seatReservationMinutes-helper'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });

  // ── the 403 state renders no skeleton and no form ────────────────────────
  describe('the 403 template', () => {
    let fixture: ComponentFixture<OperationsConfigPageComponent>;
    let store: ReturnType<typeof makeStoreStub>;

    beforeEach(async () => {
      store = makeStoreStub();
      await TestBed.configureTestingModule({
        declarations: [
          OperationsConfigPageComponent,
          ConfigSourceBadgeComponent,
          AdminRefreshHintComponent,
        ],
        imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
        providers: [
          { provide: OperationsConfigStore, useValue: store },
          { provide: AdminApiService, useValue: {} },
          {
            provide: AlertService,
            useValue: {
              success: () => Promise.resolve(),
              error: () => Promise.resolve(),
              warning: () => Promise.resolve(),
              confirm: () => Promise.resolve(true),
            },
          },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(OperationsConfigPageComponent);
    });

    it('shows the forbidden panel and hides the form entirely', () => {
      fixture.detectChanges();
      store.failWith(403);
      fixture.detectChanges();

      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('[data-testid="operations-config-forbidden"]')).toBeTruthy();
      expect(root.querySelector('form')).toBeFalsy();
    });
  });
});
