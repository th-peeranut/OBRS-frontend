import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { LoadingStateComponent } from '../components/loading-state/loading-state.component';
import { PendingButtonDirective } from './pending-button.directive';

@Component({
  template: `
    <button type="button" class="btn-primary" [disabled]="disabled" [appPending]="pending">
      Confirm
    </button>
  `,
  standalone: false,
})
class PlainButtonHostComponent {
  pending = false;
  disabled = false;
}

@Component({
  template: `
    <button
      type="button"
      class="admin-icon-btn"
      [disabled]="disabled"
      [appPending]="pending"
      [appPendingIconOnly]="true"
    >
      <i class="bi bi-trash" aria-hidden="true"></i>
    </button>
  `,
  standalone: false,
})
class IconOnlyButtonHostComponent {
  pending = false;
  disabled = false;
}

// scrutinize (OBRS-910 review): a button OUTSIDE `.admin-shell` where `color`
// is something other than the `--accent` fallback (#0772a2 -> rgb(7, 114, 162))
// used by loading-state.component.scss's OWN default. Customer `.btn-primary`
// is rgb(59, 97, 169) (#3b61a9) — used here directly to reproduce that exact
// call site without depending on `.btn-primary`'s own stylesheet being loaded.
@Component({
  template: `
    <button type="button" style="color: rgb(59, 97, 169)" [appPending]="pending">Confirm</button>
  `,
  standalone: false,
})
class CustomerColoredButtonHostComponent {
  pending = true;
}

describe('PendingButtonDirective', () => {
  describe('plain <button> host', () => {
    let fixture: ComponentFixture<PlainButtonHostComponent>;
    let host: PlainButtonHostComponent;
    let button: HTMLButtonElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        declarations: [PlainButtonHostComponent, PendingButtonDirective, LoadingStateComponent],
        imports: [TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(PlainButtonHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
      button = fixture.debugElement.query(By.css('button')).nativeElement;
    });

    // ---- AC-2: aria-busy tracks `pending`, not `disabled` ----

    it('has no aria-busy while not pending, and aria-busy="true" while pending', () => {
      expect(button.getAttribute('aria-busy')).toBeNull();

      host.pending = true;
      fixture.detectChanges();
      expect(button.getAttribute('aria-busy')).toBe('true');

      host.pending = false;
      fixture.detectChanges();
      expect(button.getAttribute('aria-busy')).toBeNull();
    });

    // ---- AC-3: the reserved slot is inserted from ngAfterViewInit regardless
    // of the initial `pending` value, and only ever toggles visibility ----

    it('reserves the spinner slot as the button-s first child even when pending starts false', () => {
      const ring = button.querySelector('.loading-state-ring');
      expect(ring).withContext('slot must be reserved on init, not on first pending=true').toBeTruthy();
      expect(button.firstElementChild).toBe(ring!.closest('app-loading-state'));
      expect(getComputedStyle(ring as Element).visibility).toBe('hidden');
    });

    it('does not change the button-s rendered width between pending and non-pending', () => {
      const before = button.getBoundingClientRect().width;

      host.pending = true;
      fixture.detectChanges();
      const during = button.getBoundingClientRect().width;

      host.pending = false;
      fixture.detectChanges();
      const after = button.getBoundingClientRect().width;

      expect(during).toBeCloseTo(before, 0);
      expect(after).toBeCloseTo(before, 0);
    });

    it('pins the ring to the 16px default size via inline style, not the inline-variant em-based CSS default', () => {
      const ring: HTMLElement = button.querySelector('.loading-state-ring')!;
      expect(getComputedStyle(ring).width).toBe('16px');
      expect(getComputedStyle(ring).height).toBe('16px');
    });

    // ---- AC-4: both polarities — pending shows the spinner + aria-busy;
    // disabled-for-form-invalid-reasons (not pending) shows neither ----

    it('shows the spinner (visible) and aria-busy while pending, regardless of disabled', () => {
      host.pending = true;
      host.disabled = false;
      fixture.detectChanges();

      const ring = button.querySelector('.loading-state-ring') as HTMLElement;
      expect(getComputedStyle(ring).visibility).toBe('visible');
      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('shows neither a visible spinner nor aria-busy when disabled for a reason unrelated to pending (e.g. invalid form)', () => {
      host.pending = false;
      host.disabled = true;
      fixture.detectChanges();

      const ring = button.querySelector('.loading-state-ring') as HTMLElement;
      expect(getComputedStyle(ring).visibility).toBe('hidden');
      expect(button.getAttribute('aria-busy')).toBeNull();
      expect(button.disabled).toBe(true);
    });

    it('never touches the host-s own [disabled] binding', () => {
      host.disabled = true;
      host.pending = true;
      fixture.detectChanges();
      expect(button.disabled).toBe(true);

      host.disabled = false;
      fixture.detectChanges();
      expect(button.disabled).toBe(false);
      // still pending, and disabled/pending remain independent
      expect(button.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('icon-only host (appPendingIconOnly)', () => {
    let fixture: ComponentFixture<IconOnlyButtonHostComponent>;
    let host: IconOnlyButtonHostComponent;
    let button: HTMLButtonElement;
    let glyph: HTMLElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        declarations: [IconOnlyButtonHostComponent, PendingButtonDirective, LoadingStateComponent],
        imports: [TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(IconOnlyButtonHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
      button = fixture.debugElement.query(By.css('button')).nativeElement;
      glyph = button.querySelector('i') as HTMLElement;
    });

    it('overlays the spinner absolutely instead of adding width, and hides the original glyph only while pending', () => {
      const ring = button.querySelector('.loading-state-ring') as HTMLElement;
      const slot = ring.closest('app-loading-state') as HTMLElement;

      expect(getComputedStyle(slot).position).toBe('absolute');
      expect(getComputedStyle(glyph).visibility).toBe('visible');
      expect(getComputedStyle(ring).visibility).toBe('hidden');

      host.pending = true;
      fixture.detectChanges();
      expect(getComputedStyle(glyph).visibility).toBe('hidden');
      expect(getComputedStyle(ring).visibility).toBe('visible');

      host.pending = false;
      fixture.detectChanges();
      expect(getComputedStyle(glyph).visibility).toBe('visible');
      expect(getComputedStyle(ring).visibility).toBe('hidden');
    });

    it('gives the host position:relative so the absolute overlay anchors to the button box, not the viewport', () => {
      expect(getComputedStyle(button).position).toBe('relative');
    });

    it('does not grow the fixed 36x36 icon-only button width while pending', () => {
      const before = button.getBoundingClientRect().width;
      host.pending = true;
      fixture.detectChanges();
      expect(button.getBoundingClientRect().width).toBeCloseTo(before, 0);
    });
  });

  // scrutinize finding 1 (OBRS-910 review): `_loading.scss`'s
  // `.app-pending-slot .loading-state-ring { border-top-color: currentColor }`
  // and loading-state.component.scss's own `.loading-state-ring[_ngcontent] {
  // border-top-color: var(--accent, #0772a2) }` are equal (0,2,0) specificity,
  // and the component style is always injected after the global stylesheet
  // has loaded, so it always won and the ring silently ignored the button's
  // own color everywhere outside `.admin-shell`. This mounts a real button
  // with a non-accent `color` and reads the LIVE computed style off the ring
  // — it only stays green if `.app-pending-slot.app-pending-slot ...` in
  // `_loading.scss` is actually the selector that applies.
  describe('currentColor ring override (outside .admin-shell)', () => {
    let fixture: ComponentFixture<CustomerColoredButtonHostComponent>;
    let button: HTMLButtonElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        declarations: [CustomerColoredButtonHostComponent, PendingButtonDirective, LoadingStateComponent],
        imports: [TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(CustomerColoredButtonHostComponent);
      fixture.detectChanges();
      button = fixture.debugElement.query(By.css('button')).nativeElement;
    });

    it("inherits the button's own text color, not loading-state's fixed --accent fallback", () => {
      const ring = button.querySelector('.loading-state-ring') as HTMLElement;
      const buttonColor = getComputedStyle(button).color;
      const ringBorderTopColor = getComputedStyle(ring).borderTopColor;

      expect(buttonColor).toBe('rgb(59, 97, 169)');
      expect(ringBorderTopColor).toBe(buttonColor);
      expect(ringBorderTopColor).not.toBe('rgb(7, 114, 162)');
    });
  });
});
