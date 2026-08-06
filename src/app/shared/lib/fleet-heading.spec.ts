import { compassPointFromCourse, normalizeCourse } from './fleet-heading';

describe('fleet-heading', () => {
  describe('normalizeCourse', () => {
    it('passes through a value already in [0, 360)', () => {
      expect(normalizeCourse(90)).toBe(90);
    });

    it('wraps 360 to 0', () => {
      expect(normalizeCourse(360)).toBe(0);
    });

    it('wraps a negative value into range', () => {
      expect(normalizeCourse(-10)).toBe(350);
    });

    it('treats null as no direction', () => {
      expect(normalizeCourse(null)).toBeNull();
    });

    it('treats undefined as no direction', () => {
      expect(normalizeCourse(undefined)).toBeNull();
    });

    it('treats NaN as no direction', () => {
      expect(normalizeCourse(NaN)).toBeNull();
    });

    it('treats Infinity as no direction', () => {
      expect(normalizeCourse(Infinity)).toBeNull();
    });
  });

  describe('compassPointFromCourse — 8 sectors of 45°, north centred on 0° ([337.5°, 22.5°))', () => {
    it('0° is N', () => {
      expect(compassPointFromCourse(0)).toBe('N');
    });

    it('22.4° is still N — just under the N/NE boundary', () => {
      expect(compassPointFromCourse(22.4)).toBe('N');
    });

    it('22.5° crosses exactly into NE', () => {
      expect(compassPointFromCourse(22.5)).toBe('NE');
    });

    it('337.5° is N — the lower boundary wrapping in from NW', () => {
      expect(compassPointFromCourse(337.5)).toBe('N');
    });

    it('359° is N', () => {
      expect(compassPointFromCourse(359)).toBe('N');
    });

    it('360° normalizes to 0° and is N', () => {
      expect(compassPointFromCourse(360)).toBe('N');
    });

    it('null has no direction', () => {
      expect(compassPointFromCourse(null)).toBeNull();
    });

    it('NaN has no direction', () => {
      expect(compassPointFromCourse(NaN)).toBeNull();
    });

    it('resolves the remaining cardinal/intercardinal points correctly', () => {
      expect(compassPointFromCourse(90)).toBe('E');
      expect(compassPointFromCourse(135)).toBe('SE');
      expect(compassPointFromCourse(180)).toBe('S');
      expect(compassPointFromCourse(225)).toBe('SW');
      expect(compassPointFromCourse(270)).toBe('W');
      expect(compassPointFromCourse(315)).toBe('NW');
    });
  });
});
