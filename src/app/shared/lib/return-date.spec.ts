import dayjs from 'dayjs';
import { carryReturnDate, defaultReturnDate } from './return-date';

describe('return-date (OBRS-1185)', () => {
  const departure = new Date('2026-08-11T00:00:00');
  const maxDate = dayjs(departure).add(60, 'day').toDate();

  describe('defaultReturnDate', () => {
    it('is one day after departure, not the same day', () => {
      const result = defaultReturnDate(departure, maxDate);

      expect(dayjs(result).isSame(dayjs(departure), 'day')).toBeFalse();
      expect(dayjs(result).isSame(dayjs(departure).add(1, 'day'), 'day')).toBeTrue();
    });

    it('never returns a date before departure', () => {
      const result = defaultReturnDate(departure, maxDate);

      expect(dayjs(result).isBefore(dayjs(departure), 'day')).toBeFalse();
    });

    it('respects maxDate — capped when departure+1day would exceed the policy cap', () => {
      const tightCap = dayjs(departure).toDate(); // cap == departure itself
      const result = defaultReturnDate(departure, tightCap);

      expect(dayjs(result).isSame(dayjs(tightCap), 'day')).toBeTrue();
    });
  });

  describe('carryReturnDate', () => {
    it('keeps the SAME reference when the current return is still on/after the new departure', () => {
      const currentReturn = dayjs(departure).add(3, 'day').toDate();
      const newDeparture = dayjs(departure).add(1, 'day').toDate();

      const result = carryReturnDate(newDeparture, currentReturn, maxDate);

      expect(result).toBe(currentReturn);
    });

    it('keeps the SAME reference when the current return equals the new departure day', () => {
      const newDeparture = dayjs(departure).add(2, 'day').toDate();
      const currentReturn = new Date(newDeparture);

      const result = carryReturnDate(newDeparture, currentReturn, maxDate);

      expect(result).toBe(currentReturn);
    });

    it('carries the return date FORWARD when departure moves past it', () => {
      const currentReturn = dayjs(departure).add(1, 'day').toDate();
      const newDeparture = dayjs(departure).add(5, 'day').toDate();

      const result = carryReturnDate(newDeparture, currentReturn, maxDate);

      expect(result).not.toBe(currentReturn);
      expect(dayjs(result).isBefore(dayjs(newDeparture), 'day')).toBeFalse();
      expect(dayjs(result).isSame(dayjs(newDeparture).add(1, 'day'), 'day')).toBeTrue();
    });
  });
});
