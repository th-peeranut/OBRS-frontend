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
});
