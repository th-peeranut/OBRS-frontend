import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RecentRoutesQuickPickComponent } from './recent-routes-quick-pick.component';
import { RecentRouteCandidate } from '../../../../shared/lib/recent-routes';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function station(id: number, thLabel: string, enLabel: string): StationApi {
  return {
    id,
    slug: `station-${id}`,
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
    display: [
      { locale: 'th', label: thLabel },
      { locale: 'en', label: enLabel },
    ],
  };
}

const ROUTE_A: RecentRouteCandidate = {
  originStation: station(1, 'หนองชาก', 'Nong Chak'),
  destinationStation: station(2, 'บีทีเอส หมอชิต', 'BTS Mo Chit'),
};

const ROUTE_B: RecentRouteCandidate = {
  originStation: station(3, 'ระยอง', 'Rayong'),
  destinationStation: station(4, 'จันทบุรี', 'Chanthaburi'),
};

describe('RecentRoutesQuickPickComponent', () => {
  describe('smoke', () => {
    it('should create (direct construction, constructor DI only)', () => {
      const component = new RecentRoutesQuickPickComponent(createTranslateStub());
      expect(component).toBeTruthy();
    });

    it('trackByRoutePair keys on the origin/destination station id pair', () => {
      const component = new RecentRoutesQuickPickComponent(createTranslateStub());
      const view = { candidate: ROUTE_A, displayLabel: '', ariaLabel: '', isActive: false };
      expect(component.trackByRoutePair(0, view)).toBe('1_2');
    });
  });

  describe('rendered behavior', () => {
    let fixture: ComponentFixture<RecentRoutesQuickPickComponent>;
    let component: RecentRoutesQuickPickComponent;

    function setup(routes: RecentRouteCandidate[]): void {
      TestBed.configureTestingModule({
        imports: [RecentRoutesQuickPickComponent, TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(RecentRoutesQuickPickComponent);
      component = fixture.componentInstance;

      const translate = TestBed.inject(TranslateService);

      // `TranslateModule.forRoot()` registers NO loader, so without this the
      // catalogue is empty and `translate.instant(key)` returns the key itself —
      // which is exactly how the aria-label assertion below came back as
      // 'HOME.HOME_BOOKING.RECENT_ROUTE_ARIA_LABEL' rather than a sentence.
      // Values copied verbatim from public/i18n/{en,th}.json; those files stay the
      // source of truth (that all three locales carry both {{from}} and {{to}} is
      // verified against them, not here), so a change there must be mirrored here.
      translate.setTranslation('en', {
        HOME: { HOME_BOOKING: { RECENT_ROUTE_ARIA_LABEL: 'From {{from}} to {{to}}' } },
      });
      translate.setTranslation('th', {
        HOME: { HOME_BOOKING: { RECENT_ROUTE_ARIA_LABEL: 'จาก {{from}} ไป {{to}}' } },
      });
      translate.use('en');

      // fixture.componentRef.setInput (not a bare property assignment) so
      // ngOnChanges actually fires for a component created directly via
      // TestBed with no host template binding driving it.
      fixture.componentRef.setInput('routes', routes);
      fixture.detectChanges();
    }

    it('AC#5: renders NOTHING when there are zero routes — no wrapper div, no caption', () => {
      setup([]);

      // The host itself (<app-recent-routes-quick-pick>) is present because
      // this test creates the component directly, but the *ngIf-guarded
      // template root must contribute nothing inside it.
      expect(fixture.nativeElement.querySelector('.recent-routes-quick-pick')).toBeNull();
      expect(fixture.nativeElement.textContent.trim()).toBe('');
    });

    it('renders one pill button per candidate with the "<origin> → <destination>" label', () => {
      setup([ROUTE_A, ROUTE_B]);

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.recent-route-btn')
      );

      expect(buttons.length).toBe(2);
      // `.recent-route-label`, not the button's own textContent — the button
      // also contains the OBRS-928 icon glyph.
      expect(buttons[0].querySelector('.recent-route-label')?.textContent?.trim()).toBe(
        'Nong Chak → BTS Mo Chit'
      );
      expect(buttons[1].querySelector('.recent-route-label')?.textContent?.trim()).toBe(
        'Rayong → Chanthaburi'
      );
    });

    it('renders a real <button type="button"> per route — natively focusable, no custom keyboard handling', () => {
      setup([ROUTE_A]);

      const button = fixture.nativeElement.querySelector('.recent-route-btn');
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    });

    it('sets aria-label to the full origin+destination sentence, not "route 1"/"route 2"', () => {
      setup([ROUTE_A]);

      const button = fixture.nativeElement.querySelector('.recent-route-btn');
      expect(button.getAttribute('aria-label')).toBe('From Nong Chak to BTS Mo Chit');
    });

    it('emits routeSelected with the underlying candidate on click', () => {
      setup([ROUTE_A, ROUTE_B]);

      const emitted: RecentRouteCandidate[] = [];
      component.routeSelected.subscribe((candidate) => emitted.push(candidate));

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.recent-route-btn')
      );
      buttons[1].click();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toBe(ROUTE_B);
    });

    it('rebuilds labels on translate.onLangChange without re-binding [routes]', () => {
      setup([ROUTE_A]);

      expect(
        fixture.nativeElement
          .querySelector('.recent-route-btn .recent-route-label')
          .textContent.trim()
      ).toBe('Nong Chak → BTS Mo Chit');

      TestBed.inject(TranslateService).use('th');
      fixture.detectChanges();

      expect(
        fixture.nativeElement
          .querySelector('.recent-route-btn .recent-route-label')
          .textContent.trim()
      ).toBe('หนองชาก → บีทีเอส หมอชิต');
    });
  });

  describe('discoverability affordances (OBRS-928)', () => {
    let fixture: ComponentFixture<RecentRoutesQuickPickComponent>;

    function setup(
      routes: RecentRouteCandidate[],
      active: { originId?: number | null; destinationId?: number | null } = {}
    ): void {
      TestBed.configureTestingModule({
        imports: [RecentRoutesQuickPickComponent, TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(RecentRoutesQuickPickComponent);
      fixture.componentRef.setInput('routes', routes);
      fixture.componentRef.setInput('activeOriginId', active.originId ?? null);
      fixture.componentRef.setInput('activeDestinationId', active.destinationId ?? null);
      fixture.detectChanges();
    }

    it('renders a leading icon inside each pill so it reads as a button, not a status tag', () => {
      setup([ROUTE_A, ROUTE_B]);

      const icons = fixture.nativeElement.querySelectorAll('.recent-route-btn .recent-route-icon');
      expect(icons.length).toBe(2);
      // Decorative — the pill already carries the full sentence as aria-label.
      expect(icons[0].getAttribute('aria-hidden')).toBe('true');
    });

    it('marks the pill matching the current form values as active', () => {
      setup([ROUTE_A, ROUTE_B], { originId: 1, destinationId: 2 });

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.recent-route-btn')
      );
      expect(buttons[0].classList.contains('is-active')).toBe(true);
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
      expect(buttons[1].classList.contains('is-active')).toBe(false);
    });

    it('matches a numeric form value against the station id (the form seeds strings)', () => {
      setup([ROUTE_A], { originId: '1' as unknown as number, destinationId: '2' as unknown as number });

      expect(
        fixture.nativeElement.querySelector('.recent-route-btn').classList.contains('is-active')
      ).toBe(true);
    });

    // must-NOT: a half-match is not a match. Without this, comparing only the
    // origin would pass every assertion above.
    it('does NOT mark a pill active when only the origin matches', () => {
      setup([ROUTE_A], { originId: 1, destinationId: 999 });

      expect(
        fixture.nativeElement.querySelector('.recent-route-btn').classList.contains('is-active')
      ).toBe(false);
    });

    it('marks nothing active while the form is empty', () => {
      setup([ROUTE_A, ROUTE_B]);

      expect(fixture.nativeElement.querySelectorAll('.recent-route-btn.is-active').length).toBe(0);
    });

    it('re-evaluates the active pill when the form values change, without re-binding [routes]', () => {
      setup([ROUTE_A, ROUTE_B], { originId: 1, destinationId: 2 });

      fixture.componentRef.setInput('activeOriginId', 3);
      fixture.componentRef.setInput('activeDestinationId', 4);
      fixture.detectChanges();

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.recent-route-btn')
      );
      expect(buttons[0].classList.contains('is-active')).toBe(false);
      expect(buttons[1].classList.contains('is-active')).toBe(true);
    });

    it('flags the HOST with .has-routes so the parent can tighten its spacing', () => {
      setup([ROUTE_A]);

      expect(fixture.nativeElement.classList.contains('has-routes')).toBe(true);
    });

    // AC#5 again, from the host's side: the spacing hook must be absent when the
    // strip renders nothing, or an empty strip would still move the layout.
    it('does NOT flag the host when there are zero routes', () => {
      setup([]);

      expect(fixture.nativeElement.classList.contains('has-routes')).toBe(false);
    });
  });
});
