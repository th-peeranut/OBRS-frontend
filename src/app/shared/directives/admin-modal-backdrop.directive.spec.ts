import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminModalBackdropDirective } from './admin-modal-backdrop.directive';

// OBRS-376: locks the REF-COUNTED body scroll-lock. The duplicate picker is the
// first modal-over-modal case that mounts two `adminModalBackdrop` instances at
// once, and the previous unconditional `body.overflow = ''` in ngOnDestroy
// un-locked page scroll as soon as the INNER modal closed, while the outer one
// was still open. These specs fail against that old implementation.
@Component({
  template: `
    <div class="admin-modal-backdrop" *ngIf="outer" adminModalBackdrop>
      <div class="admin-modal">
        <h4 class="admin-modal-title">Outer</h4>
        <button>outer</button>
      </div>
    </div>
    <div class="admin-modal-backdrop" *ngIf="inner" adminModalBackdrop>
      <div class="admin-modal">
        <h4 class="admin-modal-title">Inner</h4>
        <button>inner</button>
      </div>
    </div>
  `,
})
class BackdropHostComponent {
  outer = false;
  inner = false;
}

describe('AdminModalBackdropDirective — body scroll lock', () => {
  let fixture: ComponentFixture<BackdropHostComponent>;
  let host: BackdropHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [BackdropHostComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(BackdropHostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    // Never leak a locked <body> into a later spec.
    host.outer = false;
    host.inner = false;
    fixture.detectChanges();
    fixture.destroy();
  });

  it('locks body scroll while a single modal is open and releases it on close', () => {
    host.outer = true;
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');

    host.outer = false;
    fixture.detectChanges();
    expect(document.body.style.overflow)
      .withContext('last backdrop unmounted -> lock released')
      .toBe('');
  });

  it('keeps body scroll locked when an inner modal closes while the outer one is still open', () => {
    host.outer = true;
    fixture.detectChanges();

    host.inner = true;
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');

    // Closing ONLY the inner (picker) layer must not un-lock the page behind
    // the outer (detail) modal, which is still mounted.
    host.inner = false;
    fixture.detectChanges();
    expect(document.body.style.overflow)
      .withContext('outer modal still open -> body must remain locked')
      .toBe('hidden');

    host.outer = false;
    fixture.detectChanges();
    expect(document.body.style.overflow)
      .withContext('both closed -> lock finally released')
      .toBe('');
  });
});
