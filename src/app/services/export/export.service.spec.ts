import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ExportService, ExportError } from './export.service';

function createHttpStub(response: unknown): any {
  return {
    get: () =>
      response instanceof HttpErrorResponse ? throwError(() => response) : of(response),
  };
}

describe('ExportService', () => {
  let createObjectURLSpy: jasmine.Spy;
  let revokeObjectURLSpy: jasmine.Spy;
  let anchorStub: { href: string; download: string; click: jasmine.Spy };
  let createElementSpy: jasmine.Spy;

  beforeEach(() => {
    anchorStub = { href: '', download: '', click: jasmine.createSpy('click') };
    createObjectURLSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-url');
    revokeObjectURLSpy = spyOn(URL, 'revokeObjectURL');
    createElementSpy = spyOn(document, 'createElement').and.returnValue(
      anchorStub as unknown as HTMLElement
    );
  });

  it('should create', () => {
    const service = new ExportService(createHttpStub({}));
    expect(service).toBeTruthy();
  });

  it('parses the filename from a plain Content-Disposition header and saves the blob', (done) => {
    const blob = new Blob(['a,b,c'], { type: 'text/csv' });
    const response = new HttpResponse({
      body: blob,
      headers: new HttpHeaders({
        'Content-Disposition': 'attachment; filename="bookings-2026-07-08.csv"',
      }),
      status: 200,
    });
    const service = new ExportService(createHttpStub(response));

    service.export('bookings', 'csv', {}).subscribe({
      next: () => {
        expect(createElementSpy).toHaveBeenCalledWith('a');
        expect(anchorStub.download).toBe('bookings-2026-07-08.csv');
        expect(anchorStub.href).toBe('blob:fake-url');
        expect(anchorStub.click).toHaveBeenCalled();
        expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
        done();
      },
      error: done.fail,
    });
  });

  it('parses the RFC 5987 encoded filename* form', (done) => {
    const blob = new Blob(['a,b,c'], { type: 'text/csv' });
    const response = new HttpResponse({
      body: blob,
      headers: new HttpHeaders({
        'Content-Disposition': "attachment; filename*=UTF-8''bookings%20report.csv",
      }),
      status: 200,
    });
    const service = new ExportService(createHttpStub(response));

    service.export('bookings', 'csv', {}).subscribe({
      next: () => {
        expect(anchorStub.download).toBe('bookings report.csv');
        done();
      },
      error: done.fail,
    });
  });

  it('falls back to `${datasetKey}-${format}` when no Content-Disposition header is present', (done) => {
    const blob = new Blob(['a,b,c'], { type: 'text/csv' });
    const response = new HttpResponse({ body: blob, headers: new HttpHeaders(), status: 200 });
    const service = new ExportService(createHttpStub(response));

    service.export('bookings', 'xlsx', {}).subscribe({
      next: () => {
        expect(anchorStub.download).toBe('bookings-xlsx');
        done();
      },
      error: done.fail,
    });
  });

  it('rejects with the parsed errorCode when the error body is a JSON blob', (done) => {
    const errorBlob = new Blob([JSON.stringify({ errorCode: 'EXPORT_ERROR_ACCESS_DENIED' })], {
      type: 'application/json',
    });
    const httpError = new HttpErrorResponse({ error: errorBlob, status: 403 });
    const service = new ExportService(createHttpStub(httpError));

    service.export('bookings', 'csv', {}).subscribe({
      next: () => done.fail('expected an error'),
      error: (err: ExportError) => {
        expect(err.errorCode).toBe('EXPORT_ERROR_ACCESS_DENIED');
        done();
      },
    });
  });

  it('rejects with a generic errorCode when the error blob is not valid JSON', (done) => {
    const errorBlob = new Blob(['not json'], { type: 'text/plain' });
    const httpError = new HttpErrorResponse({ error: errorBlob, status: 500 });
    const service = new ExportService(createHttpStub(httpError));

    service.export('bookings', 'csv', {}).subscribe({
      next: () => done.fail('expected an error'),
      error: (err: ExportError) => {
        expect(err.errorCode).toBe('EXPORT_ERROR_GENERIC');
        done();
      },
    });
  });

  it('rejects with a generic errorCode when the error body is not a Blob at all', (done) => {
    const httpError = new HttpErrorResponse({ error: null, status: 0 });
    const service = new ExportService(createHttpStub(httpError));

    service.export('bookings', 'csv', {}).subscribe({
      next: () => done.fail('expected an error'),
      error: (err: ExportError) => {
        expect(err.errorCode).toBe('EXPORT_ERROR_GENERIC');
        done();
      },
    });
  });
});
