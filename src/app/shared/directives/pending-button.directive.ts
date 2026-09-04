import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostBinding,
  Input,
  OnChanges,
  Renderer2,
  SimpleChanges,
  ViewContainerRef,
} from '@angular/core';
import { LoadingStateComponent, LoadingStateGraphic } from '../components/loading-state/loading-state.component';

/**
 * OBRS-910 phase 1: a button-level "this is submitting" indicator, replacing
 * the ~12 hand-rolled `<span class="spinner">` / Bootstrap `.spinner-border`
 * copies each call site inserted next to its own label.
 *
 * Deliberately does NOT touch the host's `[disabled]` binding — `pending` and
 * `disabled` are two separate inputs/bindings on the call site, so a button
 * disabled because a form is invalid never picks up a spinner or
 * `aria-busy` just because it also happens to be disabled.
 *
 * The `<app-loading-state variant="inline">` slot is created and inserted as
 * the button's first child from `ngAfterViewInit` UNCONDITIONALLY (even when
 * `pending` starts `false`) and only ever toggled with `visibility`, never
 * `display`/added-removed — most buttons this attaches to are
 * `width: auto` (shrink-to-fit), so the slot occupying space in both states
 * is what keeps the button's rendered width identical whether or not it is
 * pending (see loading-state's own AC-3 spec for the pinned-width assertion).
 */
@Directive({
  selector: '[appPending]',
  standalone: false,
})
export class PendingButtonDirective implements AfterViewInit, OnChanges {
  @Input('appPending') pending = false;
  @Input() appPendingGraphic: LoadingStateGraphic = 'ring';
  @Input() appPendingSizePx = 16;
  @Input() appPendingIconOnly = false;

  @HostBinding('attr.aria-busy')
  get ariaBusy(): string | null {
    return this.pending ? 'true' : null;
  }

  private spinnerEl: HTMLElement | null = null;
  private originalChildren: HTMLElement[] = [];

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly renderer: Renderer2
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pending'] && this.spinnerEl) {
      this.applyVisibility();
    }
  }

  ngAfterViewInit(): void {
    const host = this.elementRef.nativeElement;
    this.renderer.addClass(host, 'app-pending-slot');
    this.ensureBaselineLayout(host);

    if (this.appPendingIconOnly) {
      this.originalChildren = Array.from(host.children) as HTMLElement[];
      if (getComputedStyle(host).position === 'static') {
        this.renderer.setStyle(host, 'position', 'relative');
      }
    }

    const componentRef = this.viewContainerRef.createComponent(LoadingStateComponent);
    componentRef.instance.variant = 'inline';
    componentRef.instance.graphic = this.appPendingGraphic;
    componentRef.instance.sizePx = this.appPendingSizePx;
    componentRef.changeDetectorRef.detectChanges();

    this.spinnerEl = componentRef.location.nativeElement as HTMLElement;

    if (this.appPendingIconOnly) {
      this.renderer.setStyle(this.spinnerEl, 'position', 'absolute');
      this.renderer.setStyle(this.spinnerEl, 'inset', '0');
      this.renderer.setStyle(this.spinnerEl, 'display', 'inline-flex');
      this.renderer.setStyle(this.spinnerEl, 'align-items', 'center');
      this.renderer.setStyle(this.spinnerEl, 'justify-content', 'center');
    }

    this.renderer.insertBefore(host, this.spinnerEl, host.firstChild);
    this.applyVisibility();
  }

  // `.admin-btn`/`.admin-icon-btn` already lay out as `inline-flex` with an
  // 8px gap; `mr-btn-primary`/`btn-primary` (customer + Bootstrap) are
  // `display: inline-block`, which would stack the spinner slot ABOVE the
  // label instead of beside it. Only touch layout the host doesn't already
  // have.
  private ensureBaselineLayout(host: HTMLElement): void {
    if (!getComputedStyle(host).display.includes('flex')) {
      this.renderer.setStyle(host, 'display', 'inline-flex');
      this.renderer.setStyle(host, 'align-items', 'center');
      this.renderer.setStyle(host, 'gap', '8px');
    }
  }

  private applyVisibility(): void {
    if (!this.spinnerEl) {
      return;
    }
    this.renderer.setStyle(this.spinnerEl, 'visibility', this.pending ? 'visible' : 'hidden');

    if (this.appPendingIconOnly) {
      const glyphVisibility = this.pending ? 'hidden' : 'visible';
      for (const child of this.originalChildren) {
        this.renderer.setStyle(child, 'visibility', glyphVisibility);
      }
    }
  }
}
