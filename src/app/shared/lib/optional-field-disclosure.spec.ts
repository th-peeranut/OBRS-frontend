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

  // OBRS-1955 reads the offending controls out of the DOM and focuses the first one, so a
  // field this helper hides is a field that card can neither name nor reach — the booking
  // would be refused over something the traveler cannot see. An invalid control therefore
  // outranks the collapse the traveler asked for, until it is fixed or emptied.
  describe('a control that is blocking the booking', () => {
    it('stays on screen even though the traveler collapsed it', () => {
      expect(isOptionalFieldShown(false, '0812', true)).toBe(true);
    });

    it('stays on screen even when the value alone would not open it', () => {
      expect(isOptionalFieldShown(undefined, '', true)).toBe(true);
    });

    it('changes nothing while the control is valid', () => {
      expect(isOptionalFieldShown(false, '0812345678', false)).toBe(false);
      expect(isOptionalFieldShown(undefined, '', false)).toBe(false);
    });
  });
});
