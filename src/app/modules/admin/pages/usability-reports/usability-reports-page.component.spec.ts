import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
import { UsabilityReportsPageComponent } from './usability-reports-page.component';
import { UsabilityReportsStore } from './usability-reports.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AdminSharedModule } from '../../admin-shared.module';
import { AdminModalBackdropDirective } from '../../components/admin-modal-backdrop.directive';
import { UsabilityReportPage, UsabilityReportDetail } from '../../../../shared/interfaces/usability-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

describe('UsabilityReportsPageComponent', () => {
  let fixture: ComponentFixture<UsabilityReportsPageComponent>;
  let component: UsabilityReportsPageComponent;
  let storeSpy: jasmine.SpyObj<UsabilityReportsStore> & {
    data$: BehaviorSubject<UsabilityReportPage | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    hasValue: boolean;
  };
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    const dataSubject = new BehaviorSubject<UsabilityReportPage | null>(null);
    const refreshingSubject = new BehaviorSubject<boolean>(false);
    const errorSubject = new BehaviorSubject<boolean>(false);

    storeSpy = jasmine.createSpyObj('UsabilityReportsStore', ['refresh', 'mutate']) as jasmine.SpyObj<UsabilityReportsStore> & {
      data$: BehaviorSubject<UsabilityReportPage | null>;
      refreshing$: BehaviorSubject<boolean>;
      error$: BehaviorSubject<boolean>;
      hasValue: boolean;
    };
    storeSpy.data$ = dataSubject;
    storeSpy.refreshing$ = refreshingSubject;
    storeSpy.error$ = errorSubject;
    storeSpy.hasValue = false;
    storeSpy.refresh.and.returnValue(Promise.resolve());

    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', [
      'getUsabilityReportById',
      'updateUsabilityReportStatus',
    ]);

    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [UsabilityReportsPageComponent, AdminModalBackdropDirective],
      providers: [
        { provide: UsabilityReportsStore, useValue: storeSpy },
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportsPageComponent);
    component = fixture.componentInstance;
  });

  // (d) ngOnInit subscribes to store.data$ and calls store.refresh()
  //     Does NOT call fetch() or any HTTP method directly
  it('should subscribe to store.data$ and call store.refresh() on init — not direct fetch', () => {
    spyOn(storeSpy.data$, 'pipe').and.callThrough();

    fixture.detectChanges(); // triggers ngOnInit

    // store.refresh() must have been called
    expect(storeSpy.refresh)
      .withContext('store.refresh() must be called on init')
      .toHaveBeenCalledTimes(1);

    // adminApiService should NOT have been called directly from ngOnInit
    expect(adminApiServiceSpy.getUsabilityReportById)
      .withContext('No direct HTTP fetch from ngOnInit')
      .not.toHaveBeenCalled();
  });

  // (e) Status update calls store.mutate with a FUNCTION (not a partial object)
  it('should call store.mutate with a transform FUNCTION when saving status', () => {
    const mockPage: UsabilityReportPage = {
      content: [
        {
          id: 'abc-123',
          category: 'bug',
          status: 'new',
          userId: null,
          descriptionPreview: 'Test',
          imageCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      totalElements: 1,
    };

    // Set store data so hasValue is truthy-equivalent
    storeSpy.data$.next(mockPage);
    storeSpy.hasValue = true;
    fixture.detectChanges();

    // Set up the component's detail state
    component['selectedReportId'] = 'abc-123';
    component['selectedDetailStatus'] = 'resolved';

    const mockDetail: UsabilityReportDetail = {
      id: 'abc-123',
      category: 'bug',
      status: 'new',
      userId: null,
      description: 'Full description',
      descriptionPreview: 'Test',
      routeUrl: '/home',
      userAgent: 'test',
      imageCount: 0,
      images: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    const detailResponse: ResponseAPI<UsabilityReportDetail> = {
      code: 200,
      message: 'OK',
      data: mockDetail,
    };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of(detailResponse));
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );

    storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
      // Verify it is called with a FUNCTION, not an object
      expect(typeof transformFn)
        .withContext('mutate must be called with a function, not an object')
        .toBe('function');

      // Verify the function applies the status change correctly
      const result = transformFn(mockPage);
      const updatedReport = result.content.find((r) => r.id === 'abc-123');
      expect(updatedReport?.status)
        .withContext('Transform should update status to resolved')
        .toBe('resolved');
    });

    component.saveStatus();

    expect(storeSpy.mutate)
      .withContext('store.mutate must have been called')
      .toHaveBeenCalledTimes(1);
  });
});
