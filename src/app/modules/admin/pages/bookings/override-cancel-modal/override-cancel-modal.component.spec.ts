import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { OverrideCancelModalComponent } from './override-cancel-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { AdminApiService, AdminBookingDetailDto } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';

// Far future → inside the cancellation window; far past → out-of-window. Using
// fixed sentinel dates keeps the window check deterministic without faking the
// clock.
function bookingWithDeparture(departure: string): AdminBookingDetailDto {
  return {
    id: 42,
    bookingNumber: '#BK-42',
    status: { code: 'confirmed', label: 'Confirmed' },
    journeys: [
      {
        fromStop: { code: 'a', label: 'A' },
        toStop: { code: 'b', label: 'B' },
        departureDateTime: departure,
      },
    ],
  };
}

const IN_WINDOW = bookingWithDeparture('2099-01-01T00:00:00Z');
const OUT_OF_WINDOW = bookingWithDeparture('2000-01-01T00:00:00Z');

describe('OverrideCancelModalComponent (OBRS-690)', () => {
  let fixture: ComponentFixture<OverrideCancelModalComponent>;
  let component: OverrideCancelModalComponent;
  let api: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', ['adminOverrideCancelBooking']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    alert.error.and.resolveTo(undefined as any);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [OverrideCancelModalComponent, AdminModalBackdropDirective],
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OverrideCancelModalComponent);
    component = fixture.componentInstance;
  });

  // Open the dialog the way the parent's template binding would: set inputs,
  // then let Angular's ngOnChanges reset the form + validators.
  function open(booking: AdminBookingDetailDto): void {
    component.booking = booking;
    component.isOpen = true;
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
    fixture.detectChanges();
  }

  const reasonField = () =>
    fixture.debugElement.query(By.css('textarea[formControlName="reason"]'));

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('AC2: hides the reason field for an in-window POLICY cancel', () => {
    open(IN_WINDOW);
    expect((component as any).reasonRequired).toBeFalse();
    expect(reasonField()).toBeNull();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC1: renders two rate buttons, never a numeric input', () => {
    open(IN_WINDOW);
    const rateButtons = fixture.debugElement.queryAll(By.css('.override-rate-btn'));
    expect(rateButtons.length).toBe(2);
    expect(fixture.debugElement.query(By.css('input[type="number"]'))).toBeNull();
  });

  it('AC2: choosing FULL reveals the reason field and blocks submit until it is filled', () => {
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    fixture.detectChanges();

    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();

    (component as any).form.get('reason').setValue('full refund authorised by owner');
    fixture.detectChanges();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC2: an out-of-window POLICY cancel still requires a reason (window is a rule-break)', () => {
    open(OUT_OF_WINDOW);
    expect((component as any).rateChoice).toBe('POLICY');
    expect((component as any).outsideWindow).toBeTrue();
    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  it('submits POLICY with no reason for an in-window cancel and emits cancelled + closed', async () => {
    api.adminOverrideCancelBooking.and.returnValue(of({ code: 200, message: 'Booking cancelled' }));
    const cancelled = jasmine.createSpy('cancelled');
    const closed = jasmine.createSpy('closed');
    component.cancelled.subscribe(cancelled);
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'POLICY',
      reason: undefined,
    });
    expect(cancelled).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalled();
  });

  it('submits FULL with the trimmed reason', async () => {
    api.adminOverrideCancelBooking.and.returnValue(of({ code: 200, message: 'ok' }));
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    (component as any).form.get('reason').setValue('  goodwill full refund  ');
    fixture.detectChanges();

    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'FULL',
      reason: 'goodwill full refund',
    });
  });

  it('keeps the dialog open and shows an inline error when the API fails', async () => {
    api.adminOverrideCancelBooking.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'Booking is not confirmed' },
          })
      )
    );
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect((component as any).errorMessage).toBe('Booking is not confirmed');
    expect(closed).not.toHaveBeenCalled();
  });

  // ── OBRS-721: dark-mode contrast, measured ─────────────────────────────────
  //
  // Why a spec and not the token gate: `check-admin-theme-tokens.mjs` can only ask
  // "is this token declared?". All three defects it missed here were about the
  // token being WRONG, not absent:
  //   * --admin-muted-bg / --admin-text-muted were never declared, so the panel
  //     fell through to a hard-coded light-mode wash and the dt silently inherited
  //     body text (measured on SIT: panel #1c2024, DARKER than the #1d2226 card it
  //     sits on, and dt identical to dd);
  //   * --admin-danger-text IS declared and passes the gate, but it is DARK_EXEMPT
  //     on purpose -- it is the dark half of a pastel chip pair, not a standalone
  //     text colour. Used bare on .is-violation it rendered 1.71:1 on the dark
  //     card: the exact ratio .admin-btn-danger shipped at in OBRS-520.
  // A ratio the browser computes cannot be argued with, so measure it here. These
  // run in ChromeHeadless with src/styles.scss (which @imports admin-theme.scss)
  // loaded by the karma `styles` array, so the var() chain resolves exactly as
  // production does. Related: OBRS-722 (same misuse at 3 other call sites).
  describe('dark-mode contrast of the muted + danger text (OBRS-721)', () => {
    const AA_NORMAL_TEXT = 4.5;
    let shell: HTMLElement | null = null;

    /** Move the component host inside a real .admin-shell so --admin-* resolves. */
    function mountInShell(dark: boolean): void {
      shell = document.createElement('div');
      shell.className = dark ? 'admin-shell theme-admin is-dark' : 'admin-shell theme-admin';
      document.body.appendChild(shell);
      shell.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => {
      shell?.remove();
      shell = null;
    });

    function rgba(colour: string): [number, number, number, number] {
      const m = colour.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(',').map((v) => parseFloat(v.trim()));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }

    /**
     * The painted background: walk up compositing any translucent layer onto its
     * ancestor. Without this, `rgba(0, 0, 0, 0.03)` (the old fallback) would read
     * as an opaque near-black and the dark-mode failure would hide behind a
     * flattering number.
     */
    function effectiveBg(element: Element | null): [number, number, number] {
      const layers: [number, number, number, number][] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const c = rgba(getComputedStyle(node).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      if (layers.length === 0) return [255, 255, 255];
      let [r, g, b] = layers[layers.length - 1];
      for (let i = layers.length - 2; i >= 0; i--) {
        const [tr, tg, tb, ta] = layers[i];
        r = tr * ta + r * (1 - ta);
        g = tg * ta + g * (1 - ta);
        b = tb * ta + b * (1 - ta);
      }
      return [r, g, b];
    }

    function contrast(fg: [number, number, number], bg: [number, number, number]): number {
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (c: number) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(fg);
      const b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
    const fg = (element: HTMLElement) =>
      rgba(getComputedStyle(element).color).slice(0, 3) as [number, number, number];

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the summary label is muted, not inherited body text`, () => {
        open(IN_WINDOW);
        mountInShell(dark);
        // An undeclared token with no fallback resolves to nothing and the label
        // inherits -- visually identical to its own value, which is the bug.
        expect(getComputedStyle(el('.override-cancel-summary dt')).color).not.toBe(
          getComputedStyle(el('.override-cancel-summary dd')).color
        );
      });

      it(`${mode}: summary label meets AA on the summary panel`, () => {
        open(IN_WINDOW);
        mountInShell(dark);
        const ratio = contrast(
          fg(el('.override-cancel-summary dt')),
          effectiveBg(el('.override-cancel-summary'))
        );
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the out-of-window violation banner meets AA on the modal card`, () => {
        open(OUT_OF_WINDOW);
        mountInShell(dark);
        const banner = el('.override-cancel-window');
        expect(banner.classList).toContain('is-violation'); // guard: the state under test is really on
        expect(contrast(fg(banner), effectiveBg(banner))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});
