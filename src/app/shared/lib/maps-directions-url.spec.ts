import { buildMapsDirectionsUrl } from './maps-directions-url';

describe('buildMapsDirectionsUrl', () => {
  it('builds a maps/dir deep-link with the destination and driving travel mode', () => {
    const url = buildMapsDirectionsUrl(13.7563, 100.5018);

    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018&travelmode=driving'
    );
  });

  it('handles negative coordinates', () => {
    const url = buildMapsDirectionsUrl(-33.8688, 151.2093);

    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.8688,151.2093&travelmode=driving'
    );
  });
});
