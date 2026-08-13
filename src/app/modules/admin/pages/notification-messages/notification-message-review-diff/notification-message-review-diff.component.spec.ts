import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessageReviewDiffComponent } from './notification-message-review-diff.component';

describe('NotificationMessageReviewDiffComponent', () => {
  let fixture: ComponentFixture<NotificationMessageReviewDiffComponent>;
  let component: NotificationMessageReviewDiffComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageReviewDiffComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageReviewDiffComponent);
    component = fixture.componentInstance;
  });

  it('renders both the old and the new body', () => {
    component.oldBody = 'old text';
    component.newBody = 'new text';
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-message-review-old"]').textContent
    ).toContain('old text');
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-message-review-new"]').textContent
    ).toContain('new text');
  });

  it('shows the placeholder hint only when indices are present', () => {
    component.oldBody = 'a';
    component.newBody = 'b {0}';
    component.placeholderIndices = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-hint')).toBeNull();

    component.placeholderIndices = [0];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-hint')).toBeTruthy();
  });
});
