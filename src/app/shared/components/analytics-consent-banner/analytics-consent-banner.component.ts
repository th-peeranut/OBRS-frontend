import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';
import { AnalyticsRouteScopeService } from '../../../services/analytics/analytics-route-scope.service';
import { isConsentControlRoute } from '../../lib/analytics-consent-control';

/**
 * OBRS-867 — the PDPA ask that stands in front of every measurement tag.
 *
 * DESIGN DECISIONS THAT ARE NOT COSMETIC
 *
 * **It is not a modal and it does not block the page.** A visitor who ignores
 * it entirely can still search, book and pay; they simply are not measured.
 * Consent obtained by making the site unusable until you click yes is not
 * consent, and this is a ticket shop, not a consent-harvesting funnel.
 *
 * **Accept and Decline are the same button.** Same size, same weight, same
 * position in the tab order — no faint text link for "no". That symmetry is the
 * difference between an ask and a dark pattern, and it costs us some accept
 * rate on purpose.
 *
 * **Declining is remembered.** `isUndecided$` is false for BOTH answers, so the
 * bar disappears after either one and never nags. (See the service for why
 * `unset` is a distinct third state rather than a synonym for denied.)
 *
 * **It does not ask on staff or admin pages (OBRS-887).** Not as a layout fix —
 * there is nothing there worth asking for. A salesperson cannot consent to
 * Clarity recording a screen full of a *customer's* name and phone number, and
 * measurement of an internal tool would rest on the employment relationship,
 * not on a bar at the bottom of the screen. An ask whose answer changes nothing
 * is worse than no ask. The tags are off there regardless of what is stored
 * here; see {@link AnalyticsService}.
 *
 * It hides only on a route KNOWN to be restricted, never on `unknown` — the
 * privacy property belongs to the tag loader, and a bar that blinks out while
 * the first route resolves would buy nothing for it.
 *
 * **It also stands down on `/privacy-policy` (OBRS-874).** That page carries the
 * full control — grant AND withdraw — so the bar there is the same question
 * asked twice on one screen. Worse, `withdraw` returns the answer to `unset`, so
 * without this the bar would pop up the instant a visitor withdrew, on the very
 * page they withdrew from. Unlike the staff/admin rule this is purely about not
 * asking twice: the page is still measurable and the tags still load there.
 *
 * **It reserves the room it occupies (OBRS-1372).** `position: fixed` takes the
 * bar out of the flow, so for eleven months everything in the bottom band of the
 * page was behind it — measured on prod at an iPhone 14 viewport, the Thai copy
 * wraps to seven lines, the bar is 246px = 37.1% of a 664px viewport, and four of
 * the nine pickup rows plus the "ยืนยันจุดรับ" button lost their tap to
 * `p.consent-banner__body`. Nothing could scroll clear of it because the document
 * ended where it always had. The bar keeps its size and its wording — both belong
 * to the notice it mirrors (OBRS-631 AC-17), and shrinking a consent ask to make
 * room is the ask becoming a formality — so the DOCUMENT grows instead: the same
 * number of pixels the bar covers are added to the bottom of `<body>`, and every
 * control can be scrolled out from under it. Measured with a `ResizeObserver`, not
 * a constant, because the height is a function of the language and the viewport
 * width; the four locales and every phone size would each need their own number.
 *
 * The one thing NOT given room back is the usability FAB, which is `fixed` too and
 * so cannot be scrolled anywhere. That overlap is deliberate and stays pinned by
 * `e2e/tests/analytics-consent-banner.spec.ts`; see the z-index note in the SCSS.
 *
 * The component holds no state of its own: `AnalyticsConsentService` is the
 * single source of truth, consumed through the async pipe so there is nothing
 * to unsubscribe.
 */
@Component({
    selector: 'app-analytics-consent-banner',
    templateUrl: './analytics-consent-banner.component.html',
    styleUrl: './analytics-consent-banner.component.scss',
    standalone: false
})
export class AnalyticsConsentBannerComponent implements OnDestroy {
  /**
   * True only while the visitor has not answered AND this is a page we would
   * actually measure — i.e. exactly while the bar should be on screen.
   */
  protected readonly isUndecided$: Observable<boolean>;

  private observer?: ResizeObserver;
  private reserved = 0;

  /**
   * OBRS-1372. A setter rather than `ngAfterViewInit` because the element is
   * inside the `@if`: Angular calls this with the element when the bar appears
   * and with `undefined` the moment either answer removes it, which is exactly
   * when the room has to be given back. There is no other hook that fires on
   * both edges.
   */
  @ViewChild('banner')
  protected set banner(ref: ElementRef<HTMLElement> | undefined) {
    this.observer?.disconnect();
    this.observer = undefined;

    if (!ref) {
      this.reserve(0);
      return;
    }

    const element = ref.nativeElement;
    // Fires once on observe(), so the first measurement is this call too.
    this.observer = new ResizeObserver(() => this.reserve(element.offsetHeight));
    this.observer.observe(element);
  }

  constructor(
    private readonly consent: AnalyticsConsentService,
    private readonly scope: AnalyticsRouteScopeService,
    private readonly router: Router,
    private readonly renderer: Renderer2,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    // The URL is read from the navigation event rather than from `router.url`
    // after the fact: both this and `AnalyticsRouteScopeService` subscribe to
    // `router.events`, and which one is notified first is an accident of
    // construction order — the same reason the scope service re-reads the live
    // snapshot. `startWith` covers the window before the first navigation.
    const url$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    );

    this.isUndecided$ = combineLatest([
      this.consent.isUndecided$,
      this.scope.isRestricted$,
      url$,
    ]).pipe(
      map(
        ([undecided, restricted, url]) =>
          undecided && !restricted && !isConsentControlRoute(url)
      )
    );
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.reserve(0);
  }

  protected accept(): void {
    this.consent.grant();
  }

  protected decline(): void {
    this.consent.deny();
  }

  /**
   * Hold `heightPx` of the page's bottom edge clear of the bar. Zero removes the
   * declaration rather than writing `0px`, so a page with no bar left is a page
   * this component never touched.
   */
  private reserve(heightPx: number): void {
    // Same number, no write. On a desktop width the padding can be what makes the
    // page long enough to need a scrollbar, which narrows the viewport, which
    // re-wraps the bar — writing unconditionally puts that exchange in a loop the
    // browser reports as an undelivered-notification error rather than as a hang.
    if (heightPx === this.reserved) return;
    this.reserved = heightPx;

    const body = this.document.body;
    if (heightPx > 0) {
      this.renderer.setStyle(body, 'padding-bottom', `${Math.ceil(heightPx)}px`);
    } else {
      this.renderer.removeStyle(body, 'padding-bottom');
    }
  }
}
