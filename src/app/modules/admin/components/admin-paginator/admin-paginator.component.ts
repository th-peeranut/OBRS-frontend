import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

// OBRS-403: promoted from the inline Previous/Next markup that already lived
// in bookings-page.component.html (built from admin-theme.scss's
// .admin-inline-actions/.admin-btn primitives, themed in both light+dark) —
// now that a second admin list (usability-reports) needs the same
// server-side paginator, this is the shared dumb component both call sites
// render. Deliberately no .scss: every class it renders resolves against the
// global admin-theme.scss, verbatim — which is also why AdminSharedModule
// (admin/staff shells only), not SharedModule, declares it: those classes only
// style inside `.admin-shell`. See AdminSharedModule's docblock.
//
// OBRS-466 (a11y): on a page change the parent list re-fetches, which briefly
// disables both buttons (and, on the usability page, used to unmount the whole
// footer). Either way the button the keyboard user just activated stops being
// focusable, so focus fell back to <body> — stranding an AT/keyboard user at
// the top of the document on every page turn — and the page number was never
// announced. This component now (1) restores focus onto the paginator once the
// buttons are interactive again, and (2) owns a single persistent visually-
// hidden aria-live region that announces "Page X of Y". Callers must keep the
// paginator MOUNTED across the loading window for the focus half to work (the
// usability page keeps it mounted + disabled; see its footer template).
@Component({
  selector: 'app-admin-paginator',
  templateUrl: './admin-paginator.component.html',
})
export class AdminPaginatorComponent implements OnChanges {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() disabled = false;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChild('prevBtn') private prevBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('nextBtn') private nextBtn?: ElementRef<HTMLButtonElement>;

  // OBRS-466: the translated "Page X of Y" announced by the live region.
  protected pageStatus = '';

  // OBRS-466: which control the user last activated from here, so focus can be
  // restored to it (or its still-enabled sibling) once the page change settles.
  private lastActivated: 'prev' | 'next' | null = null;

  constructor(private readonly translate: TranslateService) {}

  protected onPrev(): void {
    this.lastActivated = 'prev';
    this.pageChange.emit(this.currentPage - 1);
  }

  protected onNext(): void {
    this.lastActivated = 'next';
    this.pageChange.emit(this.currentPage + 1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Announce the new page — but not the initial mount value (firstChange),
    // which is the list's first render, not a navigation the user performed.
    const pageChanged = changes['currentPage'] && !changes['currentPage'].firstChange;
    if (pageChanged) {
      this.pageStatus = this.translate.instant('ADMIN.COMMON.PAGINATION_STATUS_ARIA', {
        current: this.currentPage,
        total: this.totalPages,
      });
    }

    // Restore focus only when the user drove the change from here and the
    // controls are interactive again (the parent's re-fetch has settled, so
    // `disabled` is back to false). Deferred a macrotask so the [disabled]/
    // *ngIf bindings have flushed to the real DOM before we pick a target —
    // focusing a button that is about to be disabled this same tick is a no-op.
    if (this.lastActivated && !this.disabled) {
      setTimeout(() => this.restoreFocus());
    }
  }

  private restoreFocus(): void {
    if (!this.lastActivated) {
      return;
    }
    const prev = this.prevBtn?.nativeElement;
    const next = this.nextBtn?.nativeElement;
    const preferred = this.lastActivated === 'prev' ? prev : next;
    const fallback = this.lastActivated === 'prev' ? next : prev;
    // Focus the button the user pressed if it is still enabled; otherwise its
    // sibling — e.g. pressing Next to reach the last page disables Next, so
    // focus moves to Prev rather than escaping to <body>.
    const target =
      preferred && !preferred.disabled
        ? preferred
        : fallback && !fallback.disabled
          ? fallback
          : null;
    target?.focus();
    this.lastActivated = null;
  }
}
