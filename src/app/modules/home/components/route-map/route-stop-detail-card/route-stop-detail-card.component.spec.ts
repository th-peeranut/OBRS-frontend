import { RouteStopDetailCardComponent } from './route-stop-detail-card.component';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

function makeStop(): RouteStop {
  return {
    order: 1,
    slug: 'stop-1',
    name: 'Test Stop',
    address: '123 Main St',
    approxTime: '09:00',
    latitude: 13.7563,
    longitude: 100.5018,
    primaryPhotoUrl: 'https://example.com/photo.jpg',
    googleMapsUrl: 'https://maps.google.com/?q=1,1',
  };
}

describe('RouteStopDetailCardComponent', () => {
  let component: RouteStopDetailCardComponent;

  beforeEach(() => {
    component = new RouteStopDetailCardComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('openMaps does nothing when googleMapsUrl is null', () => {
    component.stop = { ...makeStop(), googleMapsUrl: null };
    const openSpy = spyOn(window, 'open');
    component.openMaps();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('hasPickupCoords is true when both latitude and longitude are present', () => {
    component.stop = makeStop();
    expect(component.hasPickupCoords).toBeTrue();
  });

  it('hasPickupCoords is false when latitude is null', () => {
    component.stop = { ...makeStop(), latitude: null };
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('hasPickupCoords is false when longitude is null', () => {
    component.stop = { ...makeStop(), longitude: null };
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('hasPickupCoords is false when there is no stop', () => {
    component.stop = null;
    expect(component.hasPickupCoords).toBeFalse();
  });

  it('navigateToPickup opens the Google Maps directions deep-link for the stop coords', () => {
    component.stop = makeStop();
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup();

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018&travelmode=driving',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('navigateToPickup does nothing when coords are missing', () => {
    component.stop = { ...makeStop(), latitude: null };
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup();

    expect(openSpy).not.toHaveBeenCalled();
  });

  // OBRS-1022 ---------------------------------------------------------------

  describe('photo state', () => {
    it('shows the photo when a URL is present and it loaded', () => {
      component.stop = makeStop();
      expect(component.showPhoto).toBeTrue();
    });

    it('falls back to the empty state when the photo URL fails to load', () => {
      // The live symptom: one seeded Google photoUri returns 403, so the customer got a
      // broken-image glyph. The card must say "no photo yet" instead.
      component.stop = makeStop();
      component.onPhotoError();
      expect(component.showPhoto).toBeFalse();
    });

    it('clears the failure flag when a different stop is selected', () => {
      // Without the reset, ONE rotted photo would leave every stop selected afterwards stuck on
      // the empty state — a stale flag that reads exactly like missing data.
      component.stop = makeStop();
      component.onPhotoError();

      component.stop = { ...makeStop(), slug: 'stop-2' };

      expect(component.photoFailed).toBeFalse();
      expect(component.showPhoto).toBeTrue();
    });

    it('shows the empty state when the stop has no photo URL at all', () => {
      component.stop = { ...makeStop(), primaryPhotoUrl: null };
      expect(component.showPhoto).toBeFalse();
    });
  });

  describe('landmark note', () => {
    it('returns the owner-written note', () => {
      component.stop = { ...makeStop(), description: 'อยู่ติดกับร้านขายโทรศัพท์มือถือ' };
      expect(component.landmark).toBe('อยู่ติดกับร้านขายโทรศัพท์มือถือ');
    });

    it('is null when the key is ABSENT — the default for every stop today', () => {
      // The backend omits null keys, so "no note written" arrives as an absent property, not
      // null. A getter that only checked `=== null` would render an empty labelled line.
      const stop = makeStop();
      expect('description' in stop).toBeFalse();
      component.stop = stop;
      expect(component.landmark).toBeNull();
    });

    it('is null for a whitespace-only note', () => {
      component.stop = { ...makeStop(), description: '   ' };
      expect(component.landmark).toBeNull();
    });

    it('is null when there is no stop', () => {
      component.stop = null;
      expect(component.landmark).toBeNull();
    });
  });

  /**
   * OBRS-1777. Not a copy of the landmark block above: that one is a note about the
   * surroundings, this one is where the passenger stands, and on a station several operators
   * share they are different facts with different owners. Mo Chit sells for several queues from
   * booth C5 while the NJ queue leaves from bay 43 — the address is true for everyone, the bay
   * is not.
   */
  describe('boarding point (OBRS-1777)', () => {
    it('returns the operator boarding point for THIS route', () => {
      component.stop = { ...makeStop(), boardingPoint: 'ชานชาลา 43' };
      expect(component.boardingPoint).toBe('ชานชาลา 43');
    });

    it('is null when the key is ABSENT — the default until an operator publishes one', () => {
      const stop = makeStop();
      expect('boardingPoint' in stop).toBeFalse();
      component.stop = stop;
      expect(component.boardingPoint).toBeNull();
    });

    it('is null for a whitespace-only value', () => {
      // An empty "จุดขึ้นรถ:" on a shared station reads as "nothing special to find", which is
      // the opposite of true — worse than showing no line.
      component.stop = { ...makeStop(), boardingPoint: '  ' };
      expect(component.boardingPoint).toBeNull();
    });

    it('is null when there is no stop', () => {
      component.stop = null;
      expect(component.boardingPoint).toBeNull();
    });
  });
});
