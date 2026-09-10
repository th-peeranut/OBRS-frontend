import { AdminExpensePayeeDto } from '../../../../services/admin/admin-api.service';
import {
  filterPayeesByQuery,
  findPayeeByExactName,
  inferPayeeTypeFromCategory,
  normalizePayeeName,
  sortPayeesByName,
} from './expense-payees.mappers';

/**
 * OBRS-1577. `normalizePayeeName` is a hand-maintained mirror of the backend's
 * `ExpensePayeeDtoService.normalize`, and the cases below are deliberately THE SAME CASES as
 * `ExpensePayeeDtoServiceTest` — this file is the only thing standing between the two copies and a
 * silent drift, because no build step compares them.
 *
 * Every separator is written as an explicit `\uXXXX` escape rather than pasted. These are characters
 * NOBODY CAN SEE: pasted, they look like trailing whitespace and the next reader tidies them away,
 * and every tool between here and the disk gets a chance to eat one backslash — which is how the
 * original one-backslash defect on the Java side was written in the first place.
 */
describe('expense-payees.mappers', () => {
  // อู่เฮีย — อ + SARA UU + MAI EK, then เ ฮ ี ย. Canonical (NFC) mark order.
  const LEFT = '\u0E2D\u0E39\u0E48\u0E40\u0E2E\u0E35\u0E22';
  // หน่อง — ห น + MAI EK + อ ง.
  const RIGHT = '\u0E2B\u0E19\u0E48\u0E2D\u0E07';
  // อู่เฮียหน่อง, written the way the database holds it.
  const CANONICAL = LEFT + RIGHT;

  const joinedBy = (separator: string): string => LEFT + separator + RIGHT;

  const payee = (id: number, name: string, overrides: Partial<AdminExpensePayeeDto> = {}):
    AdminExpensePayeeDto => ({ id, name, type: 'GARAGE', active: true, ...overrides });

  describe('normalizePayeeName', () => {
    it('collapses an ordinary space in the middle', () => {
      expect(normalizePayeeName(joinedBy(' '))).toBe(normalizePayeeName(CANONICAL));
    });

    it('collapses a TAB', () => {
      expect(normalizePayeeName(joinedBy('\t'))).toBe(normalizePayeeName(CANONICAL));
    });

    it('collapses a NO-BREAK SPACE — Thai keyboards and spreadsheet pastes emit it', () => {
      expect(normalizePayeeName(joinedBy('\u00A0'))).toBe(normalizePayeeName(CANONICAL));
    });

    it('collapses a ZERO WIDTH SPACE — Thai has no word space, so this IS the word break', () => {
      // Invisible on every screen the owner will ever look at. Left in, it is a second garage with
      // its own id and its own half of the year's spend.
      expect(normalizePayeeName(joinedBy('\u200B'))).toBe(normalizePayeeName(CANONICAL));
    });

    it('collapses a WORD JOINER (U+2060), which no `\\s` in either language matches', () => {
      expect(normalizePayeeName(joinedBy('\u2060'))).toBe(normalizePayeeName(CANONICAL));
    });

    it('collapses a NEXT LINE (U+0085) — in `\\s` for Java but NOT for JavaScript', () => {
      // The named reason this class exists: the two languages disagree about what `\s` covers, so
      // relying on it would make the browser and the server answer differently for the same name.
      expect(normalizePayeeName(joinedBy('\u0085'))).toBe(normalizePayeeName(CANONICAL));
    });

    it('strips a BOM pasted onto the front', () => {
      expect(normalizePayeeName('\uFEFF' + CANONICAL)).toBe(normalizePayeeName(CANONICAL));
    });

    it('composes marks typed in the other order — same picture, different bytes', () => {
      // อ + MAI EK + SARA UU, the order somebody may well press them. It renders identically to
      // LEFT, so an owner comparing two rows on screen sees ONE name and cannot tell them apart.
      const reordered = '\u0E2D\u0E48\u0E39\u0E40\u0E2E\u0E35\u0E22' + RIGHT;

      expect(reordered).not.toBe(CANONICAL);
      expect(normalizePayeeName(reordered)).toBe(normalizePayeeName(CANONICAL));
    });

    it('ignores case, and never the browser locale’s idea of case', () => {
      expect(normalizePayeeName('PTT Nong Chak')).toBe(normalizePayeeName('ptt  nongchak'));
    });

    it('keeps two genuinely different stations apart — it folds noise, not names', () => {
      expect(normalizePayeeName('PTT Nong Chak')).not.toBe(normalizePayeeName('PT Nong Chak'));
    });
  });

  describe('inferPayeeTypeFromCategory', () => {
    it('maps REPAIR to a garage and FUEL to a petrol station', () => {
      expect(inferPayeeTypeFromCategory('REPAIR')).toBe('GARAGE');
      expect(inferPayeeTypeFromCategory('FUEL')).toBe('FUEL_STATION');
    });

    it('maps every other category to OTHER, including the ones that look like repairs', () => {
      // TIRE and INSPECTION are the tempting ones. Measured on 5 real bills (OBRS-1578,
      // 2026-08-24): 3 of 5 payees an owner books under REPAIR are not garages at all, so a wider
      // guess is a wronger guess.
      ['TIRE', 'INSPECTION', 'INSURANCE', 'TOLL', 'CENTRAL', 'OTHER', ''].forEach((category) => {
        expect(inferPayeeTypeFromCategory(category)).toBe('OTHER');
      });
    });
  });

  describe('filterPayeesByQuery', () => {
    const payees = [payee(1, CANONICAL), payee(2, 'PTT Nong Chak', { type: 'FUEL_STATION' })];

    it('matches across a space the owner typed but the stored name does not have', () => {
      expect(filterPayeesByQuery(payees, joinedBy(' ')).map((p) => p.id)).toEqual([1]);
    });

    it('matches on a fragment, so the list narrows while typing', () => {
      expect(filterPayeesByQuery(payees, 'nong').map((p) => p.id)).toEqual([2]);
    });

    it('offers everything for an empty or whitespace-only query', () => {
      expect(filterPayeesByQuery(payees, '').length).toBe(2);
      expect(filterPayeesByQuery(payees, '   ').length).toBe(2);
    });
  });

  describe('findPayeeByExactName', () => {
    const payees = [payee(1, CANONICAL)];

    it('finds the row for a name that differs only by invisible characters', () => {
      expect(findPayeeByExactName(payees, joinedBy('\u200B'))?.id).toBe(1);
    });

    it('does NOT treat a prefix as a match — a shorter name is a legitimate new payee', () => {
      // The substring rule belongs to the filter, never to this. Reusing it here would refuse to
      // add "อู่เฮีย" for as long as "อู่เฮียหน่อง" is on record, and strand the owner mid-bill.
      expect(findPayeeByExactName(payees, LEFT)).toBeUndefined();
    });

    it('returns nothing for an empty query rather than the first row', () => {
      expect(findPayeeByExactName(payees, '  ')).toBeUndefined();
    });
  });

  describe('sortPayeesByName', () => {
    it('orders by name without mutating the input', () => {
      // Asserted on the LATIN pair only. Thai collation depends on the ICU data the browser was
      // built with, so pinning where a Thai name lands relative to a Latin one would make this test
      // a report on the test runner rather than on the function.
      const payees = [payee(1, 'PTT Nong Chak'), payee(2, CANONICAL), payee(3, 'Anek Service')];
      const sorted = sortPayeesByName(payees);

      expect(payees.map((p) => p.id)).toEqual([1, 2, 3]);
      expect(sorted.length).toBe(3);
      expect(sorted.findIndex((p) => p.id === 3)).toBeLessThan(
        sorted.findIndex((p) => p.id === 1)
      );
    });
  });
});
