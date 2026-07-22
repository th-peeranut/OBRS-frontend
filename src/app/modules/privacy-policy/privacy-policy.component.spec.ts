import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PrivacyPolicyComponent } from './privacy-policy.component';
import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from './privacy-policy.version';

/**
 * OBRS-628 AC-3. The privacy notice used to render a title and two paragraphs and
 * nothing else — no version, no date. Consent is only meaningful against a specific
 * text, so with no stamp on the page nothing could answer "which wording did this
 * customer agree to?", and the wording could be changed with no trace.
 *
 * These specs cover the wiring only. That the version is BUMPED when the text
 * changes cannot be asserted from inside the app (the spec would just read the
 * same two constants the page does) — that half is enforced by the append-only
 * ledger and the Thai-text fingerprint in scripts/check-i18n-parity.mjs.
 */
describe('PrivacyPolicyComponent', () => {
  let fixture: ComponentFixture<PrivacyPolicyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PrivacyPolicyComponent],
      imports: [TranslateModule.forRoot()],
      // app-navbar / app-footer are covered by their own specs.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('th', {
      POLICY: {
        PRIVACY: {
          TITLE: 'privacy',
          CONTENT_1: 'one',
          CONTENT_2: 'two',
          VERSION_LINE: 'v={{version}} d={{effectiveDate}}',
        },
      },
    });
    translate.use('th');

    fixture = TestBed.createComponent(PrivacyPolicyComponent);
    fixture.detectChanges();
  });

  function versionText(): string {
    const el: HTMLElement | null = fixture.nativeElement.querySelector(
      '[data-testid="privacy-policy-version"]'
    );
    return (el?.textContent ?? '').trim();
  }

  it('renders a version stamp on the page', () => {
    expect(versionText()).not.toBe('');
  });

  it('feeds the version and effective date into the sentence as parameters', () => {
    // Not just "the numbers appear somewhere": both must arrive as named params,
    // because that is what stops the date being re-typed into three locale files
    // and drifting into three different dates.
    expect(versionText()).toBe(
      `v=${PRIVACY_POLICY_VERSION} d=${PRIVACY_POLICY_EFFECTIVE_DATE}`
    );
  });

  it('states a version and a date that are actually filled in', () => {
    // Guards against the placeholders being wired to empty constants, which would
    // render "v= d=" and still pass a looser assertion.
    expect(PRIVACY_POLICY_VERSION).toMatch(/^\d+\.\d+$/);
    expect(PRIVACY_POLICY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
