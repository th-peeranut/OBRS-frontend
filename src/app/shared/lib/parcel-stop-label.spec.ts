import { parcelStopLabel } from './parcel-stop-label';

describe('parcelStopLabel', () => {
  it('returns the raw string when given a plain string', () => {
    expect(parcelStopLabel('Bangkok')).toBe('Bangkok');
  });

  it('prefers name over label/code/slug', () => {
    expect(parcelStopLabel({ name: 'Bangkok', label: 'BKK', code: 'bkk', slug: 'bangkok' })).toBe(
      'Bangkok'
    );
  });

  it('falls back through label, code, slug in order', () => {
    expect(parcelStopLabel({ label: 'BKK', code: 'bkk', slug: 'bangkok' })).toBe('BKK');
    expect(parcelStopLabel({ code: 'bkk', slug: 'bangkok' })).toBe('bkk');
    expect(parcelStopLabel({ slug: 'bangkok' })).toBe('bangkok');
  });

  it('returns a dash for null/undefined/empty object', () => {
    expect(parcelStopLabel(null)).toBe('-');
    expect(parcelStopLabel(undefined)).toBe('-');
    expect(parcelStopLabel({})).toBe('-');
  });
});
