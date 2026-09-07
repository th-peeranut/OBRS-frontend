import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { CancelReschedulePolicyConfigPageComponent } from './cancel-reschedule-policy-config-page.component';
import { ConfigSourceBadgeComponent } from './config-source-badge/config-source-badge.component';
import { CancelReschedulePolicyConfigStore } from './cancel-reschedule-policy-config.store';
import { AdminRefreshHintComponent } from '../../components/admin-refresh-hint/admin-refresh-hint.component';
import { AdminApiService, OwnerCancelReschedulePolicyDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain } from '../../../../testing/contrast';

/** Platform-default everywhere — the state an owner who has never saved sees. */
const ALL_DEFAULT: OwnerCancelReschedulePolicyDto = {
  cancelWindowHours: 2,
  cancelWindowHoursOverridden: false,
  rescheduleWindowHours: 2,
  rescheduleWindowHoursOverridden: false,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxDaysAheadOverridden: false,
  earlyWindowHours: 24,
  earlyWindowHoursOverridden: false,
  cancelRefundRateEarly: 0.8,
  cancelRefundRateEarlyOverridden: false,
  cancelRefundRateLate: 0.5,
  cancelRefundRateLateOverridden: false,
  rescheduleFeeLateThb: 50,
  rescheduleFeeLateThbOverridden: false,
  // OBRS-1447: 0 is the shipped default and means UNLIMITED, not "no reschedules".
  rescheduleMaxCount: 0,
  rescheduleMaxCountOverridden: false,
};

function allOverridden(): OwnerCancelReschedulePolicyDto {
  return {
    ...ALL_DEFAULT,
    cancelWindowHoursOverridden: true,
    rescheduleWindowHoursOverridden: true,
    rescheduleMaxDaysAheadOverridden: true,
    earlyWindowHoursOverridden: true,
    cancelRefundRateEarlyOverridden: true,
    cancelRefundRateLateOverridden: true,
    rescheduleFeeLateThbOverridden: true,
    rescheduleMaxCountOverridden: true,
  };
}

/** Three of eight owned — the arm that can only arrive from data written
 * outside this UI, and that a page rendering "all default" would lie about. */
function mixed(): OwnerCancelReschedulePolicyDto {
  return {
    ...ALL_DEFAULT,
    cancelWindowHoursOverridden: true,
    cancelRefundRateEarlyOverridden: true,
    earlyWindowHoursOverridden: true,
  };
}

function makeStoreStub() {
  const data$ = new BehaviorSubject<OwnerCancelReschedulePolicyDto | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate'),
    get hasValue() {
      return data$.value !== null;
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
  const component = new CancelReschedulePolicyConfigPageComponent(
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

function okResponse(data: OwnerCancelReschedulePolicyDto) {
  return of({ code: 200, message: 'OK', data });
}

describe('CancelReschedulePolicyConfigPageComponent (OBRS-699)', () => {
  it('subscribes to store.data$ and calls store.refresh() on init', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  // §4.2: the wire is the 0.00-1.00 rate; only the INPUT is whole percent, and
  // the conversion happens at exactly two boundaries. If either one drifts the
  // owner publishes a rate 100x wrong, so both are pinned.
  describe('the whole-percent input boundary', () => {
    it('shows a 0.80 rate as 80', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);

      expect(component.form.get('cancelRefundRateEarlyPct').value).toBe(80);
      expect(component.form.get('cancelRefundRateLatePct').value).toBe(50);
    });

    it('sends 80 back as 0.8, not as 80', async () => {
      const update = jasmine
        .createSpy('updateCancelReschedulePolicyOwnerConfig')
        .and.returnValue(okResponse(allOverridden()));
      const { component, store } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(update).toHaveBeenCalledWith({
        cancelWindowHours: 2,
        cancelRefundRateEarly: 0.8,
        cancelRefundRateLate: 0.5,
        rescheduleWindowHours: 2,
        rescheduleMaxDaysAhead: 60,
        rescheduleMaxCount: 0,
        rescheduleFeeLateThb: 50,
        earlyWindowHours: 24,
      });
    });
  });

  describe('separating "the owner set this" from "this is inherited"', () => {
    it('reports ALL_DEFAULT with nothing overridden', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);

      expect(component['overriddenCount']).toBe(0);
      expect(component['inheritedCount']).toBe(8);
      expect(component['stateKey']).toBe('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.ALL_DEFAULT');
    });

    it('reports MIXED rather than pretending a partly-owned policy is all default', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(mixed());

      expect(component['overriddenCount']).toBe(3);
      expect(component['inheritedCount']).toBe(5);
      expect(component['stateKey']).toBe('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.MIXED');
    });

    it('reports ALL_CUSTOM once all eight are the owner’s', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next(allOverridden());

      expect(component['overriddenCount']).toBe(8);
      expect(component['stateKey']).toBe('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.ALL_CUSTOM');
    });
  });

  describe('save()', () => {
    it('sends nothing and warns when the form is invalid', async () => {
      const update = jasmine.createSpy('updateCancelReschedulePolicyOwnerConfig');
      const { component, store, alert } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      // BR-4 violation: the boundary is no longer above the cancel window.
      component.form.get('earlyWindowHours').setValue(1);

      await component['save']();

      expect(update).not.toHaveBeenCalled();
      expect(alert.warning).toHaveBeenCalled();
    });

    it('asks before converting inherited values, and sends nothing if the owner declines', async () => {
      const update = jasmine.createSpy('updateCancelReschedulePolicyOwnerConfig');
      const { component, store, alert } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      alert.confirm.and.resolveTo(false);
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      component.form.markAsDirty();

      await component['save']();

      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('does NOT ask when all eight are already the owner’s — a routine edit gets no dialog', async () => {
      const update = jasmine
        .createSpy('updateCancelReschedulePolicyOwnerConfig')
        .and.returnValue(okResponse(allOverridden()));
      const { component, store, alert } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(alert.confirm).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('leaves the form pristine and re-reads the badges from the server response', async () => {
      const saved = allOverridden();
      const update = jasmine
        .createSpy('updateCancelReschedulePolicyOwnerConfig')
        .and.returnValue(okResponse(saved));
      const { component, store } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(ALL_DEFAULT);
      component.form.markAsDirty();

      await component['save']();

      expect(component.form.pristine).toBeTrue();
      expect(store.mutate).toHaveBeenCalled();
      expect(store.mutate.calls.mostRecent().args[0](ALL_DEFAULT)).toBe(saved);
    });
  });

  describe('the 400 path (D-2) — both halves', () => {
    function rejection() {
      return new HttpErrorResponse({
        status: 400,
        error: {
          message: 'The early refund rate must not be below the late rate.',
          errors: [
            {
              field: 'cancelRefundRateEarly',
              rejectedValue: 0.4,
              reason: 'must not be below cancelRefundRateLate',
            },
          ],
        },
      });
    }

    it('marks the control the server named — mapping the WIRE name onto the *Pct control', async () => {
      const update = jasmine
        .createSpy('updateCancelReschedulePolicyOwnerConfig')
        .and.returnValue(throwError(() => rejection()));
      const { component, store } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(component.form.get('cancelRefundRateEarlyPct').hasError('server')).toBeTrue();
      expect(component['errorKey']('cancelRefundRateEarlyPct')).toBe(
        'ADMIN.VALIDATION.SERVER_FIELD_ERROR'
      );
      expect(component['errorParams']('cancelRefundRateEarlyPct')).toEqual({
        reason: 'must not be below cancelRefundRateLate',
      });
    });

    it('keeps the reason on screen after the toast, and clears it on the next edit', async () => {
      const update = jasmine
        .createSpy('updateCancelReschedulePolicyOwnerConfig')
        .and.returnValue(throwError(() => rejection()));
      const { component, store, alert } = makeComponent(
        { updateCancelReschedulePolicyOwnerConfig: update }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.markAsDirty();

      await component['save']();

      expect(alert.error).toHaveBeenCalled();
      expect(component['serverErrorMessage']).toBe(
        'The early refund rate must not be below the late rate.'
      );

      component.form.get('cancelRefundRateEarlyPct').setValue(90);
      expect(component['serverErrorMessage']).toBe('');
    });
  });

  describe('use the platform default (DELETE)', () => {
    it('sends nothing when the confirm is dismissed', async () => {
      const reset = jasmine.createSpy('resetCancelReschedulePolicyOwnerConfig');
      const { component, store, alert } = makeComponent(
        { resetCancelReschedulePolicyOwnerConfig: reset }
      );
      alert.confirm.and.resolveTo(false);
      component.ngOnInit();
      store.data$.next(allOverridden());

      await component['resetToPlatformDefault']();

      expect(reset).not.toHaveBeenCalled();
    });

    it('ends PRISTINE on success, so the unsaved-changes guard does not fire on the next tab switch', async () => {
      const reset = jasmine
        .createSpy('resetCancelReschedulePolicyOwnerConfig')
        .and.returnValue(okResponse(ALL_DEFAULT));
      const { component, store } = makeComponent(
        { resetCancelReschedulePolicyOwnerConfig: reset }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());
      component.form.get('cancelWindowHours').setValue(9);
      // `setValue` alone never marks a control dirty — only user interaction
      // does, so the pre-condition has to be set explicitly or this spec would
      // "prove" pristine-after-reset from a form that was pristine all along.
      component.form.get('cancelWindowHours').markAsDirty();
      expect(component.form.dirty).toBeTrue();

      await component['resetToPlatformDefault']();

      expect(reset).toHaveBeenCalledTimes(1);
      expect(component.form.pristine).toBeTrue();
      expect(component.form.get('cancelWindowHours').value).toBe(2);
    });

    it('renders the failure inline and leaves the values untouched', async () => {
      const reset = jasmine
        .createSpy('resetCancelReschedulePolicyOwnerConfig')
        .and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } }))
        );
      const { component, store } = makeComponent(
        { resetCancelReschedulePolicyOwnerConfig: reset }
      );
      component.ngOnInit();
      store.data$.next(allOverridden());

      await component['resetToPlatformDefault']();

      expect(component['resetErrorMessage']).toBe('boom');
      expect(component.form.get('cancelWindowHours').value).toBe(2);
    });
  });

  // ── WCAG contrast, light AND dark (SPEC §7.6) ────────────────────────────
  //
  // Never verified by eye (design-system §2.4.0). `effectiveBg` composites the
  // ancestor chain so a translucent wrapper cannot flatter the number, and the
  // page is mounted inside a real `.admin-shell` because every --admin-* token
  // only exists there.
  describe('contrast', () => {
    let fixture: ComponentFixture<CancelReschedulePolicyConfigPageComponent>;
    let store: ReturnType<typeof makeStoreStub>;
    let teardown: (() => void) | null = null;

    beforeEach(async () => {
      store = makeStoreStub();
      await TestBed.configureTestingModule({
        declarations: [
          CancelReschedulePolicyConfigPageComponent,
          ConfigSourceBadgeComponent,
          AdminRefreshHintComponent,
          PendingButtonDirective,
        ],
        imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
        providers: [
          { provide: CancelReschedulePolicyConfigStore, useValue: store },
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
      fixture = TestBed.createComponent(CancelReschedulePolicyConfigPageComponent);
      TestBed.inject(TranslateService).use('en');
    });

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    /** Renders every measured element at once: a MIXED policy gives both badge
     * variants, a dirty form gives the takeover warning, an out-of-range value
     * gives the field error, and the banner is set directly. */
    function mountEverything(dark: boolean): void {
      fixture.detectChanges();
      store.data$.next(mixed());
      const component = fixture.componentInstance as any;
      component.form.get('cancelWindowHours').setValue(999);
      component.form.get('cancelWindowHours').markAsTouched();
      component.form.markAsDirty();
      component.serverErrorMessage = 'The server rejected this policy.';
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

      it(`${mode}: the takeover warning is readable — the chip pair on ONE element`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="cancel-reschedule-policy-takeover-warning"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: a per-field error is readable on the card`, () => {
        mountEverything(dark);
        expect(ratio(el('#cancelWindowHours-error'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the persistent server-rejection banner is readable`, () => {
        mountEverything(dark);
        expect(ratio(el('[data-testid="cancel-reschedule-policy-server-error"]')))
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the muted helper text is readable — the ratio that is easy to get wrong`, () => {
        mountEverything(dark);
        expect(ratio(el('#cancelWindowHours-helper'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});
