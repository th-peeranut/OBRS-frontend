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
      const view = { candidate: ROUTE_A, displayLabel: '', ariaLabel: '' };
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
      expect(buttons[0].textContent?.trim()).toBe('Nong Chak → BTS Mo Chit');
      expect(buttons[1].textContent?.trim()).toBe('Rayong → Chanthaburi');
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

      expect(fixture.nativeElement.querySelector('.recent-route-btn').textContent.trim()).toBe(
        'Nong Chak → BTS Mo Chit'
      );

      TestBed.inject(TranslateService).use('th');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.recent-route-btn').textContent.trim()).toBe(
        'หนองชาก → บีทีเอส หมอชิต'
      );
    });
  });
});
