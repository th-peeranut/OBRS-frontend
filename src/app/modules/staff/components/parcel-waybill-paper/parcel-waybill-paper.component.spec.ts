import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { ParcelWaybillPaperComponent } from './parcel-waybill-paper.component';
import { WaybillRespDto } from '../../../../shared/interfaces/parcel.interface';
import { PhoneFormatPipe } from '../../../../shared/pipes/phone-format.pipe';

describe('ParcelWaybillPaperComponent', () => {
  it('should be created', () => {
    expect(new ParcelWaybillPaperComponent()).toBeTruthy();
  });

  it('defaults waybill to null and both QR inputs to empty', () => {
    const component = new ParcelWaybillPaperComponent();
    expect(component.waybill).toBeNull();
    expect(component.qrDataUrl).toBe('');
    expect(component.trackQrDataUrl).toBe('');
  });

  it('resolves a stop label via parcelStopLabel for string and object shapes', () => {
    const component = new ParcelWaybillPaperComponent();
    expect(component['parcelStopLabel']('Bangkok')).toBe('Bangkok');
    expect(component['parcelStopLabel']({ name: 'Chiang Mai' })).toBe('Chiang Mai');
  });
});

/**
 * OBRS-347 — the consent line on the printed waybill.
 *
 * Two things are asserted and both matter: that nothing at all is printed when the
 * sender did not consent (a printed "did not consent" line would record a refusal
 * they never gave), and that when it IS printed it sits ABOVE the signature rule —
 * a consent line under the signature is a line the sender did not sign.
 */
describe('ParcelWaybillPaperComponent (OBRS-347 consent line — DOM)', () => {
  let fixture: ComponentFixture<ParcelWaybillPaperComponent>;

  const WAYBILL: WaybillRespDto = {
    trackingNumber: 'P-ABCDEFGHIJ',
    sender: { name: 'ผู้ส่ง ทดสอบ', phone: '0812345678' },
    recipient: { name: 'ผู้รับ ทดสอบ', phone: '0898765432' },
    pickupStop: { slug: 'stop_a', name: 'จุด A' },
    dropoffStop: { slug: 'stop_b', name: 'จุด B' },
    weightKg: 5,
    amount: 60,
    departureAt: '10 ก.ย. 2569 08:00',
    collectionToken: 'tok',
    leaveAtStopConsent: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      // PhoneFormatPipe is standalone and the template pipes both party phone
      // numbers through it, so without importing it the component cannot render
      // at all (NG0302) - the real pipe, not a stub.
      imports: [CommonModule, TranslateModule.forRoot(), PhoneFormatPipe],
      declarations: [ParcelWaybillPaperComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(ParcelWaybillPaperComponent);
  });

  function render(leaveAtStopConsent: boolean): void {
    fixture.componentInstance.waybill = { ...WAYBILL, leaveAtStopConsent };
    fixture.detectChanges();
  }

  it('prints NOTHING when the sender did not consent', () => {
    render(false);

    expect(fixture.debugElement.queryAll(By.css('[data-testid="parcel-waybill-leave-consent"]')).length).toBe(0);
  });

  it('prints the consent line ABOVE the signature rule when the sender consented', () => {
    render(true);

    const line = fixture.debugElement.query(By.css('[data-testid="parcel-waybill-leave-consent"]'));
    expect(line).toBeTruthy();
    expect(line.nativeElement.textContent).toContain('STAFF.PARCEL_WAYBILL.LEAVE_CONSENT_LINE');

    // Document order, not styling: DOCUMENT_POSITION_FOLLOWING means the signature
    // block comes AFTER the consent line, which is what "above" means on paper.
    const signature = fixture.debugElement.query(By.css('.parcel-waybill-signature')).nativeElement as HTMLElement;
    // eslint-disable-next-line no-bitwise
    const followsConsent = line.nativeElement.compareDocumentPosition(signature) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(followsConsent).toBeTruthy();
  });
});

