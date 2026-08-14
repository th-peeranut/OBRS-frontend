import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { NotificationMessagesTabPageComponent } from './notification-messages-tab-page.component';

/**
 * AC5 UX-only companion — this hide is NOT the security boundary (the queue/
 * detail pages repeat the raw getRoles() gate themselves for a direct
 * deep-link), it only avoids showing an owner a tab that would 403 on click.
 */
describe('NotificationMessagesTabPageComponent', () => {
  async function renderFor(roles: string[]): Promise<ComponentFixture<NotificationMessagesTabPageComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [NotificationMessagesTabPageComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    spyOn(TestBed.inject(AuthService), 'getRoles').and.returnValue(roles);

    const fixture = TestBed.createComponent(NotificationMessagesTabPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('hides the "Pending review" sub-nav link from a plain owner', async () => {
    const fixture = await renderFor(['owner']);
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-messages-subnav-reviews"]')
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-messages-subnav-messages"]')
    ).toBeTruthy();
  });

  it('shows the "Pending review" sub-nav link to an admin', async () => {
    const fixture = await renderFor(['admin']);
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-messages-subnav-reviews"]')
    ).toBeTruthy();
  });
});
