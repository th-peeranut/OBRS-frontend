import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { getStationFallbackLabel } from '../../../../shared/interfaces/station.interface';
import { RecentRouteCandidate } from '../../../../shared/lib/recent-routes';

/** View-model derived once per `routes`/language change — never a template getter. */
interface RecentRouteView {
  candidate: RecentRouteCandidate;
  /** "<origin label> → <destination label>" — plain "→", not an i18n key (a
   *  direction glyph, not language text), built the same way
   *  `MyBookingsComponent.toView()` builds its `route` string. */
  displayLabel: string;
  ariaLabel: string;
}

/**
 * Presentational-only quick-pick strip of up to 3 recent routes on the Home
 * search form (OBRS-575). Receives already-id-resolved, already-deduped,
 * already-capped-at-3 candidates from `HomeBookingComponent`; owns only the
 * label/i18n concern (precompute on `ngOnChanges` + `translate.onLangChange`),
 * never the auth/localStorage/API concern.
 *
 * Standalone + imported into `HomeModule.imports` (same convention as
 * `DropdownGroupObrsComponent`) — not exported, nothing outside `HomeModule`
 * needs it.
 */
@Component({
  selector: 'app-recent-routes-quick-pick',
  templateUrl: './recent-routes-quick-pick.component.html',
  styleUrl: './recent-routes-quick-pick.component.scss',
  standalone: true,
  imports: [CommonModule, TranslateModule],
})
export class RecentRoutesQuickPickComponent implements OnInit, OnChanges, OnDestroy {
  @Input() routes: RecentRouteCandidate[] = [];
  @Output() routeSelected = new EventEmitter<RecentRouteCandidate>();

  /** Plain field, recomputed only on `routes`/`onLangChange` — never a template
   *  getter/method (Home runs Default change detection). */
  routeViews: RecentRouteView[] = [];

  /** trackBy MUST be an arrow-function class property — a bare method passed as
   *  [trackBy] loses its `this` binding when Angular invokes it detached. */
  trackByRoutePair = (_: number, view: RecentRouteView): string =>
    `${view.candidate.originStation.id}_${view.candidate.destinationStation.id}`;

  private destroy$ = new Subject<void>();

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.rebuildViews();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['routes']) {
      this.rebuildViews();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSelect(view: RecentRouteView): void {
    this.routeSelected.emit(view.candidate);
  }

  private rebuildViews(): void {
    const locale = this.translate.currentLang || 'th';

    this.routeViews = (this.routes ?? []).map((candidate) => {
      const originLabel = getStationFallbackLabel(candidate.originStation, locale);
      const destinationLabel = getStationFallbackLabel(candidate.destinationStation, locale);

      return {
        candidate,
        displayLabel: `${originLabel} → ${destinationLabel}`,
        ariaLabel: this.translate.instant('HOME.HOME_BOOKING.RECENT_ROUTE_ARIA_LABEL', {
          from: originLabel,
          to: destinationLabel,
        }),
      };
    });
  }
}
