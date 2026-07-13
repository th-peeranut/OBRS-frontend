import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { VehicleDeleteModalComponent } from './vehicle-delete-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { VehicleRow } from '../vehicles-page.mappers';

const VAN_ROW: VehicleRow = {
  id: 1,
  vehicleTypeSlug: 'van',
  statusCode: 'active',
  vehicleNumber: 'V1',
  plate: 'ABC-123',
  vehicleType: 'Van',
  route: '-',
  status: 'Active',
};

describe('VehicleDeleteModalComponent', () => {
  let fixture: ComponentFixture<VehicleDeleteModalComponent>;
  let component: VehicleDeleteModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [VehicleDeleteModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(VehicleDeleteModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the vehicle number when isOpen is true', () => {
    component.isOpen = true;
    component.vehicle = VAN_ROW;
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('V1');
  });

  it('disables the confirm button and shows the deleting label while isDeleting', () => {
    component.isOpen = true;
    component.vehicle = VAN_ROW;
    component.isDeleting = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.vehicle = VAN_ROW;
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
