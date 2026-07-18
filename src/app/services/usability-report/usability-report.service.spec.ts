import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UsabilityReportService } from './usability-report.service';
import { environment } from '../../../environments/environment';
import {
  MyUsabilityReportDetail,
  MyUsabilityReportPage,
  UsabilityReportFollowUp,
} from '../../shared/interfaces/usability-report.interface';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

// OBRS-433: the service previously had no spec at all (submitReport shipped
// without one) — this covers the pre-existing public endpoint plus the four
// new private "My Reports" methods.
describe('UsabilityReportService', () => {
  let service: UsabilityReportService;
  let httpMock: HttpTestingController;

  const baseUrl = `${environment.apiUrl}/api/private/usability-reports`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(UsabilityReportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('submitReport POSTs to the public endpoint with the FormData body untouched', () => {
    const formData = new FormData();
    formData.append('category', 'bug');

    service.submitReport(formData).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/usability-reports`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(formData);
    req.flush({ id: 'rep-1', category: 'bug', status: 'new', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' });
  });

  it('getMyReports GETs the private endpoint with page/size/sort query params', () => {
    const page: MyUsabilityReportPage = {
      content: [],
      totalElements: 0,
      totalPages: 0,
      size: 20,
      number: 0,
      numberOfElements: 0,
    };

    service.getMyReports(0, 20, 'createdAt,desc').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === baseUrl && r.params.get('page') === '0' && r.params.get('size') === '20' && r.params.get('sort') === 'createdAt,desc'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: page });
  });

  it('getMyReportById GETs /{id}', () => {
    const detail: MyUsabilityReportDetail = {
      id: 42,
      category: 'bug',
      status: 'new',
      description: 'desc',
      routeUrl: '/home',
      images: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      triageNote: null,
      editable: true,
      followUps: [],
    };

    service.getMyReportById(42).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/42`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: detail });
  });

  it('updateMyReport PATCHes /{id} with the FormData body untouched', () => {
    const formData = new FormData();
    formData.append('category', 'bug');
    formData.append('description', 'updated');

    service.updateMyReport(42, formData).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/42`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toBe(formData);
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('addFollowUp POSTs /{id}/follow-ups with the FormData body untouched', () => {
    const formData = new FormData();
    formData.append('note', 'a follow-up note');
    const followUp: UsabilityReportFollowUp = {
      id: 1,
      note: 'a follow-up note',
      authorUserId: 7,
      authorName: 'me@example.com',
      createdAt: '2026-01-01T00:00:00Z',
      images: [],
    };

    service.addFollowUp(42, formData).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/42/follow-ups`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(formData);
    req.flush({ code: 201, message: 'Created', data: followUp });
  });

  it('never sets SKIP_AUTH_LOGOUT on the private "My Reports" calls (a real 401 must still force logout)', () => {
    service.getMyReports(0, 20, 'createdAt,desc').subscribe();
    const req = httpMock.expectOne(() => true);
    // SKIP_AUTH_LOGOUT's HttpContextToken default is `false` — asserting the
    // resolved value (not mere presence) confirms the service never opts a
    // private call out of the auth.interceptor's force-logout-on-401 path.
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: null });
  });
});
