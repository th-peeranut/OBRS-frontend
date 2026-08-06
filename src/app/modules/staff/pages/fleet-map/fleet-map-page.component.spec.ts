import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { FleetMapPageComponent } from './fleet-map-page.component';
import { FleetMapStore } from './fleet-map.store';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { environment } from '../../../../../environments/environment';

function makeRow(overrides: Partial<FleetPositionRespDto> = {}): FleetPositionRespDto {
  return {
    vehicleId: 1,
    numberPlate: '40-1234',
    vehicleNumber: '1',
    lat: 13.36,
    lon: 100.98,
    speed: 40,
    course: 90,
    engineStatus: 1,
    recordedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    positionKnown: true,
    stale: false,
    deviceOnline: true,
    gpsImeiConfigured: true,
    ...overrides,
  };
}

interface StoreStub {
  data$: BehaviorSubject<FleetPositionRespDto[] | null>;
  refreshing$: BehaviorSubject<boolean>;
  error$: BehaviorSubject<boolean>;
  lastFetchedAt$: BehaviorSubject<Date | null>;
  hasValue: boolean;
  refresh: jasmine.Spy;
}

function makeStoreStub(data: FleetPositionRespDto[] | null = null): StoreStub {
  const data$ = new BehaviorSubject<FleetPositionRespDto[] | null>(data);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    lastFetchedAt$: new BehaviorSubject<Date | null>(null),
    get hasValue() {
      return data$.value !== null;
    },
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  } as unknown as StoreStub;
}

describe('FleetMapPageComponent', () => {
  it('should create', () => {
    const component = new FleetMapPageComponent(makeStoreStub() as unknown as FleetMapStore, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('ngOnInit calls store.refresh() once and starts exactly one poll subscription', () => {
    const store = makeStoreStub([]);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
    expect((component as any).pollSub).toBeTruthy();
    expect((component as any).pollSub.closed).toBeFalse();
  });

  it('ngOnDestroy unsubscribes the poll subscription', () => {
    const store = makeStoreStub([]);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());
    component.ngOnInit();
    const pollSub = (component as any).pollSub;
    spyOn(pollSub, 'unsubscribe').and.callThrough();

    component.ngOnDestroy();

    expect(pollSub.unsubscribe).toHaveBeenCalled();
  });

  it('day-one: every row gpsImeiConfigured:false -> showEmptyFleetBanner is true', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ vehicleId: i + 1, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null })
    );
    const store = makeStoreStub(rows);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());
    component.ngOnInit();

    expect((component as any).showEmptyFleetBanner).toBeTrue();
  });

  it('a mixed fleet (not all NOT_TRACKED) does not show the empty-fleet banner', () => {
    const rows = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true })];
    const store = makeStoreStub(rows);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());
    component.ngOnInit();

    expect((component as any).showEmptyFleetBanner).toBeFalse();
  });

  it('REFRESH_FAILED_BANNER is driven by lastFetchedAt$, not by a stale data$ replay alone', () => {
    const store = makeStoreStub([makeRow()]);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());
    component.ngOnInit();

    // A stale data$ replay with NO fresh lastFetchedAt$ emission and error not
    // flagged -> banner must stay hidden.
    expect((component as any).showRefreshFailedBanner).toBeFalse();

    store.error$.next(true);
    expect((component as any).showRefreshFailedBanner).toBeTrue();

    store.lastFetchedAt$.next(new Date('2026-07-18T10:00:00Z'));
    expect((component as any).refreshFailedTimeDisplay.length).toBeGreaterThan(0);
  });

  // OBRS-1082 AC3. The fix for the stale marker strings re-renders from the
  // vehicles already in hand; the obvious wrong fix — "just poll again on a
  // language change" — would be invisible in the panel's own spec (the panel
  // has no service at all) while handing the backend an extra
  // GET /api/private/vehicles/positions per switch, from every staff tab open
  // on this screen. This page owns the only call site, so the count belongs here.
  it('AC3: a language change triggers ZERO extra store.refresh() calls — no re-fetch, ever', () => {
    const store = makeStoreStub([makeRow()]);
    const translate = createTranslateStub();
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, translate);
    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1); // the initial load, and nothing else

    translate.currentLang = 'th';
    translate.onLangChange.next({ lang: 'th', translations: {} });
    translate.onLangChange.next({ lang: 'en', translations: {} });

    expect(store.refresh).withContext('re-render from data in hand; never re-fetch').toHaveBeenCalledTimes(1);

    component.ngOnDestroy();
  });

  it('error with no cache -> contentState is error and loadError is set', () => {
    const store = makeStoreStub(null);
    const component = new FleetMapPageComponent(store as unknown as FleetMapStore, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).contentState).toBe('error');
    expect((component as any).loadError.length).toBeGreaterThan(0);
  });
});

// ── Template wiring: NO_ERRORS_SCHEMA (established pattern, e.g.
// vehicles-page.component.spec.ts) so app-fleet-map-panel/
// app-fleet-vehicle-status-list don't need to be declared — this suite only
// verifies the page passes the right inputs down, not the children's own
// behavior (covered by their own specs).
describe('FleetMapPageComponent template wiring', () => {
  let fixture: ComponentFixture<FleetMapPageComponent>;
  let store: StoreStub;

  beforeEach(async () => {
    store = makeStoreStub([makeRow()]);

    await TestBed.configureTestingModule({
      declarations: [FleetMapPageComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: FleetMapStore, useValue: store }],
    }).compileComponents();

    fixture = TestBed.createComponent(FleetMapPageComponent);
  });

  it('does not render its own <h2>/<h3> (title comes from route data)', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    expect(fixture.nativeElement.querySelector('h3')).toBeNull();
  });

  // §4.4/§8: with no MapTiler key (the CI/fresh-clone default), the side list
  // must still receive and render every vehicle — it has no dependency on
  // the map key at all. `maptilerKey` is a readonly field seeded from
  // `environment` in the constructor; overridden here via cast (there is no
  // DI seam for it) to exercise the empty-key composition deterministically,
  // matching FleetMapPanelComponent's own empty-key regression spec at the
  // panel level.
  it('with an empty maptilerKey, app-fleet-vehicle-status-list still receives the full vehicle list', () => {
    (fixture.componentInstance as unknown as { maptilerKey: string }).maptilerKey = '';
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('app-fleet-map-panel'));
    const list = fixture.debugElement.query(By.css('app-fleet-vehicle-status-list'));

    expect(panel.properties['maptilerKey']).toBe('');
    expect(list).withContext('the side list must still render, independent of the map key').not.toBeNull();
    expect(list.properties['vehicles']).toBe((fixture.componentInstance as any).vehicles);
    expect((fixture.componentInstance as any).vehicles.length).toBe(1);
  });

  it('passes environment.maptilerKey and the vehicles list through to app-fleet-map-panel', () => {
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('app-fleet-map-panel'));
    expect(panel.properties['maptilerKey']).toBe(environment.maptilerKey);
    expect(panel.properties['vehicles']).toBe((fixture.componentInstance as any).vehicles);
  });
});
