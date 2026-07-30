import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { MyReportDetailModalComponent } from './my-report-detail-modal.component';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import {
  MyUsabilityReportDetail,
  MyUsabilityReportSummary,
} from '../../../../shared/interfaces/usability-report.interface';

describe('MyReportDetailModalComponent', () => {
  let fixture: ComponentFixture<MyReportDetailModalComponent>;
  let component: MyReportDetailModalComponent;
  let serviceSpy: jasmine.SpyObj<UsabilityReportService>;

  const summary: MyUsabilityReportSummary = {
    id: 1,
    category: 'bug',
    status: 'new',
    descriptionPreview: 'Preview text',
    imageCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const detail: MyUsabilityReportDetail = {
    id: 1,
    category: 'bug',
    status: 'new',
    description: 'Full description',
    routeUrl: '/home',
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    triageNote: null,
    editable: true,
    followUps: [],
  };

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('UsabilityReportService', ['getMyReportById']);
    serviceSpy.getMyReportById.and.returnValue(of({ code: 200, message: 'OK', data: detail }));

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [MyReportDetailModalComponent],
      providers: [{ provide: UsabilityReportService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyReportDetailModalComponent);
    component = fixture.componentInstance;
    component.summary = summary;
  });

  it('opens optimistically: detail is seeded from the summary row SYNCHRONOUSLY before the GET resolves', () => {
    // A Subject that hasn't emitted yet — the real GET always resolves
    // asynchronously (an HTTP round-trip); `of(...)` would resolve
    // synchronously inside ngOnInit() and defeat the point of this spec.
    const notYetResolved = new Subject<{ code: number; message: string; data: MyUsabilityReportDetail }>();
    serviceSpy.getMyReportById.and.returnValue(notYetResolved.asObservable());

    component.ngOnInit();

    expect(component['detail']).withContext('must be seeded, not null, immediately').not.toBeNull();
    expect(component['detail']?.id).toBe(1);
    expect(component['detail']?.description).toBe('Preview text');
    expect(component['isDetailFetching']).toBeTrue();
  });

  it('patches in the real detail once the background GET resolves', () => {
    fixture.detectChanges();
    expect(component['detail']?.description).toBe('Full description');
    expect(component['isDetailFetching']).toBeFalse();
  });

  it('keeps the optimistic fallback (does not null it out) when the background GET fails', () => {
    serviceSpy.getMyReportById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();

    expect(component['detail']).not.toBeNull();
    expect(component['isDetailFetching']).toBeFalse();
  });

  it('close() emits the closed output', () => {
    const spy = jasmine.createSpy();
    component.closed.subscribe(spy);
    component['close']();
    expect(spy).toHaveBeenCalled();
  });

  it('startEdit()/cancelEdit() toggle isEditing once the real detail has loaded', () => {
    fixture.detectChanges(); // synchronous of(detail) mock -> realDetailLoaded true
    expect(component['isEditing']).toBeFalse();
    component['startEdit']();
    expect(component['isEditing']).toBeTrue();
    component['cancelEdit']();
    expect(component['isEditing']).toBeFalse();
  });

  // ── Scrutinize fix: edit can never start off the optimistic fallback ──────

  it('realDetailLoaded stays false while the fallback is showing (before the GET resolves)', () => {
    const notYetResolved = new Subject<{ code: number; message: string; data: MyUsabilityReportDetail }>();
    serviceSpy.getMyReportById.and.returnValue(notYetResolved.asObservable());

    component.ngOnInit();

    expect(component['realDetailLoaded']).toBeFalse();
  });

  it('startEdit() is a NO-OP while realDetailLoaded is false (blocks editing off the truncated preview)', () => {
    const notYetResolved = new Subject<{ code: number; message: string; data: MyUsabilityReportDetail }>();
    serviceSpy.getMyReportById.and.returnValue(notYetResolved.asObservable());
    component.ngOnInit();

    // Sanity: still the fallback (truncated preview), not the real description.
    expect(component['detail']?.description).toBe('Preview text');

    component['startEdit']();

    expect(component['isEditing'])
      .withContext('startEdit() must be a no-op while realDetailLoaded is false')
      .toBeFalse();
  });

  it('the Edit button is disabled in the template while the real detail has not loaded yet', () => {
    const notYetResolved = new Subject<{ code: number; message: string; data: MyUsabilityReportDetail }>();
    serviceSpy.getMyReportById.and.returnValue(notYetResolved.asObservable());
    fixture.detectChanges();

    const editButton: HTMLButtonElement = fixture.nativeElement.querySelector('.mr-btn-primary');
    expect(editButton).withContext('Edit button renders (fallback status looks editable)').not.toBeNull();
    expect(editButton.disabled).withContext('must be disabled until real detail has loaded').toBeTrue();

    editButton.click();
    expect(component['isEditing']).withContext('a disabled-button click must not start editing').toBeFalse();
  });

  it('realDetailLoaded flips true once the real GET resolves, enabling the Edit button', () => {
    const resolvesLater = new Subject<{ code: number; message: string; data: MyUsabilityReportDetail }>();
    serviceSpy.getMyReportById.and.returnValue(resolvesLater.asObservable());
    fixture.detectChanges();

    let editButton: HTMLButtonElement = fixture.nativeElement.querySelector('.mr-btn-primary');
    expect(editButton.disabled).toBeTrue();

    resolvesLater.next({ code: 200, message: 'OK', data: detail });
    fixture.detectChanges();

    expect(component['realDetailLoaded']).toBeTrue();
    editButton = fixture.nativeElement.querySelector('.mr-btn-primary');
    expect(editButton.disabled).toBeFalse();

    editButton.click();
    expect(component['isEditing']).toBeTrue();
    // The edit path is now seeded from the REAL detail, never the fallback's
    // truncated `descriptionPreview` — the caller (MyReportEditFormComponent)
    // reads `this.detail.description`, and `this.detail` is the real object
    // by the time editing becomes reachable at all.
    expect(component['detail']?.description).toBe('Full description');
  });

  it('startEdit() stays blocked PERMANENTLY after a GET error (fails closed, not open)', () => {
    serviceSpy.getMyReportById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();

    expect(component['isDetailFetching']).toBeFalse();
    expect(component['realDetailLoaded'])
      .withContext('a failed fetch must never flip this true')
      .toBeFalse();

    component['startEdit']();
    expect(component['isEditing']).toBeFalse();

    const editButton: HTMLButtonElement = fixture.nativeElement.querySelector('.mr-btn-primary');
    expect(editButton.disabled).toBeTrue();
  });

  it('onEditSaved() replaces detail, exits edit mode, and emits reportUpdated with a truncated preview', () => {
    fixture.detectChanges();
    component['startEdit']();
    const emitted: unknown[] = [];
    component.reportUpdated.subscribe((v) => emitted.push(v));

    const updated: MyUsabilityReportDetail = {
      ...detail,
      category: 'suggestion',
      description: 'Updated description',
      images: [{ id: 1, publicUrl: 'x', contentType: 'image/png', sizeBytes: 1, position: 1 }],
    };
    component['onEditSaved'](updated);

    expect(component['detail']).toEqual(updated);
    expect(component['isEditing']).toBeFalse();
    expect(emitted).toEqual([
      { id: 1, category: 'suggestion', descriptionPreview: 'Updated description', imageCount: 1 },
    ]);
  });

  it('onEditStale() exits edit mode and RE-FETCHES the detail', () => {
    fixture.detectChanges();
    component['startEdit']();
    serviceSpy.getMyReportById.calls.reset();
    serviceSpy.getMyReportById.and.returnValue(
      of({ code: 200, message: 'OK', data: { ...detail, editable: false, status: 'in_review' } })
    );

    component['onEditStale']();

    expect(component['isEditing']).toBeFalse();
    expect(serviceSpy.getMyReportById).toHaveBeenCalledWith(1);
    expect(component['detail']?.editable).toBeFalse();
  });

  it('onFollowUpPending() sets the pending entry, onFollowUpAdded() clears it and appends the real follow-up', () => {
    fixture.detectChanges();
    component['onFollowUpPending']({ note: 'typing...', thumbnailUrls: [] });
    expect(component['pendingFollowUp']).toEqual({ note: 'typing...', thumbnailUrls: [] });

    component['onFollowUpAdded']({
      id: 1,
      note: 'typing...',
      authorUserId: 7,
      authorName: 'me',
      createdAt: '2026-01-01T00:00:00Z',
      images: [],
    });

    expect(component['pendingFollowUp']).toBeNull();
    expect(component['detail']?.followUps.length).toBe(1);
  });

  it('onFollowUpFailed() clears the pending entry without touching the real followUps list', () => {
    fixture.detectChanges();
    component['onFollowUpPending']({ note: 'typing...', thumbnailUrls: [] });
    component['onFollowUpFailed']();

    expect(component['pendingFollowUp']).toBeNull();
    expect(component['detail']?.followUps.length).toBe(0);
  });

  it('cleans up on destroy without throwing', () => {
    fixture.detectChanges();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
