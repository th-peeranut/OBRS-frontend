import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { OperationsPolicyService } from './operations-policy.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('OperationsPolicyService', () => {
  let service: OperationsPolicyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperationsPolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the public operations-policy endpoint (no /private, no token requirement)', () => {
    let result: { noShowCutoffMinutes: number } | undefined;

    service.getOperationsPolicy().subscribe((response) => {
      result = response.data;
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/operations-policy`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { noShowCutoffMinutes: 5 } });

    expect(result).toEqual({ noShowCutoffMinutes: 5 });
  });

  it('opts out of the global loading overlay and the global error modal', () => {
    service.getOperationsPolicy().subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/operations-policy`);
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();

    req.flush({ code: 200, message: 'OK', data: { noShowCutoffMinutes: 5 } });
  });
});
