import { mapTileUrl, MAP_TILE_ATTRIBUTION } from './map-tiles';

describe('mapTileUrl', () => {
  it('composes the MapTiler streets-v2 XYZ template with the given key', () => {
    expect(mapTileUrl('test-key')).toBe(
      'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=test-key'
    );
  });

  it('works with an empty key (composes a URL that will 401 on request, never throws)', () => {
    expect(() => mapTileUrl('')).not.toThrow();
    expect(mapTileUrl('')).toContain('key=');
  });
});

describe('MAP_TILE_ATTRIBUTION', () => {
  it('credits both MapTiler and OpenStreetMap — a licensing obligation, not decoration', () => {
    expect(MAP_TILE_ATTRIBUTION).toContain('MapTiler');
    expect(MAP_TILE_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
