import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminLookupDto,
  AdminStopLookupDto,
  AdminStopSummaryDto,
  getAdminLookupLabel,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  StopDetailForm,
  StopRow,
  filterStopRows,
  toStopDetailForm,
  toStopRow,
  toStopUpdatePayload,
} from './stops.mappers';

interface Option {
  code: string;
  label: string;
}

/**
 * OBRS-1022: the owner's stop management screen — the first one this product has ever had.
 *
 * <p><b>Why it exists.</b> Every stop's photo on the route map came from a seed script or the
 * Google Places backfill, and its "detail" line was a fixed i18n label naming the province. An
 * owner had no way to put a real photo of the spot the van waits at, and no way to write the one
 * sentence that actually helps a customer find it ("opposite the mobile phone shop"). Both are
 * content only the owner can produce, so both need a screen — this one.
 *
 * <p><b>The photo is not part of the form.</b> `PUT /private/stops/{id}` is a full-replace, and
 * the photo is written by two separate multipart calls. If the form posted the photo URL back,
 * every save would race the upload; if it posted nothing and the server treated absence as
 * "clear", every save would wipe the photo. The server preserves-on-absent
 * (`StopReqDto#primaryPhotoUrlPresent`) and `AdminStopUpdatePayload` has no field for it at all,
 * so neither is expressible here. Upload/remove act immediately and refresh the detail.
 *
 * <p>One smart page component, no dumb children — same scale and shape as
 * `JumpSeatConfigPageComponent` / `CargoCapacityPageComponent`.
 */
@Component({
  selector: 'app-stops-page',
  templateUrl: './stops-page.component.html',
  styleUrl: './stops-page.component.scss',
  standalone: false,
})
export class StopsPageComponent implements OnInit, OnDestroy {
  protected rows: StopRow[] = [];
  protected filteredRows: StopRow[] = [];
  protected searchKeyword = '';

  protected isLoading = false;
  protected errorMessage = '';

  protected selected: StopDetailForm | null = null;
  protected isDetailLoading = false;
  protected isSaving = false;
  protected isPhotoBusy = false;

  protected provinceOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected stopTypeOptions: Option[] = [];

  private rawStops: AdminStopSummaryDto[] = [];
  private rawProvinces: AdminStopLookupDto[] = [];
  private rawLookups: AdminLookupDto[] = [];
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    // Every label on this page is server-localized, and so is the CONTENT of the form
    // (the detail payload's translations map is complete, but the labels beside it are
    // not). Relabel from memory and reload the open stop.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
        if (this.selected) {
          void this.openStop(this.selected.id);
        }
      })
    );
  }

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [stops, provinces, lookups] = await Promise.all([
        firstValueFrom(this.adminApiService.getStopsForAdmin()),
        firstValueFrom(this.adminApiService.getProvincesForAdmin()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);
      this.rawStops = stops.data ?? [];
      this.rawProvinces = provinces.data ?? [];
      this.rawLookups = lookups.data ?? [];
      this.applyLocalization();
    } catch (error) {
      this.rows = [];
      this.filteredRows = [];
      this.errorMessage =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.STOPS.LOAD_FAILED');
    } finally {
      this.isLoading = false;
    }
  }

  protected onSearchKeywordChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.filteredRows = filterStopRows(this.rows, this.searchKeyword);
  }

  protected async openStop(id: number): Promise<void> {
    this.isDetailLoading = true;
    try {
      const response = await firstValueFrom(this.adminApiService.getStopDetail(id));
      if (!response.data) {
        // A 200 with no body is not a stop. Falling through would build a form whose id is
        // undefined, and its first save would PUT to /private/stops/undefined.
        throw new Error('stop detail response carried no data');
      }
      this.selected = toStopDetailForm(response.data);
    } catch (error) {
      await this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.STOPS.LOAD_FAILED')
      );
    } finally {
      this.isDetailLoading = false;
    }
  }

  protected closeDetail(): void {
    this.selected = null;
  }

  protected async save(): Promise<void> {
    if (!this.selected || this.isSaving) {
      return;
    }
    this.isSaving = true;
    try {
      await firstValueFrom(
        this.adminApiService.updateStop(this.selected.id, toStopUpdatePayload(this.selected))
      );
      await this.load();
      // Re-read the stop instead of trusting the local form: the PUT is a full replace and
      // the server normalizes (trims, drops blank-label locales), so what is on screen after
      // a save must be what was actually stored — not what was typed.
      await this.openStop(this.selected.id);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
    } catch (error) {
      await this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED')
      );
    } finally {
      this.isSaving = false;
    }
  }

  protected async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the input immediately: without this, picking the SAME file again after a failed
    // upload fires no change event and the retry looks like a dead button.
    input.value = '';

    if (!file || !this.selected || this.isPhotoBusy) {
      return;
    }

    this.isPhotoBusy = true;
    try {
      const response = await firstValueFrom(
        this.adminApiService.uploadStopPhoto(this.selected.id, file)
      );
      this.selected = { ...this.selected, primaryPhotoUrl: response.data?.primaryPhotoUrl ?? null };
      await this.alertService.success(this.translate.instant('ADMIN.STOPS.PHOTO_UPLOADED'));
    } catch (error) {
      await this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.STOPS.PHOTO_UPLOAD_FAILED')
      );
    } finally {
      this.isPhotoBusy = false;
    }
  }

  protected async removePhoto(): Promise<void> {
    if (!this.selected || this.isPhotoBusy) {
      return;
    }
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.STOPS.PHOTO_REMOVE_TITLE'),
      text: this.translate.instant('ADMIN.STOPS.PHOTO_REMOVE_CONFIRM'),
      confirmButtonText: this.translate.instant('ADMIN.COMMON.DELETE'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isPhotoBusy = true;
    try {
      await firstValueFrom(this.adminApiService.deleteStopPhoto(this.selected.id));
      this.selected = { ...this.selected, primaryPhotoUrl: null };
    } catch (error) {
      await this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.STOPS.PHOTO_REMOVE_FAILED')
      );
    } finally {
      this.isPhotoBusy = false;
    }
  }

  private applyLocalization(): void {
    const locale = this.currentLocale;

    this.rows = this.rawStops.map((dto) => toStopRow(dto, locale));
    this.filteredRows = filterStopRows(this.rows, this.searchKeyword);

    this.provinceOptions = this.rawProvinces
      .map((province) => ({
        code: String(province.slug ?? ''),
        label:
          getAdminTranslationLabel(province.translations, locale) ??
          getAdminTranslationLabel(province.translations, 'en') ??
          String(province.slug ?? ''),
      }))
      .filter((option) => option.code.length > 0);

    this.statusOptions = this.lookupOptions('stop_status', locale);
    this.stopTypeOptions = this.lookupOptions('stop_type', locale);
  }

  private lookupOptions(category: string, locale: string): Option[] {
    return this.rawLookups
      .filter((lookup) => lookup.category === category)
      .map((lookup) => ({
        code: lookup.slug,
        label: getAdminLookupLabel(lookup, locale) ?? lookup.slug,
      }));
  }

  private get currentLocale(): string {
    const raw = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();
    return raw.startsWith('en') ? 'en' : raw.startsWith('zh') ? 'zh' : 'th';
  }
}
