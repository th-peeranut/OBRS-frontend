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

  it('defaults waybill to null, both QR inputs to empty, and the variant to screen', () => {
    const component = new ParcelWaybillPaperComponent();
    expect(component.waybill).toBeNull();
    expect(component.trackQrDataUrl).toBe('');
    expect(component.termsQrDataUrl).toBe('');
    // The safe default is the surface that cannot be signed: a paper rendered by accident
    // with the screen's link instead of clause 10's QR is a waybill that breaks the terms.
    expect(component.variant).toBe('screen');
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


/**
 * OBRS-1808 — the screen and the paper are not the same document.
 *
 * Every assertion here is a COUNT, including the zeros: a `querySelector` that returns null
 * because the selector was mistyped is indistinguishable from one that returns null because
 * the node is genuinely gone, and the whole point of this card is that a QR is genuinely gone.
 */
describe('ParcelWaybillPaperComponent (OBRS-1808 — screen vs print)', () => {
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
      imports: [CommonModule, TranslateModule.forRoot(), PhoneFormatPipe],
      declarations: [ParcelWaybillPaperComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(ParcelWaybillPaperComponent);
  });

  function render(variant: 'screen' | 'print'): void {
    fixture.componentInstance.waybill = WAYBILL;
    fixture.componentInstance.variant = variant;
    fixture.componentInstance.trackQrDataUrl = 'data:image/png;base64,track';
    fixture.componentInstance.termsQrDataUrl = 'data:image/png;base64,terms';
    fixture.detectChanges();
  }

  function qrCount(): number {
    return fixture.debugElement.queryAll(By.css('.parcel-waybill-qr')).length;
  }

  // The card's reason for existing: the recipient's collectionToken QR is gone from BOTH
  // surfaces. It was a per-parcel secret printed on the sender's paper in a format nothing in
  // this product can read - the collect dialog is a text input, and the only @zxing scanner
  // belongs to boarding. Asserted through the label key, because the input itself no longer
  // exists to be set: a component that still rendered it would have to translate this key.
  it('renders no recipient QR on either surface', () => {
    render('screen');
    expect(fixture.nativeElement.textContent).not.toContain('QR_FOR_RECIPIENT');

    render('print');
    expect(fixture.nativeElement.textContent).not.toContain('QR_FOR_RECIPIENT');
  });

  it('screen: one QR (tracking) and a link to the full terms, no terms QR', () => {
    render('screen');

    expect(qrCount()).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('[data-testid="parcel-waybill-terms-link"]')).length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('TERMS_QR_LABEL');
  });

  // Clause 10 of the published terms says the printed waybill carries a QR to the full
  // version. If this ever goes to 0 the paper stops matching the document that describes it.
  it('print: two QRs (tracking + terms) and no link', () => {
    render('print');

    expect(qrCount()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('TERMS_QR_LABEL');
    expect(fixture.debugElement.queryAll(By.css('[data-testid="parcel-waybill-terms-link"]')).length).toBe(0);
  });

  it('emits openTerms when the screen link is clicked', () => {
    render('screen');
    let emitted = 0;
    fixture.componentInstance.openTerms.subscribe(() => (emitted += 1));

    fixture.debugElement.query(By.css('[data-testid="parcel-waybill-terms-link"]')).nativeElement.click();

    expect(emitted).toBe(1);
  });

  // The owner's actual complaint: three clauses ran together into an unreadable block above
  // the line the sender signs. One <li> each, on both surfaces.
  it('breaks the short terms into three separate lines', () => {
    render('screen');
    expect(fixture.debugElement.queryAll(By.css('.parcel-waybill-terms-list li')).length).toBe(3);

    render('print');
    expect(fixture.debugElement.queryAll(By.css('.parcel-waybill-terms-list li')).length).toBe(3);
  });
});
