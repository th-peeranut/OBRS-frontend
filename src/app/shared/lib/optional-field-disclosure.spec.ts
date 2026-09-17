import { isOptionalFieldShown } from './optional-field-disclosure';

describe('isOptionalFieldShown (OBRS-1953)', () => {
  describe('before the traveler has touched the link', () => {
    it('stays collapsed while the control is empty', () => {
      expect(isOptionalFieldShown(undefined, '')).toBe(false);
      expect(isOptionalFieldShown(undefined, null)).toBe(false);
      expect(isOptionalFieldShown(undefined, undefined)).toBe(false);
      expect(isOptionalFieldShown(undefined, '   ')).toBe(false);
    });

    it('opens itself when a value is already there — Back from /payment', () => {
      expect(isOptionalFieldShown(undefined, 'somchai@example.com')).toBe(true);
      expect(isOptionalFieldShown(undefined, '0812345678')).toBe(true);
    });
  });

  describe('once the traveler has chosen', () => {
    it('honours an explicit collapse even though the value is still there', () => {
      expect(isOptionalFieldShown(false, 'somchai@example.com')).toBe(false);
    });

    it('honours an explicit expand on an empty control', () => {
      expect(isOptionalFieldShown(true, '')).toBe(true);
    });
  });
});
