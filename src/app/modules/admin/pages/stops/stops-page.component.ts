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
import { AuthService } from '../../../../auth/auth.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  Option,
  ReturnStopOption,
  StopDetailForm,
  StopRow,
  emptyStopDetailForm,
  filterStopRows,
  toReturnStopOptions,
  toStopDetailForm,
  toStopLabelPayload,
  toStopRow,
  toStopUpdatePayload,
} from './stops.mappers';

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
 * <p>OBRS-1298: the detail form used to render inline below the table (forcing a scroll
 * to the bottom of the page every time an owner clicked edit) and the edit affordance was
 * a button at the far right of the row. Both are fixed the same way: {@code
 * StopFormModalComponent} is a presentational child (no store, no HTTP, no Alert — see its
 * own doc comment) driven by `isFormModalOpen` / `selected`, and the whole row is clickable
 * via {@link #onRowActivate}. This page still owns every behaviour — the fetch, the
 * optimistic open + staleness guard, save, the photo actions, and the `onLangChange`
 * re-fetch — the modal only renders what this page hands it.
 *
 * <p>OBRS-1680: the form has two halves with different owners. The PHYSICAL half (slug,
 * province, status, type, coordinates, the photo) is platform-wide reference data, ADMIN-only
 * since OBRS-830 and left that way by the owner's 2026-08-31 decision; the SIGN (label, boarding
 * note, address) is the operator's, and they save it through a different endpoint that writes
 * only their own rows. An operator still SEES the physical values — read-only, because they need
 * to know which place they are re-signing — but every control that would 403 for them is either
 * disabled or absent. {@link #canEditPhysical} is the one switch, and it asks `hasHeldRole`, not
 * `hasAnyRole`: the latter expands ROLE_GRANTS, under which an owner satisfies `admin`, so it
 * would hand the operator exactly the controls this card exists to withhold.
 *
 * <p>OBRS-1678: adding and deleting a stop. `POST` and `DELETE /private/stops` have existed
 * since OBRS-1022 and nothing on this front end had ever called either, for any role — so no
 * screen could open a stop or close one. Both are physical, so both live behind the same switch.
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
  // OBRS-1298: separate from `selected` so the modal can open OPTIMISTICALLY —
  // flipped synchronously in openStop(), before the detail fetch's first await,
  // so the modal paints (with its own skeleton) immediately on click rather than
  // waiting on the ~2-3s admin GET (office memory: modals must never gate
  // visibility on an awaited fetch).
  protected isFormModalOpen = false;
  // Drives the selected-row highlight (design-system §13, `.is-selected`) while
  // the modal for that row is open.
  protected selectedStopId: number | null = null;
  protected isDetailLoading = false;
  protected isSaving = false;
  protected isPhotoBusy = false;
  protected isDeleting = false;
  /** OBRS-1678: true while the modal is opening a stop that does not exist yet. */
  protected isCreating = false;

  /**
   * OBRS-1680: may this caller edit the PLACE, as opposed to their own sign on it?
   *
   * <p>Read once in the constructor rather than called from the template: a getter here would run
   * on every change-detection pass of a screen that renders one row per stop, and the answer
   * cannot change without a new sign-in or a role preview, both of which rebuild this component.
   */
  protected readonly canEditPhysical: boolean;

  protected provinceOptions: Option[] = [];
  // OBRS-1481: rebuilt in applyLocalization AND whenever a stop is opened, because the list
  // depends on the pin currently saved on that stop (see toReturnStopOptions, AC-7).
  protected returnStopOptions: ReturnStopOption[] = [];
  protected statusOptions: Option[] = [];
  protected stopTypeOptions: Option[] = [];

  private rawStops: AdminStopSummaryDto[] = [];
  private rawReturnStops: AdminStopSummaryDto[] = [];
  private rawProvinces: AdminStopLookupDto[] = [];
  private rawLookups: AdminLookupDto[] = [];
  private readonly subscriptions = new Subscription();
  // Staleness guard: the id the modal is CURRENTLY showing/fetching for. A fast
  // double-click opening row B while row A's GET is still in flight must not let
  // A's late response paint into B's modal (or reset B's isDetailLoading).
  private pendingStopId: number | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    authService: AuthService
  ) {
    this.canEditPhysical = authService.hasHeldRole(['admin']);
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
      const [stops, provinces, lookups, returnStops] = await Promise.all([
        firstValueFrom(this.adminApiService.getStopsForAdmin()),
        firstValueFrom(this.adminApiService.getProvincesForAdmin()),
        firstValueFrom(this.adminApiService.getLookups()),
        firstValueFrom(this.adminApiService.getReturnStopOptions()),
      ]);
      this.rawStops = stops.data ?? [];
      this.rawReturnStops = returnStops.data ?? [];
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

  // OBRS-1298: whole-row click is a MOUSE convenience for opening the detail modal — same
  // guard idiom as 5 existing sites (grepped at write time, one more than the brief's count
  // of 4 — see the frontend report for that discrepancy): BookingsPageComponent,
  // RouteListTableComponent, UsabilityReportsPageComponent, SettlementsListComponent and
  // DriverCashDaysListComponent (all `onRowActivate`). The row carries no role/keyboard
  // handler — the "แก้ไข" button remains the keyboard/AT entry point (OBRS-891) — so ignore
  // clicks on an interactive control in the row and clicks that end a text selection.
  // Extracting this into a shared directive would mean touching all 5 existing sites in the
  // same card just to avoid a 6th near-identical copy, which is exactly the scope AC-6 locks
  // this card out of (diff confined to stops files + admin.module.ts) — so it stays a copy.
  protected onRowActivate(row: StopRow, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    void this.openStop(row.id);
  }

  /**
   * OBRS-1678: opens the SAME modal with an empty form. No fetch, so no skeleton and no
   * staleness guard — `pendingStopId` is cleared so a detail response still in flight from a
   * row clicked a moment ago cannot paint itself into the blank create form.
   */
  protected openCreate(): void {
    this.pendingStopId = null;
    this.isCreating = true;
    this.isDetailLoading = false;
    this.selectedStopId = null;
    this.selected = emptyStopDetailForm(
      this.provinceOptions[0]?.code ?? '',
      this.statusOptions[0]?.code ?? '',
      this.stopTypeOptions[0]?.code ?? ''
    );
    this.refreshReturnStopOptions();
    this.isFormModalOpen = true;
  }

  protected async openStop(id: number): Promise<void> {
    // Optimistic open (office memory, 6 archived occurrences): flip the flags BEFORE the
    // first await so the modal + skeleton paint immediately, not after the ~2-3s admin GET.
    this.isCreating = false;
    this.isFormModalOpen = true;
    this.selectedStopId = id;
    this.isDetailLoading = true;
    this.pendingStopId = id;
    try {
      const response = await firstValueFrom(this.adminApiService.getStopDetail(id));
      if (!response.data) {
        // A 200 with no body is not a stop. Falling through would build a form whose id is
        // undefined, and its first save would PUT to /private/stops/undefined.
        throw new Error('stop detail response carried no data');
      }
      // Staleness guard: only paint this response if the modal is still open AND still
      // waiting on THIS id — a fast double-click on two different rows must not let the
      // first (now stale) response overwrite the second row's modal.
      if (this.isFormModalOpen && this.pendingStopId === id) {
        this.selected = toStopDetailForm(response.data);
        // OBRS-1481: the choices depend on THIS stop's saved pin, so they are rebuilt here
        // rather than only on load - a pin no longer eligible must still be on the list.
        this.refreshReturnStopOptions();
      }
    } catch (error) {
      // Under the old inline layout, a failed fetch left `selected` null with just an
      // alert. Under a modal that would leave an empty dialog open — close it instead.
      if (this.pendingStopId === id) {
        this.closeDetail();
      }
      await this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.STOPS.LOAD_FAILED')
      );
    } finally {
      if (this.pendingStopId === id) {
        this.isDetailLoading = false;
      }
    }
  }

  protected closeDetail(): void {
    this.isFormModalOpen = false;
    this.selected = null;
    this.selectedStopId = null;
    this.isCreating = false;
  }

  /**
   * Three saves behind one button, chosen by who is signed in and whether the stop exists yet.
   *
   * <p>OBRS-1678 create and OBRS-1680's operator save are not variations of the ADMIN update —
   * they are different endpoints with different authority, and picking between them here is what
   * keeps the modal presentational. An operator never reaches the two ADMIN branches: the create
   * button is not rendered for them, and `canEditPhysical` is what routes their save.
   */
  protected async save(): Promise<void> {
    if (!this.selected || this.isSaving) {
      return;
    }
    this.isSaving = true;
    try {
      if (this.isCreating) {
        await firstValueFrom(this.adminApiService.createStop(toStopUpdatePayload(this.selected)));
        await this.load();
        this.closeDetail();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
        return;
      }

      if (this.canEditPhysical) {
        await firstValueFrom(
          this.adminApiService.updateStop(this.selected.id, toStopUpdatePayload(this.selected))
        );
      } else {
        // OBRS-1680: the operator writes their own overlay. Their form never held an editable
        // physical field, so there is nothing of the place in this body to drop.
        await firstValueFrom(
          this.adminApiService.updateStopLabels(this.selected.id, toStopLabelPayload(this.selected))
        );
      }
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

  /**
   * OBRS-1678: closes a stop for good.
   *
   * <p>Nine foreign keys name `stops` and all nine are NO ACTION, so a stop any route, schedule,
   * booking, ticket or sales point still refers to cannot be deleted — the database says so and
   * the API answers 409. That is the normal outcome for most rows on this screen, not an edge
   * case, so it gets its own sentence rather than the generic failure message: the operator has
   * to be told the stop is in use, otherwise the button reads as broken.
   */
  protected async deleteStop(row: StopRow, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.isDeleting) {
      return;
    }
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.STOPS.DELETE_TITLE'),
      text: this.translate.instant('ADMIN.STOPS.DELETE_CONFIRM', { name: row.name }),
      confirmButtonText: this.translate.instant('ADMIN.COMMON.DELETE'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteStop(row.id));
      if (this.selectedStopId === row.id) {
        this.closeDetail();
      }
      await this.load();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
    } catch (error) {
      await this.alertService.error(
        this.isConflict(error)
          ? this.translate.instant('ADMIN.STOPS.DELETE_IN_USE', { name: row.name })
          : extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED')
      );
    } finally {
      this.isDeleting = false;
    }
  }

  private isConflict(error: unknown): boolean {
    return (error as { status?: number } | null)?.status === 409;
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
    this.refreshReturnStopOptions();
  }

  /** OBRS-1481: the list carries the currently saved pin even when it is no longer eligible,
   *  so it has to be rebuilt whenever either the locale or the open stop changes. */
  private refreshReturnStopOptions(): void {
    this.returnStopOptions = toReturnStopOptions(
      this.rawReturnStops,
      this.rawStops,
      this.currentLocale,
      this.selected?.returnStopId ?? null
    );
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
