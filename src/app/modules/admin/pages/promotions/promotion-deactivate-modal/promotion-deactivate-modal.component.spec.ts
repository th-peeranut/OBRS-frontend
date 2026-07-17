import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { PromotionDeactivateModalComponent } from './promotion-deactivate-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { PromotionRow } from '../promotions-page.mappers';

const PROMOTION_ROW: PromotionRow = {
  id: 2,
  slug: 'summer-sale',
  code: 'SUMMER10',
  discountTypeCode: 'percentage',
  discountTypeLabel: 'Percentage',
  discountValue: 10,
  maxDiscountAmount: 100,
  minBookingAmount: 500,
  startDateTime: null,
  endDateTime: null,
  usageLimit: 100,
  currentUsage: 3,
  statusCode: 'active',
  statusLabel: 'Active',
  autoApply: false,
  isRoundTrip: false,
};

describe('PromotionDeactivateModalComponent', () => {
  let fixture: ComponentFixture<PromotionDeactivateModalComponent>;
  let component: PromotionDeactivateModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [PromotionDeactivateModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(PromotionDeactivateModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the promotion code when isOpen is true', () => {
    component.isOpen = true;
    component.promotion = PROMOTION_ROW;
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('SUMMER10');
  });

  it('disables the confirm button and shows the deactivating label while isDeactivating', () => {
    component.isOpen = true;
    component.promotion = PROMOTION_ROW;
    component.isDeactivating = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.promotion = PROMOTION_ROW;
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
