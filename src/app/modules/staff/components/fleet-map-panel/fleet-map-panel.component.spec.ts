import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import * as L from 'leaflet';
import { FleetMapPanelComponent } from './fleet-map-panel.component';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';

// OBRS-1070 AC5 asks the spec to read the TEXT THAT ACTUALLY RENDERED and
// prove two consecutive ticks differ. With no translations loaded ngx-translate
// echoes the key back, so every tick would render the identical constant
// 'STAFF.FLEET_MAP.SPEED_VALUE' and the assertion would pass while proving
// nothing. These are the real en.json strings for the keys this component uses.
const FLEET_MAP_EN = {
  STAFF: {
    FLEET_MAP: {
      SPEED_VALUE: '{{value}} km/h',
      UPDATED_JUST_NOW: 'Updated just now',
      UPDATED_MINUTES_AGO: 'Updated {{count}} min ago',
      UPDATED_HOURS_AGO: 'Updated {{count}} h ago',
      NO_SIGNAL_LABEL: 'No signal',
      STATUS: {
        LIVE: 'Live',
        GPS_LOST: 'GPS signal lost',
        OFFLINE: 'Device offline',
        AWAITING_SIGNAL: 'Awaiting first signal',
        NOT_TRACKED: 'Not tracked',
      },
      POPUP: {
        SPEED: 'Speed: {{value}} km/h',
        ENGINE_ON: 'Engine on',
        ENGINE_OFF: 'Engine off',
        DIRECTION: 'Heading {{direction}}',
        DIRECTION_LAST_KNOWN: 'Last known direction: {{direction}}',
      },
      COMPASS: {
        N: 'north',
        NE: 'northeast',
        E: 'east',
        SE: 'southeast',
        S: 'south',
        SW: 'southwest',
        W: 'west',
        NW: 'northwest',
      },
    },
  },
};

// OBRS-1082 — the SAME keys in Thai, copied from public/i18n/th.json. A
// language-switch test needs a second real dictionary: with only one loaded,
// ngx-translate falls back to the current lang's strings (or the key) and the
// "it changed language" assertion would pass while nothing changed.
const FLEET_MAP_TH = {
  STAFF: {
    FLEET_MAP: {
      SPEED_VALUE: '{{value}} กม./ชม.',
      UPDATED_JUST_NOW: 'อัปเดตเมื่อสักครู่',
      UPDATED_MINUTES_AGO: 'อัปเดตเมื่อ {{count}} นาทีที่แล้ว',
      UPDATED_HOURS_AGO: 'อัปเดตเมื่อ {{count}} ชั่วโมงที่แล้ว',
      NO_SIGNAL_LABEL: 'ไม่มีสัญญาณ',
      STATUS: {
        LIVE: 'สัญญาณสด',
        GPS_LOST: 'สัญญาณ GPS ขาดหาย',
        OFFLINE: 'อุปกรณ์ออฟไลน์',
        AWAITING_SIGNAL: 'รอสัญญาณครั้งแรก',
        NOT_TRACKED: 'ไม่มีอุปกรณ์ติดตาม',
      },
      POPUP: {
        SPEED: 'ความเร็ว: {{value}} กม./ชม.',
        ENGINE_ON: 'เครื่องยนต์ทำงาน',
        ENGINE_OFF: 'เครื่องยนต์ดับ',
        DIRECTION: 'มุ่งหน้าทิศ{{direction}}',
        DIRECTION_LAST_KNOWN: 'ทิศทางล่าสุด: {{direction}}',
      },
      COMPASS: {
        N: 'เหนือ',
        NE: 'ตะวันออกเฉียงเหนือ',
        E: 'ตะวันออก',
        SE: 'ตะวันออกเฉียงใต้',
        S: 'ใต้',
        SW: 'ตะวันตกเฉียงใต้',
        W: 'ตะวันตก',
        NW: 'ตะวันตกเฉียงเหนือ',
      },
    },
  },
};

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

describe('FleetMapPanelComponent', () => {
  let fixture: ComponentFixture<FleetMapPanelComponent>;
  let component: FleetMapPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [FleetMapPanelComponent],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', FLEET_MAP_EN, true);
    translate.use('en');

    fixture = TestBed.createComponent(FleetMapPanelComponent);
    component = fixture.componentInstance;
  });

  /** The marker-keyed permanent label layer (OBRS-1070 AC3) — private field,
   * read the same way the existing tests read `markers`/`map`. */
  function labelsOf(): Map<number, L.Tooltip> {
    return (component as unknown as { labels: Map<number, L.Tooltip> }).labels;
  }

  function markersOf(): Map<number, L.Marker> {
    return (component as unknown as { markers: Map<number, L.Marker> }).markers;
  }

  afterEach(() => {
    fixture.destroy();
  });

  // NOTE on every test below that sets `component.vehicles`/`maptilerKey`
  // directly (there is no host template driving [vehicles]/[maptilerKey]
  // bindings): Angular only invokes `ngOnChanges()` automatically when an
  // @Input is written through a compiled template binding. Assigning the
  // field directly on the instance does NOT trigger it — `fixture.detectChanges()`
  // still runs `ngAfterViewInit()` (a view-lifecycle hook, unconditional on
  // first CD), but never calls `ngOnChanges()` on its own. Every test that
  // needs `latestVehicles`/`markers` to reflect an input write therefore
  // calls `component.ngOnChanges()` explicitly, mirroring the pattern already
  // used elsewhere in this repo (e.g. vehicle-maintenance-panel.component.spec.ts).

  describe('empty-key regression (§4.4)', () => {
    it('never constructs L.map, and ngOnChanges/ngAfterViewInit do not throw, when maptilerKey is empty', () => {
      const mapSpy = spyOn(L, 'map').and.callThrough();
      component.maptilerKey = '';
      component.vehicles = [makeRow()];
      component.ngOnChanges();

      expect(() => fixture.detectChanges()).not.toThrow();

      expect(mapSpy).not.toHaveBeenCalled();
      expect(component.canShowMap).toBeFalse();
    });

    it('renders the MAP_UNAVAILABLE placeholder instead of the canvas', () => {
      component.maptilerKey = '';
      fixture.detectChanges();

      const canvas: HTMLElement | null = fixture.nativeElement.querySelector('.fleet-map-canvas');
      const unavailable: HTMLElement | null = fixture.nativeElement.querySelector('.fleet-map-unavailable');
      expect(canvas).toBeNull();
      expect(unavailable).not.toBeNull();
    });

    it('ngOnDestroy does not throw when no map was ever constructed', () => {
      component.maptilerKey = '';
      fixture.detectChanges();

      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('with a real MapTiler key', () => {
    it('buffered-render: an @Input set before ngAfterViewInit is not lost once the map exists (§4.7, deterministic — not a race)', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0 })];

      // Simulate the input arriving BEFORE the view exists — this IS what
      // real Angular guarantees (ngOnChanges always precedes ngAfterViewInit),
      // reproduced here deterministically rather than raced.
      component.ngOnChanges();
      expect((component as unknown as { map: L.Map | null }).map)
        .withContext('sanity: the view/map must not exist yet at this point')
        .toBeNull();

      // fixture.detectChanges() now runs ngAfterViewInit, which must replay
      // the buffered latestVehicles once the map exists (§4.7).
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(2);
    });

    it('first sync with N marker-eligible vehicles creates N markers and calls fitBounds exactly once', () => {
      // Spy on the prototype BEFORE the map is constructed so it also
      // captures the very first (automatic) fitBounds call inside
      // ngAfterViewInit's initial syncMarkers().
      const fitBoundsSpy = spyOn(L.Map.prototype, 'fitBounds').and.callThrough();

      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(2);
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);
    });

    it('a second sync with the same vehicle set does not create new markers and does not call fitBounds again', () => {
      const fitBoundsSpy = spyOn(L.Map.prototype, 'fitBounds').and.callThrough();

      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 1 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      const markerBefore = markers.get(1);
      expect(markerBefore).withContext('first sync must have created the marker').toBeTruthy();
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);

      // Next poll tick, identical vehicle set (a fresh array/object, as a
      // real store emission would be).
      component.vehicles = [makeRow({ vehicleId: 1 })];
      component.ngOnChanges();

      expect(markers.size).toBe(1);
      expect(markers.get(1)).toBe(markerBefore as L.Marker); // same instance, mutated in place
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1); // still 1 — never re-run automatically
    });

    it('§3.2 edge case: gpsImeiConfigured:false + positionKnown:true never gets a marker, even with lat/lon present', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [
        makeRow({ vehicleId: 9, gpsImeiConfigured: false, positionKnown: true, deviceOnline: true, stale: false, lat: 13.5, lon: 101.1 }),
      ];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(0);
    });

    it('a vehicle that flips OUT of marker-eligibility (e.g. tracker unmapped) has its existing marker removed', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow({ vehicleId: 5 })];
      component.ngOnChanges();
      fixture.detectChanges();

      const markers = (component as unknown as { markers: Map<number, L.Marker> }).markers;
      expect(markers.size).toBe(1);

      component.vehicles = [
        makeRow({ vehicleId: 5, gpsImeiConfigured: false, positionKnown: true, deviceOnline: null, stale: true }),
      ];
      component.ngOnChanges();

      expect(markers.size).toBe(0);
    });

    it('ngOnDestroy calls map.remove() when a map was constructed', () => {
      component.maptilerKey = 'test-key';
      component.vehicles = [makeRow()];
      fixture.detectChanges();

      const map = (component as unknown as { map: L.Map }).map;
      const removeSpy = spyOn(map, 'remove').and.callThrough();

      component.ngOnDestroy();

      expect(removeSpy).toHaveBeenCalled();
    });

    it('the tile layer attribution names both MapTiler and OpenStreetMap, and attributionControl is never disabled', () => {
      component.maptilerKey = 'test-key';
      fixture.detectChanges();

      const map = (component as unknown as { map: L.Map }).map;
      expect(map.attributionControl).toBeTruthy();

      let attributionHtml = '';
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          attributionHtml = (layer.options.attribution as string) || '';
        }
      });
      expect(attributionHtml).toContain('MapTiler');
      expect(attributionHtml).toContain('OpenStreetMap');
    });
  });

  describe('OBRS-1070 — details without a click', () => {
    function firstSync(vehicles: FleetPositionRespDto[]): void {
      component.maptilerKey = 'test-key';
      component.vehicles = vehicles;
      component.ngOnChanges();
      fixture.detectChanges();
    }

    it('AC1+AC2: the marker carries BOTH a hover tooltip and a click popup, holding the SAME full detail', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40, engineStatus: 1 })]);

      const marker = markersOf().get(1) as L.Marker;
      const tooltipHtml = marker.getTooltip()?.getContent() as string;
      const popupHtml = marker.getPopup()?.getContent() as string;

      expect(tooltipHtml).withContext('AC1: hover must have content of its own').toBeTruthy();
      expect(popupHtml).withContext('AC2: the click popup must still exist').toBeTruthy();
      expect(tooltipHtml).toBe(popupHtml);

      // The four things the owner asked to see, in the text that renders.
      expect(tooltipHtml).toContain('40-1234'); // plate
      expect(tooltipHtml).toContain('Live'); // status
      expect(tooltipHtml).toContain('Speed: 40 km/h'); // speed
      expect(tooltipHtml).toContain('Updated just now'); // relative time
    });

    it('AC1: the hover tooltip is NOT permanent — it is the one that opens on mouseover', () => {
      firstSync([makeRow({ vehicleId: 1 })]);

      const tooltip = markersOf().get(1)?.getTooltip() as L.Tooltip;
      expect(tooltip.options.permanent).toBeFalsy();
    });

    it('AC3: every marker gets a permanent, non-interactive label rendering plate + speed with no hover', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0, speed: 7 })]);

      const labels = labelsOf();
      expect(labels.size).toBe(2);

      const label = labels.get(1) as L.Tooltip;
      expect(label.options.permanent).toBeTrue();
      // An interactive tooltip sits in the pointer path and would eat the
      // mouseover AC1 needs and the click AC2 needs.
      expect(label.options.interactive).toBeFalse();

      // Read what actually rendered, not the content we handed Leaflet.
      const rendered = (label.getElement() as HTMLElement).textContent as string;
      expect(rendered).toContain('40-1234');
      expect(rendered).toContain('40 km/h');
      // Compact by construction: the label must NOT carry the full detail, or
      // a depot full of parked vans is unreadable.
      expect(rendered).not.toContain('Engine on');
      expect(rendered).not.toContain('Updated just now');
    });

    it('AC4: speed === null drops the speed token entirely — never a unit with no number', () => {
      firstSync([makeRow({ vehicleId: 1, speed: null })]);

      const label = labelsOf().get(1) as L.Tooltip;
      const rendered = (label.getElement() as HTMLElement).textContent as string;
      expect(rendered).toContain('40-1234');
      expect(rendered).not.toContain('km/h');
      expect((label.getContent() as string)).not.toContain('fleet-marker-label-speed');

      // and the full detail drops its speed row the same way
      const detail = markersOf().get(1)?.getTooltip()?.getContent() as string;
      expect(detail).not.toContain('km/h');
    });

    it('AC5: a poll tick that changes speed/recordedAt changes the RENDERED text of both the label and the hover tooltip', () => {
      // Relative to Date.now(), not a wall-clock literal: `fleetRelativeTime`
      // is called with the real `new Date()`, so a fixed ISO string would make
      // the expected phrasing drift with the calendar.
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      firstSync([makeRow({ vehicleId: 1, speed: 40, recordedAt: threeHoursAgo.toISOString() })]);

      const marker = markersOf().get(1) as L.Marker;
      const label = labelsOf().get(1) as L.Tooltip;

      // Open the hover tooltip so there is a rendered element to read, exactly
      // as a mouseover would.
      marker.openTooltip();
      const labelBefore = (label.getElement() as HTMLElement).textContent as string;
      const detailBefore = ((marker.getTooltip() as L.Tooltip).getElement() as HTMLElement).textContent as string;

      // Next tick: the van sped up, and its fix is now 5 minutes old.
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      component.vehicles = [makeRow({ vehicleId: 1, speed: 62, recordedAt: fiveMinutesAgo.toISOString() })];
      component.ngOnChanges();

      const labelAfter = (label.getElement() as HTMLElement).textContent as string;
      const detailAfter = ((marker.getTooltip() as L.Tooltip).getElement() as HTMLElement).textContent as string;

      expect(labelAfter).not.toBe(labelBefore);
      expect(detailAfter).not.toBe(detailBefore);

      expect(labelBefore).toContain('40 km/h');
      expect(labelAfter).toContain('62 km/h');
      expect(labelAfter).not.toContain('40 km/h');

      expect(detailAfter).toContain('Speed: 62 km/h');
      expect(detailAfter).toContain('Updated 5 min ago');
    });

    it('AC6: a speed/time-only tick never calls setIcon and never replaces the marker or the label layer', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40 })]);

      const markerBefore = markersOf().get(1) as L.Marker;
      const labelBefore = labelsOf().get(1) as L.Tooltip;

      // Spy only AFTER the first sync: creation legitimately builds an icon.
      const setIconSpy = spyOn(L.Marker.prototype, 'setIcon').and.callThrough();
      const markerCtorSpy = spyOn(L, 'marker').and.callThrough();
      const tooltipCtorSpy = spyOn(L, 'tooltip').and.callThrough();

      component.vehicles = [makeRow({ vehicleId: 1, speed: 62, recordedAt: new Date(Date.now() - 60_000).toISOString() })];
      component.ngOnChanges();

      expect(setIconSpy).withContext('the DivIcon must not be rebuilt for a speed change').not.toHaveBeenCalled();
      expect(markerCtorSpy).not.toHaveBeenCalled();
      expect(tooltipCtorSpy).not.toHaveBeenCalled();
      expect(markersOf().get(1)).toBe(markerBefore);
      expect(labelsOf().get(1)).toBe(labelBefore);
    });

    it('a status change still rebuilds the icon — AC6 pins the optimization, it does not disable it', () => {
      firstSync([makeRow({ vehicleId: 1 })]); // LIVE

      const setIconSpy = spyOn(L.Marker.prototype, 'setIcon').and.callThrough();

      component.vehicles = [makeRow({ vehicleId: 1, deviceOnline: false, stale: true })]; // OFFLINE
      component.ngOnChanges();

      expect(setIconSpy).toHaveBeenCalledTimes(1);
    });

    it('touch guard: a click closes the hover tooltip, so a tap never stacks tooltip + popup', () => {
      firstSync([makeRow({ vehicleId: 1 })]);

      const marker = markersOf().get(1) as L.Marker;
      marker.openTooltip();
      expect(marker.isTooltipOpen()).toBeTrue();

      marker.fire('click');

      expect(marker.isTooltipOpen())
        .withContext('L.Browser.touch wires click -> openTooltip; the guard must undo it')
        .toBeFalse();
    });

    it('a vehicle that loses marker eligibility takes its permanent label off the map with it', () => {
      firstSync([makeRow({ vehicleId: 5 })]);
      expect(labelsOf().size).toBe(1);
      const label = labelsOf().get(5) as L.Tooltip;
      const map = (component as unknown as { map: L.Map }).map;

      component.vehicles = [
        makeRow({ vehicleId: 5, gpsImeiConfigured: false, positionKnown: true, deviceOnline: null, stale: true }),
      ];
      component.ngOnChanges();

      expect(labelsOf().size).toBe(0);
      expect(map.hasLayer(label)).withContext('no orphaned label layer left behind').toBeFalse();
    });

    it('a vehicle that drops out of the response entirely takes its label with it too', () => {
      firstSync([makeRow({ vehicleId: 5 }), makeRow({ vehicleId: 6, lat: 13.4, lon: 101.0 })]);
      expect(labelsOf().size).toBe(2);
      const label = labelsOf().get(6) as L.Tooltip;
      const map = (component as unknown as { map: L.Map }).map;

      component.vehicles = [makeRow({ vehicleId: 5 })];
      component.ngOnChanges();

      expect(labelsOf().size).toBe(1);
      expect(map.hasLayer(label)).toBeFalse();
    });
  });

  describe('OBRS-905 — direction arrow + text', () => {
    function firstSync(vehicles: FleetPositionRespDto[]): void {
      component.maptilerKey = 'test-key';
      component.vehicles = vehicles;
      component.ngOnChanges();
      fixture.detectChanges();
    }

    function headingEl(vehicleId: number): HTMLElement | null {
      return (markersOf().get(vehicleId) as L.Marker).getElement()?.querySelector('.fleet-marker-heading') ?? null;
    }

    it('AC1: LIVE but parked (speed below the threshold) shows no arrow; LIVE and moving does', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 3, course: 90 })]); // below FLEET_HEADING_MIN_SPEED_KMH (5)

      let heading = headingEl(1);
      expect(heading).withContext('LIVE always gets the slot from buildIcon() — it starts hidden').not.toBeNull();
      expect((heading as HTMLElement).style.display).toBe('none');

      component.vehicles = [makeRow({ vehicleId: 1, speed: 40, course: 90 })];
      component.ngOnChanges();

      heading = headingEl(1);
      expect((heading as HTMLElement).style.display).not.toBe('none');
    });

    it('AC2 (trap-2 catcher): two ticks that change ONLY course, status staying LIVE, rotate the RENDERED heading span differently each time', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40, course: 10 })]);

      const transformTick1 = (headingEl(1) as HTMLElement).style.transform;
      expect(transformTick1).toContain('10deg');

      component.vehicles = [makeRow({ vehicleId: 1, speed: 40, course: 200 })];
      component.ngOnChanges();

      const transformTick2 = (headingEl(1) as HTMLElement).style.transform;
      expect(transformTick2).toContain('200deg');
      expect(transformTick2).not.toBe(transformTick1);
    });

    it('AC3: a course-only change does not call setIcon and the marker instance is not rebuilt', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40, course: 10 })]);
      const markerBefore = markersOf().get(1) as L.Marker;

      const setIconSpy = spyOn(L.Marker.prototype, 'setIcon').and.callThrough();
      const markerCtorSpy = spyOn(L, 'marker').and.callThrough();

      component.vehicles = [makeRow({ vehicleId: 1, speed: 40, course: 200 })];
      component.ngOnChanges();

      expect(setIconSpy).not.toHaveBeenCalled();
      expect(markerCtorSpy).not.toHaveBeenCalled();
      expect(markersOf().get(1)).toBe(markerBefore);
    });

    it('AC4 (must-NOT): OFFLINE and GPS_LOST never render a .fleet-marker-heading element, even with course + speed set', () => {
      firstSync([
        makeRow({ vehicleId: 1, deviceOnline: false, stale: true, speed: 40, course: 90 }), // OFFLINE
        makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0, stale: true, speed: 40, course: 90 }), // GPS_LOST
      ]);

      expect(headingEl(1)).withContext('OFFLINE must not even have the element in the DOM').toBeNull();
      expect(headingEl(2)).withContext('GPS_LOST must not even have the element in the DOM').toBeNull();
    });

    it('AC5: the marker ROOT element still carries Leaflet\'s own translate3d transform — never overwritten by a rotate', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40, course: 90 })]);

      const root = (markersOf().get(1) as L.Marker).getElement() as HTMLElement;
      expect(root.style.transform).toContain('translate3d');
      expect(root.style.transform).not.toContain('rotate');
    });

    it('AC6: the detail HTML carries direction text — present tense for LIVE, last-known for a non-LIVE status, none when parked', () => {
      firstSync([
        makeRow({ vehicleId: 1, speed: 40, course: 90 }), // LIVE, moving, east
        makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0, stale: true, speed: 40, course: 90 }), // GPS_LOST, moving
        makeRow({ vehicleId: 3, lat: 13.5, lon: 101.2, speed: 2, course: 90 }), // LIVE, parked
      ]);

      const liveDetail = markersOf().get(1)?.getTooltip()?.getContent() as string;
      const gpsLostDetail = markersOf().get(2)?.getTooltip()?.getContent() as string;
      const parkedDetail = markersOf().get(3)?.getTooltip()?.getContent() as string;

      expect(liveDetail).toContain('Heading east');
      expect(gpsLostDetail).toContain('Last known direction: east');
      expect(parkedDetail).not.toContain('Heading');
      expect(parkedDetail).not.toContain('Last known direction');
    });

    it('a moving vehicle with no course value (null) gets neither the arrow nor direction text', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40, course: null })]);

      const heading = headingEl(1);
      expect((heading as HTMLElement).style.display).toBe('none');

      const detail = markersOf().get(1)?.getTooltip()?.getContent() as string;
      expect(detail).not.toContain('Heading');
    });
  });

  // ── OBRS-1082 — an in-app language switch must retranslate what is already
  // ON the markers, in the same tick, without a poll and without a re-fetch.
  //
  // Every test below fires the language change the way the topbar does — on the
  // SAME component instance, with NO re-construction and NO second ngOnChanges()
  // — because that is the only version of the event that can catch this bug: a
  // rebuilt component would translate correctly no matter what the code does
  // (AC6, mirroring inspection-items-page.component.spec.ts:117-129).
  describe('OBRS-1082 — language switch retranslates the markers', () => {
    let translate: TranslateService;

    beforeEach(() => {
      translate = TestBed.inject(TranslateService);
      translate.setTranslation('th', FLEET_MAP_TH, true);
    });

    function firstSync(vehicles: FleetPositionRespDto[]): void {
      component.maptilerKey = 'test-key';
      component.vehicles = vehicles;
      component.ngOnChanges();
      fixture.detectChanges();
    }

    it('AC1: popup, permanent label and hover tooltip all switch language in the same tick — no poll tick needed', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 62, course: 45, engineStatus: 1 })]);

      const marker = markersOf().get(1) as L.Marker;
      const label = labelsOf().get(1) as L.Tooltip;
      marker.openTooltip();
      marker.openPopup();

      const labelBefore = (label.getElement() as HTMLElement).textContent as string;
      const popupBefore = ((marker.getPopup() as L.Popup).getElement() as HTMLElement).textContent as string;
      expect(labelBefore).toContain('62 km/h');
      expect(popupBefore).toContain('Live');
      expect(popupBefore).toContain('Speed: 62 km/h');
      expect(popupBefore).toContain('Heading northeast'); // the OBRS-905 line

      // The switch itself. NOTE: no component.ngOnChanges(), no new vehicles
      // array, no fixture re-creation — only the language changed.
      translate.use('th');

      const labelAfter = (label.getElement() as HTMLElement).textContent as string;
      const popupAfter = ((marker.getPopup() as L.Popup).getElement() as HTMLElement).textContent as string;
      const tooltipAfter = ((marker.getTooltip() as L.Tooltip).getElement() as HTMLElement).textContent as string;

      expect(labelAfter).toContain('62 กม./ชม.');
      expect(labelAfter).not.toContain('km/h');
      // All three lines that were reported stale, each from a different card:
      // status (OBRS-424), speed (OBRS-1070), direction (OBRS-905).
      expect(popupAfter).toContain('สัญญาณสด');
      expect(popupAfter).toContain('ความเร็ว: 62 กม./ชม.');
      expect(popupAfter).toContain('มุ่งหน้าทิศตะวันออกเฉียงเหนือ');
      expect(popupAfter).not.toContain('Speed:');
      expect(tooltipAfter).toContain('สัญญาณสด');
    });

    it('AC2: a popup that is OPEN during the switch stays open, and the marker does not move', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 62 })]);

      const marker = markersOf().get(1) as L.Marker;
      marker.openPopup();
      const popupEl = (marker.getPopup() as L.Popup).getElement() as HTMLElement;
      const latLngBefore = marker.getLatLng();

      translate.use('th');

      expect(marker.isPopupOpen()).withContext('the popup must not close itself to retranslate').toBeTrue();
      // The SAME popup DOM element, mutated in place — not a torn-down and
      // reopened popup that happens to look open.
      expect((marker.getPopup() as L.Popup).getElement()).toBe(popupEl);
      expect(marker.getLatLng()).toEqual(latLngBefore);
      expect((popupEl.textContent as string)).toContain('ความเร็ว: 62 กม./ชม.');
    });

    it('AC4: the switch never rebuilds an icon, a marker or a tooltip layer — OBRS-1070 AC6 stays green', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40 }), makeRow({ vehicleId: 2, lat: 13.4, lon: 101.0, speed: 7 })]);

      const markerBefore = markersOf().get(1) as L.Marker;
      const labelBefore = labelsOf().get(1) as L.Tooltip;

      // Spy only AFTER the first sync: creation legitimately builds layers.
      const setIconSpy = spyOn(L.Marker.prototype, 'setIcon').and.callThrough();
      const setLatLngSpy = spyOn(L.Marker.prototype, 'setLatLng').and.callThrough();
      const markerCtorSpy = spyOn(L, 'marker').and.callThrough();
      const tooltipCtorSpy = spyOn(L, 'tooltip').and.callThrough();

      translate.use('th');

      expect(setIconSpy).withContext('a language change is not a status change').not.toHaveBeenCalled();
      expect(setLatLngSpy).withContext('AC2: content only — nothing on the map may move').not.toHaveBeenCalled();
      expect(markerCtorSpy).not.toHaveBeenCalled();
      expect(tooltipCtorSpy).not.toHaveBeenCalled();
      expect(markersOf().get(1)).toBe(markerBefore);
      expect(labelsOf().get(1)).toBe(labelBefore);
      expect(markersOf().size).toBe(2);
      // ...and the retranslation DID happen. Without this line the whole test
      // would also pass on a build where the language change reaches nothing at
      // all — which is precisely the bug (measured: it passes unchanged against
      // the pre-fix component).
      expect((labelBefore.getElement() as HTMLElement).textContent as string).toContain('40 กม./ชม.');
    });

    it('AC5: ngOnDestroy tears the subscription down — a later language change reaches nothing', () => {
      firstSync([makeRow({ vehicleId: 1, speed: 40 })]);
      const refreshSpy = spyOn(component as unknown as { refreshMarkerText: () => void }, 'refreshMarkerText').and.callThrough();

      translate.use('th');
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      component.ngOnDestroy();
      translate.use('en');

      expect(refreshSpy).withContext('a destroyed panel must not still be listening').toHaveBeenCalledTimes(1);
    });

    it('a NOT_TRACKED vehicle (no marker at all) is skipped instead of throwing', () => {
      firstSync([
        makeRow({ vehicleId: 1, speed: 40 }),
        makeRow({ vehicleId: 2, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null }),
      ]);
      expect(markersOf().has(2)).toBeFalse();

      expect(() => translate.use('th')).not.toThrow();
      expect(((markersOf().get(1) as L.Marker).getPopup()?.getContent() as string)).toContain('สัญญาณสด');
    });

    it('a language change before any data has arrived is a no-op, not a crash', () => {
      component.maptilerKey = 'test-key';
      fixture.detectChanges(); // map exists, zero vehicles

      expect(() => translate.use('th')).not.toThrow();
      expect(markersOf().size).toBe(0);
    });
  });
});
