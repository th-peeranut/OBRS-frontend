import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelIntakeResultPanelComponent } from './parcel-intake-result-panel.component';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { ParcelCarryOnRespDto, ParcelConsignedRespDto } from '../../../../shared/interfaces/parcel.interface';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrast,
  effectiveBg,
  fgOf,
  mountInChain,
  resolveTokenColour,
  toHex,
} from '../../../../testing/contrast';

describe('ParcelIntakeResultPanelComponent', () => {
  it('should be created', () => {
    const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('defaults result to null', () => {
    const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
    expect(component.result).toBeNull();
  });

  it('accepts an assigned result', () => {
    const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
    component.result = {
      parcelId: 1,
      trackingNumber: 'PCL-1',
      bookingId: 10,
      bookingNumber: 'BK-1',
      amount: 100,
      deliveryStatus: 'accepted',
      collectionCode: 'ABC123',
      waybillUrl: '/staff/parcels/1/waybill',
    };
    expect(component.result.trackingNumber).toBe('PCL-1');
  });

  // OBRS-341 — the SAME component now also renders the carry-on-on-seat
  // response shape (design-system §10: extend, don't fork).
  describe('isCarryOnResult() — the consigned/carry-on discriminant', () => {
    it('returns false for a consigned result (no parcelType field at all)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      const consigned = {
        parcelId: 1,
        trackingNumber: 'PCL-1',
        bookingId: 10,
        bookingNumber: 'BK-1',
        amount: 100,
        deliveryStatus: 'accepted',
        collectionCode: 'ABC123',
        waybillUrl: '/staff/parcels/1/waybill',
      };
      expect(component['isCarryOnResult'](consigned)).toBeFalse();
    });

    it('returns true for a carry-on-on-seat result (parcelType === carry_on_seat)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      const carryOn = {
        parcelId: 5,
        trackingNumber: 'P-AB12CD34EF',
        bookingId: 91,
        bookingNumber: 'B-000091',
        parcelType: 'carry_on_seat' as const,
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      };
      expect(component['isCarryOnResult'](carryOn)).toBeTrue();
    });

    it('returns true for a free-aisle carry-on result (freeAisle: true, seats null)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      const freeAisle = {
        parcelId: 6,
        trackingNumber: 'P-FREE1',
        bookingId: 92,
        bookingNumber: 'B-000092',
        parcelType: 'carry_on_seat' as const,
        freeAisle: true,
        seatCount: null,
        seatNumbers: null,
        amount: 0,
        bookingNetAmount: 0,
      };
      expect(component['isCarryOnResult'](freeAisle)).toBeTrue();
    });
  });

  // ---------------------------------------------------------------------------
  // OBRS-341 (card AC follow-up) — pay cash / next item
  // ---------------------------------------------------------------------------

  const consignedResult: ParcelConsignedRespDto = {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    bookingId: 10,
    bookingNumber: 'BK-1',
    amount: 100,
    deliveryStatus: 'accepted',
    collectionCode: 'ABC123',
    waybillUrl: '/staff/parcels/1/waybill',
  };

  const freeAisleResult: ParcelCarryOnRespDto = {
    parcelId: 6,
    trackingNumber: 'P-FREE1',
    bookingId: 92,
    bookingNumber: 'B-000092',
    parcelType: 'carry_on_seat',
    freeAisle: true,
    seatCount: null,
    seatNumbers: null,
    amount: 0,
    bookingNetAmount: 0,
  };

  const onSeatResult: ParcelCarryOnRespDto = {
    parcelId: 5,
    trackingNumber: 'P-AB12CD34EF',
    bookingId: 91,
    bookingNumber: 'B-000091',
    parcelType: 'carry_on_seat',
    freeAisle: false,
    seatCount: 1,
    seatNumbers: ['A1'],
    amount: 150,
    bookingNetAmount: 150,
  };

  describe('isNextItemPrimary — exactly one primary action per result state', () => {
    it('is false for a consigned result ("View waybill" is primary)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      component.result = consignedResult;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for a free-aisle carry-on result (no other action exists)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      component.result = freeAisleResult;
      expect(component['isNextItemPrimary']).toBeTrue();
    });

    it('is false for an on-seat UNPAID result ("เก็บเงินสด" is primary)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      component.result = onSeatResult;
      component.carryOnPaid = false;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for an on-seat PAID result (pay button is gone)', () => {
      const component = new ParcelIntakeResultPanelComponent(createTranslateStub());
      component.result = onSeatResult;
      component.carryOnPaid = true;
      expect(component['isNextItemPrimary']).toBeTrue();
    });
  });

  describe('DOM rendering — pay action visibility and next-item wiring', () => {
    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;
    let component: ParcelIntakeResultPanelComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
      component = fixture.componentInstance;
    });

    function payButton(): HTMLButtonElement | null {
      return fixture.nativeElement.querySelector('[data-testid="parcel-carryon-pay-cash"]');
    }

    function nextItemButton(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('[data-testid="parcel-intake-next-item"]');
    }

    function paidNote(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="parcel-carryon-paid-note"]');
    }

    it('free-aisle: renders NO pay button and NO paid note at all (nothing to collect)', () => {
      component.result = freeAisleResult;
      fixture.detectChanges();

      expect(payButton()).toBeNull();
      expect(paidNote()).toBeNull();
    });

    it('on-seat, unpaid: renders the pay button, enabled', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      component.isPayingCarryOn = false;
      fixture.detectChanges();

      const btn = payButton();
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBeFalse();
    });

    it('on-seat, payment in flight: the pay button is DISABLED', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      component.isPayingCarryOn = true;
      fixture.detectChanges();

      expect(payButton()?.disabled).toBeTrue();
    });

    it('on-seat, paid: the pay button is GONE (not reachable again) and the paid note shows', () => {
      component.result = onSeatResult;
      component.carryOnPaid = true;
      fixture.detectChanges();

      expect(payButton()).toBeNull();
      expect(paidNote()).not.toBeNull();
    });

    it('clicking the pay button emits payCash', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      fixture.detectChanges();
      const spy = spyOn(component.payCash, 'emit');

      payButton()?.click();

      expect(spy).toHaveBeenCalled();
    });

    it('the next-item button is always present and clicking it emits nextItem', () => {
      component.result = onSeatResult;
      fixture.detectChanges();
      const spy = spyOn(component.nextItem, 'emit');

      nextItemButton().click();

      expect(spy).toHaveBeenCalled();
    });

    it('renders a real DOM check for isNextItemPrimary via the admin-btn-primary class', () => {
      component.result = freeAisleResult; // next-item IS the only action here
      fixture.detectChanges();

      expect(nextItemButton().classList.contains('admin-btn-primary')).toBeTrue();
    });
  });

  describe('DOM rendering', () => {
    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
    });

    it('renders no button/link at all when result is null', () => {
      fixture.componentInstance.result = null;
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.parcel-intake-result'))).toBeNull();
    });
  });

  // ── OBRS-747: measured contrast of this panel on the now-THEMED surface ────
  //
  // History, because this block used to assert the opposite. OBRS-726 was filed
  // claiming the 48px check_circle glyph rendered --admin-accepted-text #0a3d1d
  // on the #1d2226 dark card at 1.30:1. Measured in ChromeHeadless against the
  // chain below — the page's REAL markup (parcel-consign-page.component.html:
  // .container-fluid > .card.shadow-sm > <app-parcel-intake-result-panel>) — the
  // painted surface turned out to be #ffffff in BOTH themes, because that wrapper
  // is a raw Bootstrap `.card` and nothing repainted it for dark mode. So the
  // chip token was actually shipping at 12.37:1 and the "correct" themed token
  // would have shipped at 1.67:1. OBRS-726 therefore PINNED the un-themed
  // surface, and its pin is what brought us here.
  //
  // OBRS-747 themed that surface (`.admin-shell.is-dark .card` in
  // admin-theme.scss), so the pin has done its job and is replaced by the
  // ordinary assertions it was standing in for: the surface differs by mode, and
  // every text role in this panel clears AA on the surface actually painted.
  // Those roles are the point of the card — `dd` carries the tracking number,
  // collection code and amount a clerk reads aloud, and it measured 1.18:1.
  describe('contrast on the themed surface, measured (OBRS-747)', () => {
    // The staff shell page wraps its content in a raw BOOTSTRAP .card, not
    // .admin-card. Outermost first.
    const PAGE_CHAIN = ['admin-shell theme-staff', 'container-fluid py-4', 'card shadow-sm border-0 p-4'];

    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;
    let teardown: (() => void) | null = null;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();
      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
      fixture.componentInstance.result = consignedResult;
    });

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    function mount(dark: boolean): HTMLElement {
      teardown = mountInChain(fixture.nativeElement, PAGE_CHAIN, dark);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('.parcel-intake-result-icon') as HTMLElement;
    }

    function remount(dark: boolean): HTMLElement {
      teardown?.();
      teardown = null;
      return mount(dark);
    }

    /** Every text role this panel renders, with the WCAG floor that applies to it. */
    const ROLES: { selector: string; label: string; floor: number }[] = [
      // 48px glyph, so 3:1 is the binding floor — but it measures 9.61:1 dark and
      // 12.37:1 light, so hold it to the stricter text floor to catch a slip early.
      { selector: '.parcel-intake-result-icon', label: 'result icon (48px glyph)', floor: AA_NORMAL_TEXT },
      { selector: '.parcel-intake-result-list dt', label: 'dt (field labels)', floor: AA_NORMAL_TEXT },
      { selector: '.parcel-intake-result-list dd', label: 'dd (tracking no. / code / amount)', floor: AA_NORMAL_TEXT },
      { selector: 'h5', label: 'h5 heading', floor: AA_LARGE_TEXT },
    ];

    // What the OBRS-726 pin was standing in for. It asserted #ffffff in BOTH
    // modes; the surface is themed now, so the honest assertion is that the two
    // modes DIFFER and that dark really is the shell's card token.
    it('the surface under this panel is themed — dark differs from light (OBRS-747)', () => {
      const bgLight = toHex(effectiveBg(remount(false)));

      const iconDark = remount(true);
      const bgDark = toHex(effectiveBg(iconDark));
      const shell = document.querySelector('.admin-shell') as HTMLElement;
      const cardToken = toHex(resolveTokenColour(shell, '--admin-surface-card'));

      expect(bgLight)
        .withContext('light mode keeps Bootstrap white — OBRS-747 is a dark-only rule')
        .toBe('#ffffff');
      expect(bgDark)
        .withContext(
          `dark-mode painted background is ${bgDark}. Before OBRS-747 this was #ffffff, because ` +
            `parcel-consign-page wraps the panel in a raw Bootstrap .card that nothing repainted. ` +
            `It must now resolve to --admin-surface-card (${cardToken}) via ` +
            `\`.admin-shell.is-dark .card\` in admin-theme.scss.`
        )
        .toBe(cardToken);
      expect(bgDark).not.toBe(bgLight);
    });

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: every text role in the panel meets AA on the surface actually painted`, () => {
        mount(dark);
        const failures: string[] = [];
        for (const role of ROLES) {
          const el = fixture.nativeElement.querySelector(role.selector) as HTMLElement | null;
          // A selector that stops matching would make this test vacuously green,
          // which is the failure mode that let "0 elements below AA" ship once.
          expect(el).withContext(`${role.label}: ${role.selector} rendered nothing to measure`).not.toBeNull();
          if (!el) continue;
          const bg = effectiveBg(el);
          const ratio = contrast(fgOf(el), bg);
          if (ratio < role.floor) {
            failures.push(
              `${role.label} ${toHex(fgOf(el))} on ${toHex(bg)} = ${ratio.toFixed(2)}:1 (floor ${role.floor})`
            );
          }
        }
        expect(failures)
          .withContext(`${mode}: below-AA roles in app-parcel-intake-result-panel`)
          .toEqual([]);
      });
    }

    it('the icon is on the themed --admin-accepted-fg, not the chip half (OBRS-747)', () => {
      const icon = remount(true);
      const shell = document.querySelector('.admin-shell') as HTMLElement;
      const chipHalf = resolveTokenColour(shell, '--admin-accepted-text');
      const surfaceRole = resolveTokenColour(shell, '--admin-accepted-fg');

      // The swap OBRS-726 measured and deliberately deferred. Asserting it against
      // the RESOLVED token, not a hex literal, so a palette change can move the
      // value without this test lying about which role is in use.
      expect(toHex(fgOf(icon)))
        .withContext('the icon must use the surface-role token now that the surface is themed')
        .toBe(toHex(surfaceRole));
      expect(toHex(fgOf(icon)))
        .withContext('and must no longer be the chip half, which measures 1.30:1 on the dark card')
        .not.toBe(toHex(chipHalf));
    });
  });

  // OBRS-960 — "จุดนี้ยังไม่ได้ผูกกับจุดขายตั๋ว" warning: a property of the
  // RESULT (`salesPointMapped`), not the input, and must render regardless
  // of which branch (consigned/carry-on) the result belongs to.
  describe('salesPointMapped === false — unmapped sales point warning (OBRS-960)', () => {
    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();
      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
    });

    function warningEl(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="parcel-sales-point-not-mapped-warning"]');
    }

    it('renders the warning when salesPointMapped is explicitly false (consigned result)', () => {
      fixture.componentInstance.result = { ...consignedResult, salesPointMapped: false };
      fixture.detectChanges();
      expect(warningEl()).not.toBeNull();
    });

    it('renders the warning when salesPointMapped is false on a carry-on result', () => {
      fixture.componentInstance.result = { ...onSeatResult, salesPointMapped: false };
      fixture.detectChanges();
      expect(warningEl()).not.toBeNull();
    });

    it('does NOT render the warning when salesPointMapped is true', () => {
      fixture.componentInstance.result = { ...consignedResult, salesPointMapped: true };
      fixture.detectChanges();
      expect(warningEl()).toBeNull();
    });

    it('does NOT render the warning when salesPointMapped is absent (pre-OBRS-960 backend response)', () => {
      fixture.componentInstance.result = consignedResult;
      fixture.detectChanges();
      expect(warningEl()).toBeNull();
    });

    // Contrast: the new `.is-warning` colored element, measured on the same
    // real page chain the OBRS-747 block above uses (src/app/testing/contrast.ts).
    const PAGE_CHAIN = ['admin-shell theme-staff', 'container-fluid py-4', 'card shadow-sm border-0 p-4'];
    let teardown: (() => void) | null = null;

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      it(`${mode}: the warning text meets AA on the surface actually painted`, () => {
        fixture.componentInstance.result = { ...consignedResult, salesPointMapped: false };
        teardown = mountInChain(fixture.nativeElement, PAGE_CHAIN, dark);
        fixture.detectChanges();

        const el = warningEl();
        expect(el).not.toBeNull();
        if (!el) return;
        const ratio = contrast(fgOf(el), effectiveBg(el));
        expect(ratio)
          .withContext(`${mode}: ${toHex(fgOf(el))} on ${toHex(effectiveBg(el))} = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});
