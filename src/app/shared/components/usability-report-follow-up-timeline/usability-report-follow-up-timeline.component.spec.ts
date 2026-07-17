import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { UsabilityReportFollowUpTimelineComponent } from './usability-report-follow-up-timeline.component';
import { UsabilityReportFollowUp } from '../../interfaces/usability-report.interface';

describe('UsabilityReportFollowUpTimelineComponent', () => {
  let fixture: ComponentFixture<UsabilityReportFollowUpTimelineComponent>;
  let component: UsabilityReportFollowUpTimelineComponent;

  const followUps: UsabilityReportFollowUp[] = [
    {
      id: 1,
      note: 'First note',
      authorUserId: 7,
      authorName: 'reporter@example.com',
      createdAt: '2026-01-01T00:00:00Z',
      images: [
        { id: '1', publicUrl: 'https://x/1.png', contentType: 'image/png', sizeBytes: 100, position: 1 },
      ],
    },
    {
      id: 2,
      note: 'Admin reply',
      authorUserId: 1,
      authorName: 'admin@system.local',
      createdAt: '2026-01-02T00:00:00Z',
      images: [],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [UsabilityReportFollowUpTimelineComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportFollowUpTimelineComponent);
    component = fixture.componentInstance;
  });

  it('renders the empty state when there are no follow-ups', () => {
    component.followUps = [];
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.ur-follow-up-timeline__empty');
    expect(empty).withContext('empty-state text must render').not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.ur-follow-up-timeline__item').length).toBe(0);
  });

  it('renders one item per follow-up with author, timestamp, and note text', () => {
    component.followUps = followUps;
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.ur-follow-up-timeline__item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.ur-follow-up-timeline__author').textContent).toContain('reporter@example.com');
    expect(items[0].querySelector('.ur-follow-up-timeline__note').textContent).toContain('First note');
  });

  it('renders image thumbnails only for a follow-up that has images', () => {
    component.followUps = followUps;
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.ur-follow-up-timeline__item');
    expect(items[0].querySelectorAll('.ur-follow-up-timeline__thumb').length).toBe(1);
    expect(items[1].querySelectorAll('.ur-follow-up-timeline__thumb').length).toBe(0);
  });

  it('renders no status/role chip inside the timeline (it is a plain text+author+timestamp list only)', () => {
    component.followUps = followUps;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-status')).toBeNull();
  });

  // OBRS-433: pendingEntry is optional/null-default — the admin caller never
  // sets it, so its absence must render byte-identical to before.
  it('pendingEntry defaults to null and renders nothing extra when unset', () => {
    component.followUps = followUps;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.ur-follow-up-timeline__item').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.is-pending')).toBeNull();
  });

  it('renders a pending placeholder item with a spinner and the typed note when pendingEntry is set', () => {
    component.followUps = [];
    component.pendingEntry = { note: 'still typing this one', thumbnailUrls: ['blob:x'] };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ur-follow-up-timeline__empty')).toBeNull();
    const pending = fixture.nativeElement.querySelector('.is-pending');
    expect(pending).withContext('pending item must render').not.toBeNull();
    expect(pending.querySelector('.ur-follow-up-timeline__spinner')).not.toBeNull();
    expect(pending.textContent).toContain('still typing this one');
    expect(pending.querySelectorAll('.ur-follow-up-timeline__thumb').length).toBe(1);
  });
});
