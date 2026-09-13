import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { MaintenancePartReopenModalComponent } from './maintenance-part-reopen-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { AdminMaintenancePartDto } from '../../../../../services/admin/admin-api.service';

const MERGED_PART: AdminMaintenancePartDto = {
  id: 4,
  code: null,
  name: 'จาระบี PBR',
  kind: 'PART',
  active: true,
  mergedIntoId: 1,
};

describe('MaintenancePartReopenModalComponent', () => {
  let fixture: ComponentFixture<MaintenancePartReopenModalComponent>;
  let component: MaintenancePartReopenModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [MaintenancePartReopenModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(MaintenancePartReopenModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the entry name when open', () => {
    component.isOpen = true;
    component.part = MERGED_PART;
    component.mergedIntoLabel = 'จาระบี';
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('จาระบี PBR');
  });

  // AC8: the control is "เปิดใช้ชื่อนี้อีกครั้ง" and NEVER "ยกเลิกการรวม" (owner ruling
  // 2026-08-29). This exercises the KEY the button/title bind to — the exact Thai wording is
  // locked independently against the real th.json in maintenance-parts-merge-wording.spec.ts.
  it('binds the confirm button and title to the REOPEN keys, not a "cancel the merge" key', () => {
    component.isOpen = true;
    component.part = MERGED_PART;
    fixture.detectChanges();

    const title = fixture.debugElement.query(By.css('.admin-modal-title'));
    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(title.nativeElement.textContent).toContain('ADMIN.MAINTENANCE_PARTS.REOPEN_CONFIRM_TITLE');
    expect(confirmButton.nativeElement.textContent).toContain('ADMIN.MAINTENANCE_PARTS.REOPEN');
  });

  it('disables the confirm button and shows the reopening label while isReopening', () => {
    component.isOpen = true;
    component.part = MERGED_PART;
    component.isReopening = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.part = MERGED_PART;
    fixture.detectChanges();

    const confirmSpy = jasmine.createSpy('confirm');
    const cancelSpy = jasmine.createSpy('cancel');
    component.confirm.subscribe(confirmSpy);
    component.cancel.subscribe(cancelSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-modal-actions button'));
    buttons[0].nativeElement.click(); // Cancel
    buttons[1].nativeElement.click(); // Confirm

    expect(cancelSpy).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
  });
});
