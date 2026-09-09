import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from '../../../auth/auth.service';
import { RolePreviewBannerComponent } from './role-preview-banner.component';

/**
 * OBRS-1721 — AC-4. The strip is what keeps the preview honest: it names the
 * role being previewed AND says the data on screen is still the viewer's own,
 * which is true because the backend scopes by identity, not by role.
 *
 * The copy is asserted through a real translation set rather than raw keys —
 * "ข้อมูลยังเป็นของบัญชีคุณเอง" is the sentence the card locked, and a key that
 * renders as its own name is exactly the silent failure this has to catch.
 */
describe('RolePreviewBannerComponent (OBRS-1721)', () => {
  let fixture: ComponentFixture<RolePreviewBannerComponent>;
  let auth: AuthService;

  const TH = {
    ROLE_PREVIEW: {
      ARIA_LABEL: 'กำลังดูหน้าจอในมุมมองของบทบาทอื่น',
      VIEWING_AS: 'กำลังดูในมุมมองของ: {{role}}',
      OWN_DATA: 'ข้อมูลยังเป็นของบัญชีคุณเอง',
      EXIT: 'ออกจากมุมมองนี้',
      ROLES: { SALESPERSON: 'พนักงานขายตั๋ว' },
    },
  };

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.role-preview-banner');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RolePreviewBannerComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('th', TH);
    translate.use('th');

    auth = TestBed.inject(AuthService);
    spyOn(auth, 'getHeldRoles').and.returnValue(['owner']);

    fixture = TestBed.createComponent(RolePreviewBannerComponent);
    fixture.detectChanges();
  });

  it('renders NOTHING when no preview is running', () => {
    // Absent from the DOM, not merely hidden — it must not take a row of height
    // on every page of the app for everyone who never previews.
    expect(banner()).toBeNull();
  });

  it('names the previewed role and says the data is still the viewer’s own', () => {
    auth.startRolePreview('salesperson');
    fixture.detectChanges();

    const text = banner()?.textContent ?? '';
    expect(text).toContain('พนักงานขายตั๋ว');
    expect(text).toContain('ข้อมูลยังเป็นของบัญชีคุณเอง');
  });

  it('exits the preview from its own button, and disappears with it', () => {
    auth.startRolePreview('salesperson');
    fixture.detectChanges();

    const exit = fixture.nativeElement.querySelector(
      '.role-preview-banner__exit',
    ) as HTMLButtonElement;
    exit.click();
    fixture.detectChanges();

    expect(auth.getPreviewRole()).toBeNull();
    expect(banner()).toBeNull();
  });
});
