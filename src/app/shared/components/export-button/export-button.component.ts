import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import { ExportError, ExportFormat, ExportService } from '../../../services/export/export.service';
import { mapApiErrorCode } from '../../lib/api-error-code';

const ERROR_CODE_TO_I18N_KEY: Record<string, string> = {
  EXPORT_ERROR_ACCESS_DENIED: 'COMMON.EXPORT.ERROR_ACCESS_DENIED',
  EXPORT_ERROR_UNKNOWN_DATASET: 'COMMON.EXPORT.ERROR_UNKNOWN_DATASET',
  EXPORT_ERROR_UNSUPPORTED_FORMAT: 'COMMON.EXPORT.ERROR_UNSUPPORTED_FORMAT',
  EXPORT_ERROR_ROW_LIMIT_EXCEEDED: 'COMMON.EXPORT.ERROR_ROW_LIMIT_EXCEEDED',
};
const GENERIC_ERROR_KEY = 'COMMON.EXPORT.ERROR_GENERIC';

/**
 * Presentational, self-sufficient export trigger. Renders a secondary button
 * (never `admin-btn-primary` — exporting is a supporting action, not the
 * screen's primary one) that opens a `p-menu` popup with CSV / Excel options.
 *
 * Role-gated by `requiredRole`: hidden (not disabled) when the current user
 * lacks the role, matching the staff-layout/navbar precedent — see
 * `docs/adr/0001-export-button-component.md`.
 *
 * No NgRx: the export itself is a one-shot side effect (file download) with
 * no cross-page state to share, so local `loading` is sufficient.
 */
@Component({
  selector: 'app-export-button',
  templateUrl: './export-button.component.html',
  styleUrl: './export-button.component.scss',
})
export class ExportButtonComponent implements OnInit, OnDestroy {
  @Input() datasetKey!: string;
  @Input() requiredRole!: string;
  @Input() params: Record<string, string> = {};

  protected loading = false;
  protected canExport = false;
  protected menuItems: MenuItem[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly exportService: ExportService,
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.canExport = this.authService.hasAnyRole([this.requiredRole]);
    this.menuItems = [
      {
        label: this.translate.instant('COMMON.EXPORT.FORMAT_CSV'),
        command: () => this.doExport('csv'),
      },
      {
        label: this.translate.instant('COMMON.EXPORT.FORMAT_XLSX'),
        command: () => this.doExport('xlsx'),
      },
    ];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected doExport(format: ExportFormat): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.exportService
      .export(this.datasetKey, format, this.params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        // Success is silent — the browser download itself is the
        // confirmation; a toast on top would be redundant (§ ADR 0001).
        next: () => {
          this.loading = false;
        },
        error: (err: ExportError) => {
          this.loading = false;
          this.alertService.error(this.translate.instant(this.mapErrorCode(err?.errorCode)));
        },
      });
  }

  private mapErrorCode(errorCode: string | undefined): string {
    return mapApiErrorCode(errorCode, ERROR_CODE_TO_I18N_KEY, GENERIC_ERROR_KEY);
  }
}
