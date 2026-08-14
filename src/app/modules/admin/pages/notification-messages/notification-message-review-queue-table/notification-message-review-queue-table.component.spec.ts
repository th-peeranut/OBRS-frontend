import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessageReviewQueueTableComponent } from './notification-message-review-queue-table.component';

describe('NotificationMessageReviewQueueTableComponent', () => {
  let fixture: ComponentFixture<NotificationMessageReviewQueueTableComponent>;
  let component: NotificationMessageReviewQueueTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageReviewQueueTableComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageReviewQueueTableComponent);
    component = fixture.componentInstance;
  });

  it('renders one row per pending review', () => {
    component.rows = [
      { id: 1, messageCode: 'x', notificationType: 'Y', locale: 'th', proposedBy: 'owner1', proposedAt: '2026-08-13T00:00:00Z' },
    ];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('emits openReview with the row id', () => {
    component.rows = [
      { id: 7, messageCode: 'x', notificationType: 'Y', locale: 'th', proposedBy: 'owner1', proposedAt: '2026-08-13T00:00:00Z' },
    ];
    fixture.detectChanges();
    const openSpy = jasmine.createSpy('openReview');
    component.openReview.subscribe(openSpy);

    fixture.nativeElement.querySelector('[data-testid="notification-message-review-open"]').click();

    expect(openSpy).toHaveBeenCalledWith(7);
  });

  it('shows the empty row when there are no rows', () => {
    component.rows = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-empty-row')).toBeTruthy();
  });
});
