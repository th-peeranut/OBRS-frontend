import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessageAccessDeniedComponent } from './notification-message-access-denied.component';

describe('NotificationMessageAccessDeniedComponent', () => {
  let fixture: ComponentFixture<NotificationMessageAccessDeniedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageAccessDeniedComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageAccessDeniedComponent);
  });

  it('renders the access-denied block', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-message-access-denied"]')
    ).toBeTruthy();
  });
});
