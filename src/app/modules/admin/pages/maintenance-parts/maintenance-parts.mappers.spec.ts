import {
  findMaintenancePartByExactName,
  isSeededPart,
  maintenancePartLabel,
  sortMaintenancePartsByName,
} from './maintenance-parts.mappers';
import { AdminMaintenancePartDto } from '../../../../services/admin/admin-api.service';

/**
 * OBRS-1613. What is NOT here on purpose: the normalize rule itself. It lives in
 * `shared/lib/registry-name.ts` now and is pinned exhaustively by
 * `expense-payees.mappers.spec.ts` — tab, NBSP, ZWSP, U+2060, NEL, BOM and NFC reordering, one test
 * each. Copying those eight into this file would double the maintenance without adding a guard;
 * the one case below exists only to prove THIS module reaches that rule rather than comparing raw
 * strings.
 */
describe('maintenance-parts.mappers', () => {
  const part = (
    id: number,
    name: string,
    code: string | null = null,
    kind: AdminMaintenancePartDto['kind'] = 'PART'
  ): AdminMaintenancePartDto => ({ id, code, name, kind, active: true });

  describe('isSeededPart', () => {
    it('a row carrying a code is one of the 13 the system seeded', () => {
      expect(isSeededPart(part(1, 'น้ำมันเครื่อง', 'ENGINE_OIL'))).toBe(true);
    });

    it('a row the owner typed has no code', () => {
      expect(isSeededPart(part(2, 'จาระบี'))).toBe(false);
    });
  });

  describe('maintenancePartLabel', () => {
    it('a seeded row is shown through its i18n key, which is what keeps en/zh working', () => {
      const label = maintenancePartLabel(part(1, 'น้ำมันเครื่อง', 'ENGINE_OIL'), (key) =>
        key === 'ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL' ? 'Engine oil' : key
      );

      expect(label).toBe('Engine oil');
    });

    /** The owner's 2026-08-25 ruling: names the owner typed are Thai verbatim on every locale. */
    it('an owner-typed row is shown verbatim and never goes near the bundle', () => {
      const translate = jasmine.createSpy('translate').and.returnValue('SHOULD_NOT_BE_USED');

      expect(maintenancePartLabel(part(2, 'จาระบี'), translate))
        .toBe('จาระบี');
      expect(translate).not.toHaveBeenCalled();
    });

    /**
     * `TranslateService#instant` hands back the KEY when a translation is missing. Showing that to
     * an owner would put ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL on screen; the seeded Thai
     * name is wrong in English but readable, and readable-and-wrong beats an i18n key.
     */
    it('a missing translation falls back to the seeded name, never to the key', () => {
      const label = maintenancePartLabel(part(1, 'น้ำมันเครื่อง', 'ENGINE_OIL'), (key) => key);

      expect(label).toBe('น้ำมันเครื่อง');
    });
  });

  describe('findMaintenancePartByExactName', () => {
    it('reaches the shared normalize rule rather than comparing raw strings', () => {
      const parts = [part(1, 'สายพานหน้าเครื่อง')];

      const found = findMaintenancePartByExactName(
        parts,
        'สายพาน' + '\u200B' + 'หน้าเครื่อง'
      );

      expect(found?.id).toBe(1);
    });

    /**
     * Substring is deliberately NOT a match: an owner whose bill says the shorter name must be able
     * to record it even while the longer one is in the list.
     */
    it('a name that merely contains an existing one is a different entry', () => {
      const parts = [part(1, 'สายพานหน้าเครื่อง')];

      expect(findMaintenancePartByExactName(parts, 'สายพาน')).toBeUndefined();
    });

    it('an empty query matches nothing rather than the first row', () => {
      expect(findMaintenancePartByExactName([part(1, 'สายพาน')], '   ')).toBeUndefined();
    });
  });

  describe('sortMaintenancePartsByName', () => {
    it('sorts by name and leaves the caller\'s array alone', () => {
      const parts = [part(2, 'beta'), part(1, 'alpha')];

      expect(sortMaintenancePartsByName(parts).map((p) => p.id)).toEqual([1, 2]);
      expect(parts.map((p) => p.id)).toEqual([2, 1]);
    });
  });
});
