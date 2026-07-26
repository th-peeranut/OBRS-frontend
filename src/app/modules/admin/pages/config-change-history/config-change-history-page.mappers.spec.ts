import { HttpErrorResponse } from '@angular/common/http';
import {
  actorDisplayKind,
  configKeyLabel,
  ConfigValueSlot,
  displayChangedAt,
  extractConfigHistoryErrorCode,
  formatConfigValue,
  nullValueI18nKey,
  roleLabel,
  scopeDisplayKind,
} from './config-change-history-page.mappers';
import {
  ConfigHistoryOperation,
  ConfigHistoryRow,
  ConfigHistoryScope,
  ConfigHistoryValue,
} from '../../../../shared/interfaces/config-history.interface';

// OBRS-742: formatConfigValue takes the whole row, because a null means
// opposite things in the two slots. Only these three fields matter to it.
type ValueRow = Pick<ConfigHistoryRow, 'operation' | 'oldValue' | 'newValue'>;

// A minimal translation table so translateFn behaves like ngx-translate's
// instant(): known key -> its string, unknown key -> the key ITSELF (the
// real ngx-translate miss-fallback — this is exactly what configKeyLabel's
// own fallback detection depends on, G1/G2 below).
function fakeTranslate(known: Record<string, string> = {}): (key: string, params?: Record<string, unknown>) => string {
  return (key: string, params?: Record<string, unknown>) => {
    if (key in known) {
      const value = known[key];
      if (params) {
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
          value
        );
      }
      return value;
    }
    return key;
  };
}

describe('config-change-history-page.mappers', () => {
  // ── G1/G2: config-key label i18n fallback + dot-sanitize ────────────────
  describe('configKeyLabel', () => {
    it('translates a known config key', () => {
      const t = fakeTranslate({ 'ADMIN.CONFIG_CHANGE_HISTORY.KEYS.jump_seat_enabled': 'เปิดการขายเบาะเสริม (walk-in)' });
      expect(configKeyLabel('jump_seat_enabled', t)).toBe('เปิดการขายเบาะเสริม (walk-in)');
    });

    // G1: an UNTRANSLATED config key must render the RAW key, never blank,
    // never the i18n key PATH (design-system §0.5 lock — this is the whole
    // reason the page exists).
    it('G1 — falls back to the RAW config key (not the i18n key path, not blank) when no label exists', () => {
      const t = fakeTranslate({});
      expect(configKeyLabel('some_brand_new_config_key', t)).toBe('some_brand_new_config_key');
    });

    // G2: a config key containing a dot must resolve through the SANITIZED
    // (`.` -> `_`) lookup key, not the raw dotted path (which ngx-translate
    // would walk as nested KEYS -> parcel -> prohibited_categories).
    it('G2 — sanitizes a dotted config key (`.` -> `_`) before lookup, and still falls back to the RAW (dotted) key on miss', () => {
      const t = fakeTranslate({
        'ADMIN.CONFIG_CHANGE_HISTORY.KEYS.parcel_prohibited_categories': 'หมวดหมู่พัสดุต้องห้าม',
      });
      expect(configKeyLabel('parcel.prohibited_categories', t)).toBe('หมวดหมู่พัสดุต้องห้าม');

      const tMiss = fakeTranslate({});
      expect(configKeyLabel('parcel.prohibited_categories', tMiss)).toBe('parcel.prohibited_categories');
    });
  });

  // ── G3: every JsonNode shape ─────────────────────────────────────────────
  describe('formatConfigValue', () => {
    const t = fakeTranslate({
      'ADMIN.CONFIG_CHANGE_HISTORY.VALUE_DELETED': 'ถูกลบ',
      'ADMIN.CONFIG_CHANGE_HISTORY.VALUE_UNSET': 'ยังไม่ได้ตั้งค่า',
      'ADMIN.CONFIG_CHANGE_HISTORY.BOOL.ON': 'เปิด',
      'ADMIN.CONFIG_CHANGE_HISTORY.BOOL.OFF': 'ปิด',
      'ADMIN.CONFIG_CHANGE_HISTORY.VALUE.MORE': 'และอีก {{count}} รายการ',
    });

    // Shape dispatch is independent of operation/slot — exercise it through an
    // ordinary UPDATE row's `newValue`, the overwhelmingly common case.
    function updated(newValue: ConfigHistoryValue): ValueRow {
      return { operation: 'UPDATE', oldValue: 30, newValue };
    }

    it('renders a number as-is', () => {
      expect(formatConfigValue(updated(45), 'new', t)).toBe('45');
      expect(formatConfigValue(updated(0), 'new', t)).toBe('0');
    });

    it('renders a boolean via the ON/OFF i18n keys, never as "true"/"false"', () => {
      expect(formatConfigValue(updated(true), 'new', t)).toBe('เปิด');
      expect(formatConfigValue(updated(false), 'new', t)).toBe('ปิด');
    });

    it('renders a string quoted', () => {
      expect(formatConfigValue(updated('hello'), 'new', t)).toBe('"hello"');
    });

    it('renders a short array joined with ", ", no truncation suffix', () => {
      expect(formatConfigValue(updated(['flammable', 'explosive']), 'new', t)).toBe(
        'flammable, explosive'
      );
    });

    it('truncates an array beyond 3 items and appends the +N more count', () => {
      expect(formatConfigValue(updated(['a', 'b', 'c', 'd', 'e']), 'new', t)).toBe(
        'a, b, c และอีก 2 รายการ'
      );
    });

    // Hard constraint #5: dispatch is by REAL JSON shape, never inferred from
    // the config key's name — pin that a numeric-LOOKING string still quotes.
    it('does not infer numeric type from a numeric-looking STRING value', () => {
      expect(formatConfigValue(updated('45'), 'new', t)).toBe('"45"');
    });

    it('reads the slot it is asked for, not whichever end happens to be null', () => {
      expect(formatConfigValue({ operation: 'UPDATE', oldValue: 30, newValue: 45 }, 'old', t)).toBe(
        '30'
      );
      expect(formatConfigValue({ operation: 'UPDATE', oldValue: 30, newValue: 45 }, 'new', t)).toBe(
        '45'
      );
    });

    // ── OBRS-742: the two nulls, and the whole row each one belongs to ──────
    //
    // This block replaces a test that asserted the BUG. Its old name —
    // "renders null as VALUE_DELETED (operation === DELETE)" — stated a
    // condition the assertion never checked: it passed a bare null with no
    // operation at all, so it was green for INSERT rows too, which is exactly
    // the case it was pretending to exclude. Verified red before the fix:
    // `Expected 'ถูกลบ' not to be 'ถูกลบ'.`
    describe('a null value', () => {
      // AC3 — the DELETE row must keep the wording it has always had.
      it("DELETE row, 'new' slot -> still 'ถูกลบ' (the value really was removed)", () => {
        const row: ValueRow = { operation: 'DELETE', oldValue: 45, newValue: null };
        expect(formatConfigValue(row, 'new', t)).toBe('ถูกลบ');
      });

      it("DELETE row, 'old' slot -> the value being removed, never the word", () => {
        const row: ValueRow = { operation: 'DELETE', oldValue: 45, newValue: null };
        expect(formatConfigValue(row, 'old', t)).toBe('45');
      });

      // AC2 — an owner's FIRST override. Reachable since OBRS-730's V51.
      it("INSERT row, 'old' slot -> 'ยังไม่ได้ตั้งค่า', NOT 'ถูกลบ'", () => {
        const row: ValueRow = { operation: 'INSERT', oldValue: null, newValue: 45 };
        const rendered = formatConfigValue(row, 'old', t);
        expect(rendered).toBe('ยังไม่ได้ตั้งค่า');
        expect(rendered).not.toBe('ถูกลบ');
      });

      it("INSERT row renders end-to-end as 'ยังไม่ได้ตั้งค่า -> 45'", () => {
        const row: ValueRow = { operation: 'INSERT', oldValue: null, newValue: 45 };
        expect(`${formatConfigValue(row, 'old', t)} -> ${formatConfigValue(row, 'new', t)}`).toBe(
          'ยังไม่ได้ตั้งค่า -> 45'
        );
      });

      // The rule stated once, over every (operation, slot) pair that exists:
      // exactly ONE of the six earns the deletion wording.
      it('VALUE_DELETED is reachable from exactly one (operation, slot) pair', () => {
        const operations: ConfigHistoryOperation[] = ['INSERT', 'UPDATE', 'DELETE'];
        const slots: ConfigValueSlot[] = ['old', 'new'];
        const deleted = operations.flatMap((operation) =>
          slots
            .filter(
              (slot) =>
                nullValueI18nKey(operation, slot) === 'ADMIN.CONFIG_CHANGE_HISTORY.VALUE_DELETED'
            )
            .map((slot) => `${operation}/${slot}`)
        );
        expect(deleted).toEqual(['DELETE/new']);
      });

      // Fail-safe direction. A future operation this build has never heard of
      // must degrade to the always-true "no value here", never to a deletion
      // claim — the same class of assumption ('UPDATE' | 'DELETE' is total)
      // that V51 falsified and this card exists to fix.
      it('an operation this build does not know falls back to VALUE_UNSET, never VALUE_DELETED', () => {
        const unknown = 'RESTORE' as ConfigHistoryOperation;
        expect(nullValueI18nKey(unknown, 'new')).toBe('ADMIN.CONFIG_CHANGE_HISTORY.VALUE_UNSET');
        expect(nullValueI18nKey(unknown, 'old')).toBe('ADMIN.CONFIG_CHANGE_HISTORY.VALUE_UNSET');
      });
    });
  });

  // ── G4/G5: all 5 actor render cases, PRE_FEATURE distinct from UNATTRIBUTED ──
  describe('actorDisplayKind', () => {
    it('USER with a name -> "user"', () => {
      const row: Pick<ConfigHistoryRow, 'actorSource' | 'actorName'> = {
        actorSource: 'USER',
        actorName: 'สมชาย ใจดี',
      };
      expect(actorDisplayKind(row)).toBe('user');
    });

    it('USER with actorName null (deleted user) -> "user-deleted", NOT "pre-feature" or "unattributed"', () => {
      const row: Pick<ConfigHistoryRow, 'actorSource' | 'actorName'> = {
        actorSource: 'USER',
        actorName: null,
      };
      const kind = actorDisplayKind(row);
      expect(kind).toBe('user-deleted');
      expect(kind).not.toBe('pre-feature');
      expect(kind).not.toBe('unattributed');
    });

    it('SYSTEM -> "system"', () => {
      expect(actorDisplayKind({ actorSource: 'SYSTEM', actorName: null })).toBe('system');
    });

    it('PRE_FEATURE -> "pre-feature"', () => {
      expect(actorDisplayKind({ actorSource: 'PRE_FEATURE', actorName: null })).toBe('pre-feature');
    });

    it('UNATTRIBUTED -> "unattributed"', () => {
      expect(actorDisplayKind({ actorSource: 'UNATTRIBUTED', actorName: null })).toBe('unattributed');
    });

    // G5: assert the two are NOT equal, not just each individually correct.
    it('G5 — PRE_FEATURE and UNATTRIBUTED map to DIFFERENT kinds', () => {
      const preFeature = actorDisplayKind({ actorSource: 'PRE_FEATURE', actorName: null });
      const unattributed = actorDisplayKind({ actorSource: 'UNATTRIBUTED', actorName: null });
      expect(preFeature).not.toBe(unattributed);
    });

    // G4: none of the 5 renderable kinds is ever an empty-string sentinel —
    // exhaustive over every real actorSource value plus the actorName split.
    it('G4 — every real (actorSource, actorName) combination maps to a non-empty, defined kind', () => {
      const combos: Array<Pick<ConfigHistoryRow, 'actorSource' | 'actorName'>> = [
        { actorSource: 'USER', actorName: 'สมชาย' },
        { actorSource: 'USER', actorName: null },
        { actorSource: 'SYSTEM', actorName: null },
        { actorSource: 'PRE_FEATURE', actorName: null },
        { actorSource: 'UNATTRIBUTED', actorName: null },
      ];
      for (const combo of combos) {
        expect(actorDisplayKind(combo)).toBeTruthy();
      }
    });
  });

  // OBRS-722 — the ขอบเขต column's render bucket.
  describe('scopeDisplayKind', () => {
    it("scope 'PLATFORM' -> 'platform', whatever the actor's own role is", () => {
      expect(scopeDisplayKind({ scope: 'PLATFORM', ownerName: null })).toBe('platform');
    });

    it("scope 'OWNER' with a resolved name -> 'owner'", () => {
      expect(scopeDisplayKind({ scope: 'OWNER', ownerName: 'มาลี' })).toBe('owner');
    });

    it("scope 'OWNER' with a null name (deleted owner) -> 'owner-deleted', NOT 'platform' — this is "
      + 'the whole point of the field: a row that changed ONE owner\'s value must never render as '
      + 'the platform default that every owner inherits', () => {
      expect(scopeDisplayKind({ scope: 'OWNER', ownerName: null })).toBe('owner-deleted');
    });

    it('is total over every scope x ownerName combination - no combination falls through to a '
      + 'blank cell', () => {
      const scopes: ConfigHistoryScope[] = ['PLATFORM', 'OWNER'];
      for (const scope of scopes) {
        for (const ownerName of ['มาลี', null]) {
          expect(scopeDisplayKind({ scope, ownerName })).toBeTruthy();
        }
      }
    });

    it("a PLATFORM row that somehow carries an ownerName still reads 'platform' — the nullable "
      + 'COLUMN is the source of truth, never the presence of a name', () => {
      expect(scopeDisplayKind({ scope: 'PLATFORM', ownerName: 'มาลี' })).toBe('platform');
    });
  });

  describe('roleLabel', () => {
    it('delegates to the shared role-slug translator (user-management.mappers.ts)', () => {
      const t = fakeTranslate({ 'ADMIN.USERS.ROLE_NAMES.owner': 'เจ้าของ' });
      expect(roleLabel('owner', t)).toBe('เจ้าของ');
    });

    it('returns an empty string for a null role (SYSTEM/UNATTRIBUTED/PRE_FEATURE rows)', () => {
      const t = fakeTranslate({});
      expect(roleLabel(null, t)).toBe('');
    });
  });

  describe('extractConfigHistoryErrorCode', () => {
    it('reads errorCode off an HttpErrorResponse', () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: { errorCode: 'CONFIG_HISTORY_RANGE_INVALID' },
      });
      expect(extractConfigHistoryErrorCode(error)).toBe('CONFIG_HISTORY_RANGE_INVALID');
    });

    it('returns null when there is no errorCode', () => {
      expect(extractConfigHistoryErrorCode(new HttpErrorResponse({ status: 500 }))).toBeNull();
      expect(extractConfigHistoryErrorCode(new Error('boom'))).toBeNull();
    });
  });

  describe('displayChangedAt', () => {
    it('renders the Bangkok-offset ISO timestamp without re-converting timezone', () => {
      // The backend already applies +07:00 (SA §6.4) — this just needs to
      // render, not shift, the wall-clock time it carries.
      const result = displayChangedAt('2026-07-20T14:32:11.482+07:00', 'en');
      expect(result).toContain('14:32');
      expect(result).toContain('2026');
    });

    it('renders the "-" sentinel for an empty value', () => {
      expect(displayChangedAt('', 'en')).toBe('-');
    });
  });
});
