import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelIntakeResultPanelComponent } from './parcel-intake-result-panel.component';
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
    const component = new ParcelIntakeResultPanelComponent();
    expect(component).toBeTruthy();
  });

  it('defaults result to null', () => {
    const component = new ParcelIntakeResultPanelComponent();
    expect(component.result).toBeNull();
  });

  it('accepts an assigned result', () => {
    const component = new ParcelIntakeResultPanelComponent();
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
      const component = new ParcelIntakeResultPanelComponent();
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
      const component = new ParcelIntakeResultPanelComponent();
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
      const component = new ParcelIntakeResultPanelComponent();
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
      const component = new ParcelIntakeResultPanelComponent();
      component.result = consignedResult;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for a free-aisle carry-on result (no other action exists)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = freeAisleResult;
      expect(component['isNextItemPrimary']).toBeTrue();
    });

    it('is false for an on-seat UNPAID result ("เก็บเงินสด" is primary)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = onSeatResult;
      component.carryOnPaid = false;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for an on-seat PAID result (pay button is gone)', () => {
      const component = new ParcelIntakeResultPanelComponent();
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

  // ── OBRS-726: measured contrast of the result icon ─────────────────────────
  //
  // The 48px check_circle glyph uses --admin-accepted-text, the dark half of a
  // pastel CHIP pair, as a standalone colour. `check-admin-theme-tokens.mjs`
  // catches that shape statically as of this card, but it cannot know what this
  // panel's ANCESTORS paint — and that turned out to be the whole question.
  //
  // OBRS-726 was filed asserting this glyph rendered #0a3d1d on the #1d2226 dark
  // card at 1.30:1. It does not. The chain below is the page's REAL markup
  // (parcel-consign-page.component.html: .container-fluid > .card.shadow-sm >
  // <app-parcel-intake-result-panel>), and measured in ChromeHeadless the
  // painted surface is #ffffff in BOTH themes, because that wrapper is a raw
  // Bootstrap `.card` and nothing repaints it for dark mode. So the glyph ships
  // at 12.37:1, and swapping in the themed --admin-accepted-fg (dark #9cd6a5)
  // would have taken it DOWN to 1.67:1.
  //
  // These tests therefore pin the un-themed surface rather than assert a fix.
  // The surface is the real defect and a much worse one — this panel's own `dd`
  // values measure 1.18:1 on it — which is OBRS-747. When that lands, the first
  // test here goes red on purpose and hands the next reader the whole to-do list.
  describe('contrast of .parcel-intake-result-icon, measured (OBRS-726)', () => {
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

    // THE PIN. Not a preference — the fact that decided this card's scope, and
    // the trigger that reopens it. Measured, both modes, real markup.
    it('the surface under this panel is STILL un-themed — #ffffff in both modes (OBRS-747)', () => {
      const iconLight = mount(false);
      const bgLight = toHex(effectiveBg(iconLight));
      teardown?.();
      teardown = null;

      const iconDark = mount(true);
      const bgDark = toHex(effectiveBg(iconDark));

      const todo =
        `When this test fails, OBRS-747 has themed the wrapper and THREE things are now due: ` +
        `(1) point .parcel-intake-result-icon at --admin-accepted-fg (already declared, light ` +
        `#0a3d1d / dark #9cd6a5); (2) delete the STANDALONE_CHIP_ALLOW entry for this file in ` +
        `scripts/check-admin-theme-tokens.mjs, which fails on a stale entry; (3) replace this ` +
        `test with the ordinary "dark surface differs from light" assertion.`;

      expect(bgLight).withContext(`light-mode painted background. ${todo}`).toBe('#ffffff');
      expect(bgDark)
        .withContext(
          `dark-mode painted background is ${bgDark}. The page wraps this panel in a raw ` +
            `Bootstrap .card and nothing repaints it for dark mode (sell-page.component.scss / ` +
            `OBRS-128 is the only staff page that opted in). ${todo}`
        )
        .toBe('#ffffff');
    });

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the icon meets AA on the surface actually painted`, () => {
        const icon = mount(dark);
        const bg = effectiveBg(icon);
        const ratio = contrast(fgOf(icon), bg);
        // 48px, so AA_LARGE_TEXT (3:1) is the binding requirement; assert the
        // stricter normal-text floor anyway because the measured value (12.37:1)
        // clears it by a wide margin, so a regression should be caught early.
        expect(ratio)
          .withContext(
            `${mode}: icon ${toHex(fgOf(icon))} on painted background ${toHex(bg)} = ` +
              `${ratio.toFixed(2)}:1 (large-text floor ${AA_LARGE_TEXT}, normal ${AA_NORMAL_TEXT})`
          )
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }

    it('keeps the chip token DELIBERATELY, and the surface-role token is ready for OBRS-747', () => {
      const icon = mount(true);
      const shell = document.querySelector('.admin-shell') as HTMLElement;
      const chipHalf = resolveTokenColour(shell, '--admin-accepted-text');
      const surfaceRole = resolveTokenColour(shell, '--admin-accepted-fg');

      // The chip token is what ships here, on purpose, while the surface is
      // un-themed. Pinned so nobody "fixes" it back without reading the note.
      expect(toHex(fgOf(icon)))
        .withContext('the icon must stay on --admin-accepted-text until OBRS-747 themes the surface')
        .toBe(toHex(chipHalf));

      // And the token that WILL replace it is declared and really is themed --
      // otherwise OBRS-726 shipped a rule with no token behind it.
      expect(toHex(surfaceRole))
        .withContext('--admin-accepted-fg must be declared AND differ from the chip half in dark mode')
        .not.toBe(toHex(chipHalf));
      expect(contrast(surfaceRole, [29, 34, 38]))
        .withContext('--admin-accepted-fg dark on --admin-surface-card #1d2226')
        .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });
});
