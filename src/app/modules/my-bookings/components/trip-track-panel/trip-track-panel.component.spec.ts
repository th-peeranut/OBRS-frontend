import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { TripTrackPanelComponent } from './trip-track-panel.component';
import { TripTrackService } from '../../../../services/trip-track/trip-track.service';
import { CustomerTripPositionRespDto } from '../../../../shared/lib/trip-track-view';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { environment } from '../../../../../environments/environment';

function resp(
  state: CustomerTripPositionRespDto['state'],
  overrides: Partial<CustomerTripPositionRespDto> = {}
): ResponseAPI<CustomerTripPositionRespDto> {
  return {
    code: 200,
    message: 'OK',
    data: {
      state,
      lat: null,
      lon: null,
      recordedAt: null,
      stale: false,
      windowOpensAt: null,
      ...overrides,
    },
  };
}

describe('TripTrackPanelComponent', () => {
  let fixture: ComponentFixture<TripTrackPanelComponent>;
  let component: TripTrackPanelComponent;
  let service: jasmine.SpyObj<TripTrackService>;
  let hidden = false;

  beforeEach(async () => {
    hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    service = jasmine.createSpyObj<TripTrackService>('TripTrackService', ['getVehiclePosition']);
    service.getVehiclePosition.and.returnValue(of(resp('LIVE', { lat: 1, lon: 1 })));

    await TestBed.configureTestingModule({
      declarations: [TripTrackPanelComponent],
      imports: [TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA], // app-trip-track-map is a real child; not declared here
      providers: [{ provide: TripTrackService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(TripTrackPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  function changeTicketId(id: number): void {
    component.ticketId = id;
    component.ngOnChanges({ ticketId: new SimpleChange(null, id, true) });
  }

  it('U14: after ngOnDestroy, advancing 5x60s makes ZERO further calls', fakeAsync(() => {
    changeTicketId(1);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);

    component.ngOnDestroy();
    tick(5 * 60000);

    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);
  }));

  it('U15: writing ticketId twice does not stack a second interval — exactly ONE poll tick fires at 60s', fakeAsync(() => {
    changeTicketId(1);
    changeTicketId(2);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2); // the two initial loads

    tick(60000);

    // If startPolling() failed to call stopPolling() first, TWO intervals
    // would be stacked and this tick would fire 2 calls (total 4), not 1 (total 3).
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(3);
    fixture.destroy(); // clears the still-pending periodic poll timer before fakeAsync's own check
  }));

  it('U16: CLOSED is not terminal — the idle-lane poll can reopen to LIVE, and the lane then switches back to active', fakeAsync(() => {
    let state: CustomerTripPositionRespDto['state'] = 'CLOSED';
    service.getVehiclePosition.and.callFake(() => of(resp(state, { lat: 1, lon: 1 })));

    changeTicketId(1);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);
    expect(component.view?.state).toBe('CLOSED');

    state = 'LIVE'; // staff enters a delay mid-session; the next idle-lane poll sees it reopen
    tick(5 * 60000); // idle lane — exactly one further call
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2);
    expect(component.view?.state).toBe('LIVE');

    // Lane must now be ACTIVE (60s), not still idle (5min).
    tick(60000);
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(3);
    fixture.destroy();
  }));

  it('U17: UNAVAILABLE stays in the ACTIVE lane — one further call at 60s, not 5 min', fakeAsync(() => {
    service.getVehiclePosition.and.returnValue(of(resp('UNAVAILABLE')));

    changeTicketId(1);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);

    tick(60000);
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));

  it('U17a: NOT_YET_OPEN is in the IDLE lane — zero calls at 60s, one call at 5 min', fakeAsync(() => {
    service.getVehiclePosition.and.returnValue(of(resp('NOT_YET_OPEN', { windowOpensAt: '2026-07-22T07:30:00+07:00' })));

    changeTicketId(1);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);

    tick(60000);
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1); // still just the initial load

    tick(4 * 60000); // total 5 minutes since the initial load
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));

  it('U18: 403 and 404 render byte-identical copy, and both stop polling (BR-18 IDOR oracle)', fakeAsync(() => {
    service.getVehiclePosition.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );
    changeTicketId(1);
    fixture.detectChanges();
    const text403 = component.errorText;
    expect(text403).toBeTruthy();

    fixture.destroy();

    service.getVehiclePosition.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );
    fixture = TestBed.createComponent(TripTrackPanelComponent);
    component = fixture.componentInstance;
    changeTicketId(1);
    fixture.detectChanges();
    const text404 = component.errorText;

    expect(text404).toBe(text403);

    const callsBefore = service.getVehiclePosition.calls.count();
    tick(5 * 60000);
    expect(service.getVehiclePosition.calls.count()).toBe(callsBefore); // no further polling
  }));

  it('U18a: a stopped-on-403 poll is NOT resurrected by returning to the tab', fakeAsync(() => {
    service.getVehiclePosition.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );
    changeTicketId(1);
    fixture.detectChanges();
    expect(component.errorText).toBeTruthy();

    const callsBefore = service.getVehiclePosition.calls.count();

    // Background the tab and come back — the BR-17 handler must respect the
    // BR-18 terminal error, not re-issue load() + startPolling(). Without the
    // `errorText` half of its guard this fires a request immediately and then
    // one every 60s forever, against a ticket that will 403 every time.
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(service.getVehiclePosition.calls.count()).toBe(callsBefore);
    tick(5 * 60000);
    expect(service.getVehiclePosition.calls.count()).toBe(callsBefore);
    fixture.destroy();
  }));

  it('U20: a transient failure after a successful LIVE render keeps the LIVE view AND adds the refresh-failed strip; polling continues', fakeAsync(() => {
    let shouldFail = false;
    service.getVehiclePosition.and.callFake(() =>
      shouldFail ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(resp('LIVE', { lat: 1, lon: 1 }))
    );

    changeTicketId(1);
    fixture.detectChanges();
    expect(component.view?.state).toBe('LIVE');
    expect(component.refreshFailed).toBeFalse();

    shouldFail = true;
    tick(60000);

    expect(component.view?.state).toBe('LIVE'); // NOT blanked
    expect(component.refreshFailed).toBeTrue();

    // Polling must continue past the failed tick.
    const callsBefore = service.getVehiclePosition.calls.count();
    tick(60000);
    expect(service.getVehiclePosition.calls.count()).toBe(callsBefore + 1);
    fixture.destroy();
  }));

  it('U21 / U21a / U21b: backgrounded-tab polling skip, immediate re-fetch, and re-phasing on return', fakeAsync(() => {
    changeTicketId(1);
    fixture.detectChanges();
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);

    hidden = true;
    tick(3 * 60000);
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1); // U21: zero additional calls while hidden

    // U21a: visibilitychange firing WHILE hidden must not itself issue a request.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(1);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2); // U21: exactly one immediate call on return

    // U21b: the interval re-phases from this manual call — no adjacent
    // duplicate one second later, and the NEXT tick lands 60s after it.
    tick(1000);
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(2);
    tick(59000); // total 60s since the manual visible-return call
    expect(service.getVehiclePosition).toHaveBeenCalledTimes(3);
    fixture.destroy();
  }));

  it('U22: an empty maptilerKey renders MAP_UNAVAILABLE and omits app-trip-track-map, while the chip/last-update still render', () => {
    (fixture.componentInstance as unknown as { maptilerKey: string }).maptilerKey = '';
    changeTicketId(1);
    fixture.detectChanges();

    const mapEl = fixture.debugElement.query(By.css('app-trip-track-map'));
    const unavailableEl = fixture.nativeElement.querySelector('.trip-track-panel__map-unavailable');
    const chipEl = fixture.nativeElement.querySelector('.trip-track-panel__chip-row .admin-status');
    const lastUpdateEl = fixture.nativeElement.querySelector('.trip-track-panel__last-update');

    expect(mapEl).toBeNull();
    expect(unavailableEl).not.toBeNull();
    expect(chipEl).withContext('the state chip must still render without a map key').not.toBeNull();
    expect(lastUpdateEl).withContext('the last-update footnote must still render without a map key').not.toBeNull();
  });

  it('with a real maptilerKey, passes the resolved view fields down to app-trip-track-map', () => {
    (fixture.componentInstance as unknown as { maptilerKey: string }).maptilerKey = environment.maptilerKey || 'test-key';
    service.getVehiclePosition.and.returnValue(of(resp('STALE', { lat: 13.5, lon: 100.6, recordedAt: '2026-07-19T09:00:00+07:00' })));
    changeTicketId(1);
    fixture.detectChanges();

    const mapEl = fixture.debugElement.query(By.css('app-trip-track-map'));
    expect(mapEl).not.toBeNull();
    expect(mapEl.properties['lat']).toBe(13.5);
    expect(mapEl.properties['lon']).toBe(100.6);
    expect(mapEl.properties['stale']).toBeTrue();
  });
});
