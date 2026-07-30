import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRouteDto,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import {
  Option,
  RouteRow,
  parseStatus,
  toRouteDtoFallback,
  toRoutePayload,
} from '../routes.mappers';

@Component({
    selector: 'app-route-form-modal',
    templateUrl: './route-form-modal.component.html',
    styleUrl: './route-form-modal.component.scss',
    standalone: false
})
export class RouteFormModalComponent {
  @Input() statusOptions: Option[] = [];
  @Output() saved = new EventEmitter<{ slug: string }>();

  protected isOpen = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected isSubmitting = false;
  protected routeForEdit: RouteRow | null = null;

  protected readonly routeForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.routeForm = this.formBuilder.group({
      slug: [
        '',
        [
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(/^[a-z0-9_-]+$/),
        ],
      ],
      status: ['', [Validators.required]],
      enLabel: ['', [Validators.required, Validators.maxLength(100)]],
      thLabel: ['', [Validators.required, Validators.maxLength(100)]],
      enDescription: ['', [Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(255)]],
    });
  }

  /** Called by the parent page when the "Add route" action is triggered. */
  openCreate(): void {
    this.isEditMode = false;
    this.routeForEdit = null;
    this.routeForm.get('slug')?.enable();
    this.routeForm.reset({
      slug: '',
      status: this.statusOptions[0]?.code ?? 'active',
      enLabel: '',
      thLabel: '',
      enDescription: '',
      thDescription: '',
    });
    this.isOpen = true;
  }

  /** Called by the parent page when a row's Edit action is triggered. */
  async openEdit(route: RouteRow): Promise<void> {
    // Open the modal immediately with the row data we already hold, so it
    // appears without waiting on the (possibly slow) detail fetch. The server
    // detail (Thai translations, full description) is patched in once it
    // arrives — see the fetch below.
    this.isEditMode = true;
    this.routeForEdit = route;
    this.isEditDetailLoading = true;
    this.routeForm.get('slug')?.enable();
    this.applyRouteFormValues(toRouteDtoFallback(route), route);
    this.isOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getRouteById(route.id));
      const routeDetail = response.data;
      // Ignore a stale response if the user has closed the modal or moved on
      // to editing a different route in the meantime.
      if (routeDetail && this.isOpen && this.routeForEdit?.id === route.id) {
        this.applyRouteFormValues(routeDetail, route, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      // Only clear the loading hint if this fetch is still the current one —
      // a stale response (modal closed, or switched to another route) must not
      // turn off the hint for a different in-flight detail fetch.
      if (this.isOpen && this.routeForEdit?.id === route.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the route form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the user hasn't started editing are filled,
  // so the arriving server data never clobbers in-progress input.
  private applyRouteFormValues(
    routeDetail: AdminRouteDto,
    route: RouteRow,
    onlyPristine = false
  ): void {
    const values = {
      slug: routeDetail.slug,
      status: parseStatus(routeDetail.status ?? route.statusCode, this.getCurrentLocale()).code,
      enLabel: getAdminTranslationLabel(routeDetail.translations, 'en') ?? route.label,
      thLabel: getAdminTranslationLabel(routeDetail.translations, 'th') ?? '',
      enDescription: getAdminTranslationDescription(routeDetail.translations, 'en') ?? '',
      thDescription: getAdminTranslationDescription(routeDetail.translations, 'th') ?? '',
    };

    if (!onlyPristine) {
      this.routeForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.routeForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  protected closeModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isOpen = false;
    this.isEditDetailLoading = false;
    this.routeForEdit = null;
    this.routeForm.reset();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.routeForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async submitRoute(): Promise<void> {
    if (this.routeForm.invalid) {
      this.routeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const routeIdForEdit = this.routeForEdit?.id ?? null;

    try {
      const payload = toRoutePayload(this.routeForm.getRawValue());

      if (this.isEditMode && routeIdForEdit !== null) {
        await firstValueFrom(this.adminApiService.updateRouteById(routeIdForEdit, payload));
        this.closeModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
        this.saved.emit({ slug: payload.slug });
      } else {
        await firstValueFrom(this.adminApiService.createRoute(payload));
        this.closeModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
        this.saved.emit({ slug: payload.slug });
      }
    } catch (error) {
      this.closeModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
