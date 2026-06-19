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
 */
@Directive({
  selector: '[adminModalBackdrop]',
})
export class AdminModalBackdropDirective implements OnInit, OnDestroy {
  @Input() dismissOnBackdrop = true;
  @Output() dismiss = new EventEmitter<void>();

  private previouslyFocused: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const dialog = this.elementRef.nativeElement.querySelector<HTMLElement>(
      '.admin-modal, .user-editor-modal'
    );
    if (!dialog) {
      return;
    }
    this.dialog = dialog;

    if (!dialog.getAttribute('role')) {
      dialog.setAttribute('role', 'dialog');
    }
    dialog.setAttribute('aria-modal', 'true');

    const title = dialog.querySelector<HTMLElement>('.admin-modal-title, .user-editor-title');
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
    document.body.style.overflow = '';
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
