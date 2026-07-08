import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SKIP_GLOBAL_ERROR_ALERT } from '../../shared/interceptors/http-context-tokens';

export type ExportFormat = 'csv' | 'xlsx';

/** Thrown/emitted on the error channel of `ExportService.export()`. Components
 *  branch on `errorCode` (stable UPPER_SNAKE from the backend) — never on a
 *  localized message (design-system.md §9). */
export interface ExportError {
  errorCode: string;
}

const GENERIC_ERROR_CODE = 'EXPORT_ERROR_GENERIC';

/**
 * Thin client for the generic backend export endpoint
 * (`GET /api/private/exports/{datasetKey}`). Success responses are raw file
 * bytes; this service saves them to disk via the blob -> object URL -> hidden
 * `<a download>` pattern already used elsewhere in the app (see
 * `bookings-page.component.ts#exportCsv`), so no new library is introduced.
 *
 * Errors arrive with `responseType: 'blob'`, so the error body is itself a
 * Blob (the global `errorInterceptor` cannot read it) — `SKIP_GLOBAL_ERROR_ALERT`
 * is set and the Blob is parsed locally into a stable `errorCode` the caller
 * can map to a localized message.
 */
@Injectable({
  providedIn: 'root',
})
export class ExportService {
  constructor(private readonly http: HttpClient) {}

  export(
    datasetKey: string,
    format: ExportFormat,
    params: Record<string, string>
  ): Observable<void> {
    const httpParams = new HttpParams({ fromObject: { ...params, format } });

    return this.http
      .get(`${environment.apiUrl}/api/private/exports/${datasetKey}`, {
        params: httpParams,
        responseType: 'blob',
        observe: 'response',
        context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true),
      })
      .pipe(
        // catchError sits directly on the raw HTTP source so it only ever
        // converts a transport-level failure; it must not also swallow the
        // synthetic "empty body" failure raised by handleSuccessResponse below.
        catchError((error: HttpErrorResponse) => this.toExportError(error)),
        mergeMap((response: HttpResponse<Blob>) =>
          this.handleSuccessResponse(response, datasetKey, format)
        )
      );
  }

  private handleSuccessResponse(
    response: HttpResponse<Blob>,
    datasetKey: string,
    format: ExportFormat
  ): Observable<void> {
    const blob = response.body;
    if (!blob) {
      return throwError(() => ({ errorCode: GENERIC_ERROR_CODE } as ExportError));
    }

    const filename =
      this.parseFilename(response.headers.get('Content-Disposition')) ??
      `${datasetKey}-${format}`;
    this.saveBlob(blob, filename);
    return of(undefined);
  }

  /** Converts a failed export request into an `ExportError` on the error
   *  channel. The body is a Blob (responseType: 'blob' applies to errors too),
   *  so it must be read asynchronously as text before it can be JSON-parsed. */
  private toExportError(error: HttpErrorResponse): Observable<never> {
    const errorBody: unknown = error.error;

    if (!(errorBody instanceof Blob)) {
      return throwError(() => ({ errorCode: GENERIC_ERROR_CODE } as ExportError));
    }

    return from(errorBody.text()).pipe(
      mergeMap((text) => throwError(() => this.parseErrorBody(text)))
    );
  }

  private parseErrorBody(text: string): ExportError {
    try {
      const parsed: unknown = JSON.parse(text);
      const errorCode =
        typeof (parsed as { errorCode?: unknown })?.errorCode === 'string' &&
        (parsed as { errorCode: string }).errorCode.length > 0
          ? (parsed as { errorCode: string }).errorCode
          : GENERIC_ERROR_CODE;
      return { errorCode };
    } catch {
      return { errorCode: GENERIC_ERROR_CODE };
    }
  }

  /** Parses `filename="..."` or the RFC 5987 `filename*=UTF-8''...` form from
   *  a Content-Disposition header. Returns null if neither is present. */
  private parseFilename(header: string | null): string | null {
    if (!header) {
      return null;
    }

    const encodedMatch = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
    if (encodedMatch) {
      try {
        return decodeURIComponent(encodedMatch[1].trim());
      } catch {
        return encodedMatch[1].trim();
      }
    }

    const plainMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
    return plainMatch ? plainMatch[1].trim() : null;
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
