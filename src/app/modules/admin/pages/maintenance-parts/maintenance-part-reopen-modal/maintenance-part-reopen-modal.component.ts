import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AdminMaintenancePartDto } from '../../../../../services/admin/admin-api.service';

/**
 * OBRS-1634 AC8: presentational reopen-confirm modal, mirroring `RoleDeleteModalComponent` /
 * `PromotionDeactivateModalComponent`'s shape — owns no state, makes no API calls. The smart
 * parent page owns the `unmergeMaintenancePart()` call, the `isReopening` guard on close, and the
 * refresh afterwards.
 *
 * <p>⛔ The button/title text is "เปิดใช้ชื่อนี้อีกครั้ง", never "ยกเลิกการรวม" — the owner's
 * 2026-08-29 ruling. Unmerging restores the PAST exactly (every bill line this entry owned before
 * the merge is still its own) but not the MIDDLE: a bill keyed while the merge was in force is
 * bound to `mergedIntoLabel`, and nothing records that it should have gone here instead — so the
 * confirm message says plainly that those bills do not move back (`MERGE_INTO` wording it would
 * otherwise contradict).
 */
@Component({
    selector: 'app-maintenance-part-reopen-modal',
    templateUrl: './maintenance-part-reopen-modal.component.html',
    styleUrl: './maintenance-part-reopen-modal.component.scss',
    standalone: false
})
export class MaintenancePartReopenModalComponent {
  @Input() isOpen = false;
  @Input() part: AdminMaintenancePartDto | null = null;
  /** The display label of the entry `part` was merged into — resolved by the parent from the
   * live (unmerged) registry it already holds. */
  @Input() mergedIntoLabel = '';
  @Input() isReopening = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
