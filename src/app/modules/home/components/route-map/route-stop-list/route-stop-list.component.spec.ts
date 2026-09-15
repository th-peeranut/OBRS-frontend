import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { RouteStopListComponent } from './route-stop-list.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

function makeStop(order: number, slug: string): RouteStop {
  return {
    order,
    slug,
    name: `Stop ${order}`,
    address: `Address ${order}`,
    approxTime: '08:00',
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

describe('RouteStopListComponent', () => {
  let component: RouteStopListComponent;

  beforeEach(() => {
    component = new RouteStopListComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits stopSelected when a stop is clicked', () => {
    const stop = makeStop(1, 'stop-1');
    let emitted: unknown = null;
    component.stopSelected.subscribe((s) => (emitted = s));
    component.onStopClick(stop);
    expect(emitted as RouteStop).toEqual(stop);
  });

  it('emits confirmClicked when onConfirm is called', () => {
    let called = false;
    component.confirmClicked.subscribe(() => (called = true));
    component.onConfirm();
    expect(called).toBeTrue();
  });

  /**
   * OBRS-1358. Two callers share this list. The home page moved to one shared label armed
   * only by `canConfirm`; the change-stop dialog is a real two-step wizard and must keep the
   * per-side label and the per-side guard. The dialog binds NEITHER new input, so the default
   * is the whole of its protection - if it ever flipped, its confirm button would be dead.
   */
  it('defaults to the per-side label and guard (the change-stop dialog binds neither input)', () => {
    component.type = 'dropoff';
    component.selectedSlug = 'bts_mo_chit';

    expect(component.confirmMode).toBe('per-side');
    expect(component.confirmLabelKey).toBe('HOME.ROUTE_MAP.CONFIRM_DROPOFF');
    expect(component.confirmDisabled).toBeFalse();
  });

  it('in pair mode the label is shared and the guard reads canConfirm, not selectedSlug', () => {
    component.confirmMode = 'pair';
    component.type = 'pickup';
    component.selectedSlug = 'nong_chak';

    expect(component.confirmLabelKey).toBe('HOME.ROUTE_MAP.CONFIRM_PICKUP_DROPOFF');
    expect(component.confirmDisabled).toBeTrue();

    component.canConfirm = true;
    expect(component.confirmDisabled).toBeFalse();
  });

  it('trackBySlug returns stop slug', () => {
    const stop = makeStop(1, 'abc');
    expect(component.trackBySlug(0, stop)).toBe('abc');
  });

  it('emits locateMeClicked when the locate-me button is clicked', () => {
    let called = false;
    component.locateMeClicked.subscribe(() => (called = true));
    component.locateMeClicked.emit();
    expect(called).toBeTrue();
  });
});

/**
 * OBRS-636. The address line is bound straight from the API. Before this card the
 * binding was unguarded, so a stop with no address still rendered an empty
 * `.stop-address` div — which is what production served for every stop, because the
 * prod seed never set an address at all. These assert the RENDERED DOM, not the
 * component instance: an unguarded `{{ stop.address }}` still "has" an address
 * property, and only the element count can tell the two apart.
 */
describe('RouteStopListComponent rendering', () => {
  let fixture: ComponentFixture<RouteStopListComponent>;

  function addressElements(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.stop-address'),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RouteStopListComponent],
      imports: [TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteStopListComponent);
  });

  it('renders the address under a stop that has one', () => {
    fixture.componentInstance.stops = [makeStop(1, 'nong_chak')];
    fixture.detectChanges();

    const rendered = addressElements();
    expect(rendered.length).toBe(1);
    expect(rendered[0].textContent?.trim()).toBe('Address 1');
  });

  it('renders no address element at all for a stop whose address is null', () => {
    const stop = { ...makeStop(1, 'nong_chak'), address: null };
    fixture.componentInstance.stops = [stop as unknown as RouteStop];
    fixture.detectChanges();

    // Not "renders an empty one" — the row must close up, leaving no blank line
    // under the stop name.
    expect(addressElements().length).toBe(0);
  });

  /**
   * OBRS-1358. There used to be two confirm buttons - one per `type` - labelled as if each
   * confirmed its own side while the handler behind both demanded the pair. Counting the
   * elements is what tells a single shared button from a re-split pair; a label assertion
   * would still pass if the other one came back under a different key.
   */
  it('renders exactly one confirm button, on either type of list', () => {
    for (const type of ['pickup', 'dropoff'] as const) {
      fixture.componentInstance.type = type;
      fixture.componentInstance.stops = [makeStop(1, 'nong_chak')];
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll('p-button').length,
      ).toBe(1);
    }
  });

  it('renders an address only for the stops that have one', () => {
    fixture.componentInstance.stops = [
      makeStop(1, 'nong_chak'),
      { ...makeStop(2, 'bts_mo_chit'), address: null } as unknown as RouteStop,
      makeStop(3, 'mo_chit_2_bus_terminal'),
    ];
    fixture.detectChanges();

    expect(addressElements().length).toBe(2);
  });
});

/**
 * OBRS-1214. `showLocateMe` defaults to `false` so the "use my location"
 * button stays off the dropoff list and the change-stop dialog
 * (`confirmMode="per-side"`, neither of which binds this input) — that
 * default is the whole of their protection, so a count-0 assertion pins it
 * the same way the confirm-button test above pins "exactly one".
 */
describe('RouteStopListComponent — use my location (OBRS-1214)', () => {
  let fixture: ComponentFixture<RouteStopListComponent>;

  function locateBtn(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.locate-me-inline-btn');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RouteStopListComponent],
      imports: [TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteStopListComponent);
  });

  it('showLocateMe=false (default) renders no locate-me button', () => {
    fixture.detectChanges();
    expect(locateBtn()).toBeNull();
  });

  it('showLocateMe=true renders the locate-me button', () => {
    fixture.componentInstance.showLocateMe = true;
    fixture.detectChanges();
    expect(locateBtn()).not.toBeNull();
  });

  it('clicking the locate-me button emits locateMeClicked', () => {
    fixture.componentInstance.showLocateMe = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('locateMeClicked');
    fixture.componentInstance.locateMeClicked.subscribe(spy);

    locateBtn()!.click();

    expect(spy).toHaveBeenCalled();
  });

  it('locating=true disables the button and swaps the label to LOCATING', () => {
    fixture.componentInstance.showLocateMe = true;
    fixture.detectChanges();
    expect(locateBtn()!.textContent).toContain('USE_MY_LOCATION');

    fixture.componentInstance.locating = true;
    fixture.detectChanges();

    expect(locateBtn()!.disabled).toBeTrue();
    expect(locateBtn()!.textContent).toContain('LOCATING');
  });

  it('locationError renders a different message for "denied" vs "unavailable"', () => {
    fixture.componentInstance.showLocateMe = true;

    fixture.componentInstance.locationError = 'denied';
    fixture.detectChanges();
    const deniedText = (fixture.nativeElement as HTMLElement).querySelector('.text-danger')!.textContent;
    expect(deniedText).toContain('LOCATION_DENIED');

    fixture.componentInstance.locationError = 'unavailable';
    fixture.detectChanges();
    const unavailableText = (fixture.nativeElement as HTMLElement).querySelector('.text-danger')!.textContent;
    expect(unavailableText).toContain('LOCATION_UNAVAILABLE');

    expect(deniedText).not.toEqual(unavailableText);
  });

  it('no locationError renders no error message', () => {
    fixture.componentInstance.showLocateMe = true;
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.text-danger')
    ).toBeNull();
  });
});
