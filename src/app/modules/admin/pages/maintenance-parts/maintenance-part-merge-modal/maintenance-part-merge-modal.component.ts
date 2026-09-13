import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminMaintenancePartDto,
  MaintenancePartMergeImpact,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { Option } from '../../expenses/expenses-page.mappers';
import { maintenancePartLabel } from '../maintenance-parts.mappers';

/**
 * OBRS-1634 AC1/AC4: smart merge dialog, mirroring `RoleFormModalComponent`'s shape — owns its
 * own API calls (impact fetch + the merge itself), the `AlertService` success/error, and a
 * `reloadStructure` callback @Input rather than an @Output round-trip.
 *
 * <p>This IS the AC4 confirmation dialog, not a separate step after one: picking a destination
 * (the dropdown below) fetches the impact counts, and the confirm button stays disabled until
 * they have loaded — so the owner cannot click through to a merge without having seen how many
 * bill lines and plans are about to move. The modal opens optimistically (design-system.md §6);
 * only the impact number is gated on the fetch, never the dialog itself.
 */
@Component({
    selector: 'app-maintenance-part-merge-modal',
    templateUrl: './maintenance-part-merge-modal.component.html',
    styleUrl: './maintenance-part-merge-modal.component.scss',
    standalone: false
})
export class MaintenancePartMergeModalComponent implements OnChanges {
  @Input() isOpen = false;
  /** The entry about to be folded away. Snapshotted by the parent at open. */
  @Input() sourcePart: AdminMaintenancePartDto | null = null;
  /** Eligible destinations — same kind, not itself merged, not `sourcePart` (see
   * `mergeableTargets`). Computed by the parent so this component stays a pure consumer. */
  @Input() candidates: AdminMaintenancePartDto[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected targetOptions: Option[] = [];
  protected selectedTargetId = '';
  protected impact: MaintenancePartMergeImpact | null = null;
  protected isLoadingImpact = false;
  protected impactFailed = false;
  protected isMerging = false;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  // Reacts only to `isOpen` transitions, matching `RoleFormModalComponent`: a re-render with the
  // same open modal (e.g. the parent's store emitting again) must never reset a selection the
  // owner is mid-way through choosing.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.targetOptions = this.candidates.map((part) => ({
        code: String(part.id),
        label: this.partLabel(part),
      }));
      this.selectedTargetId = '';
      this.impact = null;
      this.impactFailed = false;
      this.isLoadingImpact = false;
      this.isMerging = false;
    }
  }

  protected get sourceLabel(): string {
    return this.sourcePart ? this.partLabel(this.sourcePart) : '';
  }

  protected get canConfirm(): boolean {
    return (
      !!this.selectedTargetId && !!this.impact && !this.isLoadingImpact && !this.isMerging
    );
  }

  protected onTargetChange(value: string): void {
    this.selectedTargetId = value;
    this.impact = null;
    this.impactFailed = false;
    if (!value) {
      return;
    }
    void this.loadImpact(Number(value));
  }

  protected async confirmMerge(): Promise<void> {
    if (!this.canConfirm || !this.sourcePart) {
      return;
    }
    const sourceId = this.sourcePart.id;
    const targetId = Number(this.selectedTargetId);
    this.isMerging = true;
    try {
      await firstValueFrom(this.adminApiService.mergeMaintenancePart(sourceId, targetId));
      this.closed.emit();
      await this.alertService.success(
        this.translate.instant('ADMIN.MAINTENANCE_PARTS.MERGE_SUCCESS')
      );
      await this.reloadStructure();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isMerging = false;
    }
  }

  protected cancel(): void {
    if (this.isMerging) {
      return;
    }
    this.closed.emit();
  }

  private partLabel(part: AdminMaintenancePartDto): string {
    return maintenancePartLabel(part, (key) => this.translate.instant(key));
  }

  /**
   * Guarded against a selection made mid-flight (the owner picking a different destination while
   * this request is still in the air) — the same staleness idiom FRONTEND-GOTCHAS.md documents
   * for a row snapshotted at modal-open: check the identity that mattered at request time is
   * still current before applying the response.
   */
  private async loadImpact(targetId: number): Promise<void> {
    const sourceId = this.sourcePart?.id;
    if (sourceId === undefined) {
      return;
    }
    this.isLoadingImpact = true;
    this.impactFailed = false;
    const stillCurrent = () =>
      this.isOpen &&
      this.sourcePart?.id === sourceId &&
      this.selectedTargetId === String(targetId);
    try {
      const response = await firstValueFrom(
        this.adminApiService.getMaintenancePartMergeImpact(sourceId, targetId)
      );
      if (stillCurrent()) {
        this.impact = response?.data ?? null;
      }
    } catch {
      if (stillCurrent()) {
        this.impactFailed = true;
      }
    } finally {
      if (stillCurrent()) {
        this.isLoadingImpact = false;
      }
    }
  }
}
