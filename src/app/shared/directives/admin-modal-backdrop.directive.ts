import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

/**
 * Adds dialog semantics and standard dismissal behaviour to an
 * `.admin-modal-backdrop` element: marks the inner `.admin-modal` as an
 * accessible dialog, locks body scroll while open, restores focus on close,
 * and emits `dismiss` on Escape or a click on the backdrop itself.
 *
 * OBRS-272: relocated from `modules/admin/components/` into `shared/directives/`
 * and declared/exported by `SharedModule` rather than `AdminModule`. The
 * directive is generic (backdrop/Escape/focus-trap/scroll-lock/aria, nothing
 * admin-specific) — moving it here lets `BoardingListComponent` (declared in
 * `SharedModule`, mounted by the staff shell) use `[adminModalBackdrop]` for
 * its new delay-ETA dialog without `SharedModule` reaching into the lazy
 * `AdminModule` (a module cycle, since `AdminModule` already imports
 * `SharedModule`). Both `AdminModule` and `StaffModule` import `SharedModule`,
 * so admin's existing modals keep resolving the directive unchanged. See
 * docs/adr/0017-schedule-delay-control-and-modal-backdrop-relocation.md.
 */
@Directive({
  selector: '[adminModalBackdrop]',
})
export class AdminModalBackdropDirective implements OnInit, OnDestroy {
  @Input() dismissOnBackdrop = true;
  @Output() dismiss = new EventEmitter<void>();

  // OBRS-376: the body scroll-lock is REF-COUNTED across every mounted
  // instance. Previously ngOnDestroy cleared `body.overflow` unconditionally,
  // which was correct only while at most ONE backdrop was mounted at a time.
  // The duplicate picker is the first modal-over-modal case that mounts two
  // instances concurrently (picker above the usability-report detail modal),
  // so closing the inner picker un-locked page scroll while the detail modal
  // underneath was still open. Counting mounts holds the lock until the LAST
  // backdrop unmounts; with a single modal the count is 1 -> 0 and behaviour
  // is byte-identical to before.
  private static openCount = 0;

  private previouslyFocused: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    AdminModalBackdropDirective.openCount++;
    document.body.style.overflow = 'hidden';

    // OBRS-433: '.mr-detail-modal' is the "My Reports" customer-shell detail
    // modal — its visual shell is its own scoped CSS (not `.admin-modal`,
    // which depends on `--admin-*` vars only defined inside `.admin-shell`),
    // but it still uses this SAME generic backdrop/ESC/focus-trap/scroll-lock
    // directive, so its dialog element needs to be found here too.
    const dialog = this.elementRef.nativeElement.querySelector<HTMLElement>(
      '.admin-modal, .user-editor-modal, .mr-detail-modal'
    );
    if (!dialog) {
      return;
    }
    this.dialog = dialog;

    if (!dialog.getAttribute('role')) {
      dialog.setAttribute('role', 'dialog');
    }
    dialog.setAttribute('aria-modal', 'true');

    const title = dialog.querySelector<HTMLElement>(
      '.admin-modal-title, .user-editor-title, .mr-detail-title'
    );
    if (title) {
      if (!title.id) {
        title.id = `admin-modal-title-${Math.random().toString(36).slice(2, 9)}`;
      }
      dialog.setAttribute('aria-labelledby', title.id);
    }

    const focusable = dialog.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? dialog).focus?.();
  }

  ngOnDestroy(): void {
    AdminModalBackdropDirective.openCount = Math.max(
      0,
      AdminModalBackdropDirective.openCount - 1
    );
    // Only release the lock once no backdrop is left mounted — otherwise an
    // inner modal closing would un-lock scroll for the outer one still open.
    if (AdminModalBackdropDirective.openCount === 0) {
      document.body.style.overflow = '';
    }
    this.previouslyFocused?.focus?.();
  }

  @HostListener('click', ['$event'])
  protected onBackdropClick(event: MouseEvent): void {
    if (this.dismissOnBackdrop && event.target === this.elementRef.nativeElement) {
      this.dismiss.emit();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.dismiss.emit();
  }

  // Keep keyboard focus inside the dialog while it is open (focus trap).
  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialog) {
      return;
    }

    const focusable = this.getFocusable();
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !this.dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusable(): HTMLElement[] {
    if (!this.dialog) {
      return [];
    }
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(this.dialog.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => element.offsetParent !== null
    );
  }
}
