import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { LegalPolicyNoticeComponent } from './legal-policy-notice.component';
import { OwnerCancelReschedulePolicyDto } from '../../../../services/admin/admin-api.service';

/**
 * OBRS-1434 AC-4. The capture lane photographs this component; these are the
 * assertions that keep it honest afterwards.
 *
 * <p>The translations below are a STUB that echoes the interpolation parameters back.
 * The shipped copy lives in `public/i18n/{th,en,zh}.json` and is checked by the parity
 * gate; what this file has to prove is that the box is fed the live policy, which is
 * only visible once the parameters are substituted — an unloaded `| translate` renders
 * the key and would swallow every number silently.
 */
const T = {
  ADMIN: {
    LEGAL_POLICY_NOTICE: {
      TITLE: 'TITLE',
      DETAIL: 'deduct {{earlyDeductPct}}% / {{lateDeductPct}}% at {{earlyWindowHours}}h fee {{rescheduleFee}}',
      POINTER: 'POINTER',
      LINK: 'LINK',
      SOURCE: 'SOURCE',
    },
  },
};

const POLICY: OwnerCancelReschedulePolicyDto = {
  cancelWindowHours: 2,
  cancelWindowHoursOverridden: false,
  rescheduleWindowHours: 2,
  rescheduleWindowHoursOverridden: false,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxDaysAheadOverridden: false,
  rescheduleMaxCount: 0,
  rescheduleMaxCountOverridden: false,
  earlyWindowHours: 24,
  earlyWindowHoursOverridden: false,
  cancelRefundRateEarly: 0.8,
  cancelRefundRateEarlyOverridden: false,
  cancelRefundRateLate: 0.5,
  cancelRefundRateLateOverridden: false,
  rescheduleFeeLateThb: 30,
  rescheduleFeeLateThbOverridden: false,
};

describe('LegalPolicyNoticeComponent', () => {
  let fixture: ComponentFixture<LegalPolicyNoticeComponent>;
  let component: LegalPolicyNoticeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LegalPolicyNoticeComponent],
      // `routerLink` is the only directive this template uses and it is asserted as
      // the attribute it is written as, so the real RouterModule would stand a router
      // up for nothing.
      schemas: [NO_ERRORS_SCHEMA],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', T);
    translate.use('en');

    fixture = TestBed.createComponent(LegalPolicyNoticeComponent);
    component = fixture.componentInstance;
  });

  const root = () => fixture.debugElement.query(By.css('[data-testid="legal-policy-notice"]'));
  const text = () => root().nativeElement.textContent as string;

  it('AC-4.1: the full box states the LIVE deductions, so 0.80/0.50 read as 20% and 50%', () => {
    component.policy = POLICY;
    fixture.detectChanges();

    expect(text()).toContain('deduct 20% / 50% at 24h fee THB 30');
  });

  it('AC-4.1: a policy the owner has taken over is quoted as it now stands, not as it shipped', () => {
    component.policy = { ...POLICY, cancelRefundRateEarly: 0.9, rescheduleFeeLateThb: 0 };
    fixture.detectChanges();

    expect(text()).toContain('deduct 10% / 50% at 24h fee THB 0');
  });

  it('AC-4.2/AC-4.4: the compact box points at the tab that holds the values instead of quoting them', () => {
    component.compact = true;
    fixture.detectChanges();

    expect(
      root().query(By.css('a[routerLink="/admin/settings/cancel-reschedule-policy"]'))
    ).not.toBeNull();
    expect(text()).toContain('POINTER');
    expect(text()).not.toContain('deduct');
  });

  it('AC-4.3/AC-4.6: both renderings carry the same title and the same "this is a decision" line', () => {
    component.policy = POLICY;
    fixture.detectChanges();
    const full = text();

    component.policy = null;
    component.compact = true;
    fixture.detectChanges();
    const compact = text();

    for (const line of ['TITLE', 'SOURCE']) {
      expect(full).toContain(line);
      expect(compact).toContain(line);
    }
  });

  it('AC-4.5: there is no dismiss control on either rendering', () => {
    for (const compact of [false, true]) {
      component.compact = compact;
      component.policy = compact ? null : POLICY;
      fixture.detectChanges();

      expect(root().queryAll(By.css('button')).length).toBe(0);
    }
  });

  it('says nothing about the numbers before the policy has loaded, rather than a 0% that would be a lie', () => {
    fixture.detectChanges();

    expect(text()).not.toContain('deduct');
    expect(text()).toContain('TITLE');
  });
});
