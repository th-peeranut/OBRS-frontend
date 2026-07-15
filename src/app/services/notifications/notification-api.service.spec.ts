import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { NotificationApiService } from './notification-api.service';

describe('NotificationApiService', () => {
  let service: NotificationApiService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/api/private/notifications`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [NotificationApiService],
    });

    service = TestBed.inject(NotificationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getNotifications() hits GET /api/private/notifications with page/size/unreadOnly params', () => {
    service.getNotifications({ unreadOnly: false, page: 0, size: 10 }).subscribe();

    const req = httpMock.expectOne(
      (request) => request.method === 'GET' && request.url === baseUrl
    );
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.params.get('unreadOnly')).toBe('false');
    req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0, size: 10, number: 0, numberOfElements: 0 } });
  });

  it('getNotifications() omits unreadOnly when not provided', () => {
    service.getNotifications({ page: 1, size: 5 }).subscribe();

    const req = httpMock.expectOne((request) => request.method === 'GET' && request.url === baseUrl);
    expect(req.request.params.has('unreadOnly')).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0, size: 5, number: 1, numberOfElements: 0 } });
  });

  it('getUnreadCount() hits GET /unread-count', () => {
    service.getUnreadCount().subscribe((response) => {
      expect(response.data?.unreadCount).toBe(3);
    });

    const req = httpMock.expectOne(`${baseUrl}/unread-count`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { unreadCount: 3 } });
  });

  it('markRead() posts to /{id}/read', () => {
    service.markRead(42).subscribe((response) => {
      expect(response.data?.read).toBeTrue();
    });

    const req = httpMock.expectOne(`${baseUrl}/42/read`);
    expect(req.request.method).toBe('POST');
    req.flush({ code: 200, message: 'OK', data: { id: 42, readAt: '2026-07-14T08:00:00+07:00', read: true } });
  });

  it('markAllRead() posts to /read-all', () => {
    service.markAllRead().subscribe((response) => {
      expect(response.data?.updatedCount).toBe(4);
    });

    const req = httpMock.expectOne(`${baseUrl}/read-all`);
    expect(req.request.method).toBe('POST');
    req.flush({ code: 200, message: 'OK', data: { updatedCount: 4 } });
  });
});
