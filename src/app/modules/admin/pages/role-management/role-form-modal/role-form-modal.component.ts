import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import {
  RoleRow,
  StatusOption,
  buildRoleFormValues,
  extractResponseData,
  toRoleDetailFallback,
  toRolePayload,
} from '../role-management.mappers';

// Smart create/edit form modal, extracted from RoleManagementPageComponent
// (OBRS-263, mirroring OBRS-261's VehicleFormModalComponent / OBRS-257's
// UserFormModalComponent / OBRS-251's PromotionFormModalComponent). Owns its
// FormGroup, the modal template, its own create/update/detail-fetch API
// calls, and validation.
//
// Driven by @Input (isOpen/mode/selectedRole) — ngOnChanges reacts only to
// `isOpen` transitions so a re-render with the same open modal never
// clobbers in-progress input (same idiom as the vehicle/promotion/user form
// modals).
//
// `reloadStructure` is a callback @Input (not an @Output) so the parent's
// store refresh can still be triggered from here without a round-trip
// through an @Output subscriber.
//
// Ordering discrepancy vs. the vehicle/promotion/user form-modal blueprint,
// flagged deliberately (see the split report): those three siblings call
// `await this.reloadStructure()` strictly AFTER `await alertService.success`
// resolves (sequential). The pre-split RoleManagementPageComponent.submitRole
// instead started the refresh BEFORE awaiting the success alert and only
// awaited the refresh promise afterwards — a documented perf optimization
// (SIT ~2s/request; serialising refresh behind the hand-dismissed popup made
// "add role" feel ~8s). That concurrent-start ordering is preserved
// byte-for-byte here rather than following the sibling blueprint's
// sequential pattern, per the no-behavior-change invariant: API call -> emit
// closed (== the old closeFormModal(true)) -> reloadStructure() STARTED (not
// yet awaited) -> await the success alert -> THEN await the refresh promise.
//
// getCurrentLocale(): kept as a private duplicate here (not threaded in via
// @Input), matching the actual precedent in
// VehicleFormModalComponent/PromotionFormModalComponent/UserFormModalComponent
// (all three keep their own private copy rather than taking a resolved
// locale from the parent).
@Component({
    selector: 'app-role-form-modal',
    templateUrl: './role-form-modal.component.html',
    styleUrl: './role-form-modal.component.scss',
    standalone: false
})
export class RoleFormModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedRole: RoleRow | null = null;
  @Input() statusOptions: StatusOption[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected isSubmitting = false;
  protected isEditDetailLoading = false;

  protected readonly roleForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.roleForm = this.formBuilder.group({
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.required, Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
      status: ['', [Validators.required]],
    });
  }

  // Only `isOpen` transitions drive the form: the parent always sets
  // mode/selectedRole together with isOpen in the same synchronous call
  // (openCreateModal/openEditModal), so gating on isOpen alone mirrors that
  // call boundary without re-initializing the form on an unrelated parent
  // re-render (e.g. a background store refresh) while the modal stays open.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }

    if (this.isOpen) {
      if (this.mode === 'edit' && this.selectedRole) {
        this.initEditForm(this.selectedRole);
      } else {
        this.initCreateForm();
      }
    } else {
      this.isEditDetailLoading = false;
      this.roleForm.reset();
    }
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.roleForm.get(fieldName);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submitRole(): Promise<void> {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      // Without this the click looks like a no-op when a field is invalid
      // (e.g. a slug the pattern rejects) — surface why nothing was saved.
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toRolePayload(this.roleForm.getRawValue());

      // Start revalidating the table the moment the write succeeds, so it
      // runs concurrently with the success dialog (a SweetAlert the admin
      // dismisses by hand) instead of only starting after — see the
      // class-level NOTE above for why this diverges from the sibling form
      // modals' sequential ordering. reloadStructure() (== store.refresh())
      // never rejects (errors surface via error$), so holding the promise
      // and awaiting it after the alert is safe.
      let refresh: Promise<void>;
      if (this.mode === 'edit' && this.selectedRole) {
        await firstValueFrom(
          this.adminApiService.updateRoleById(this.selectedRole.id, payload)
        );
        this.closed.emit();
        refresh = this.reloadStructure();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createRole(payload));
        this.closed.emit();
        refresh = this.reloadStructure();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await refresh;
    } catch (error) {
      this.closed.emit();
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  private initCreateForm(): void {
    this.isEditDetailLoading = false;
    this.roleForm.reset({
      slug: '',
      enLabel: '',
      enDescription: '',
      thLabel: '',
      thDescription: '',
      status: this.statusOptions[0]?.code ?? 'active',
    });
    this.roleForm.get('slug')?.enable();
  }

  // Open immediately with the row data already in hand, then patch in the
  // server detail once it arrives (pristine controls only) — same pattern as
  // the pre-split RoleManagementPageComponent.openEditModal.
  private async initEditForm(role: RoleRow): Promise<void> {
    this.isEditDetailLoading = true;
    this.applyRoleFormValues(toRoleDetailFallback(role), role);
    this.roleForm.get('slug')?.disable();

    try {
      const response = await firstValueFrom(this.adminApiService.getRoleById(role.id));
      const roleDetail = extractResponseData<AdminRoleDto>(response);
      // Ignore a stale response if the modal has since closed or moved on to
      // editing a different role.
      if (roleDetail && this.isOpen && this.selectedRole?.id === role.id) {
        this.applyRoleFormValues(roleDetail, role, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isOpen && this.selectedRole?.id === role.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the role form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the admin hasn't started editing are
  // filled, so the arriving server data never clobbers in-progress input.
  private applyRoleFormValues(
    roleDetail: AdminRoleDto,
    role: RoleRow,
    onlyPristine = false
  ): void {
    const values = buildRoleFormValues(roleDetail, role, this.getCurrentLocale());

    if (!onlyPristine) {
      this.roleForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.roleForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it).
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
