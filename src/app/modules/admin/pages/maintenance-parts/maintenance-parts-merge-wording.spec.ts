import thI18n from '../../../../../../public/i18n/th.json';

/**
 * OBRS-1634: the card's wording rules are load-bearing, not stylistic (owner ruling 2026-08-29,
 * Jira comment 13706/13715) — locked here against the REAL `th.json` content (Thai is the
 * product's default locale) so a future edit to the copy cannot silently reintroduce the wrong
 * words without failing a test, independent of how the component that renders them is refactored.
 */
describe('OBRS-1634 maintenance-parts merge/reopen wording', () => {
  const parts = (thI18n as any).ADMIN.MAINTENANCE_PARTS as Record<string, string>;

  it('names the reopen control "เปิดใช้ชื่อนี้อีกครั้ง", never "ยกเลิกการรวม"', () => {
    expect(parts['REOPEN']).toBe('เปิดใช้ชื่อนี้อีกครั้ง');
    expect(parts['REOPEN']).not.toContain('ยกเลิกการรวม');
  });

  it('never says "ยกเลิกการรวม" anywhere the reopen flow speaks', () => {
    const reopenCopy = Object.entries(parts)
      .filter(([key]) => key.startsWith('REOPEN'))
      .map(([, value]) => value)
      .join(' ');
    expect(reopenCopy).not.toContain('ยกเลิกการรวม');
  });

  it('states plainly that bills entered while merged do not move back on reopen', () => {
    expect(parts['REOPEN_CONFIRM_MESSAGE']).toContain('ไม่ย้ายกลับ');
  });

  it('never claims a merge is permanent/irreversible ("ถาวร" / "ย้อนกลับไม่ได้") anywhere the merge flow speaks', () => {
    const mergeCopy = Object.entries(parts)
      .filter(([key]) => key.startsWith('MERGE'))
      .map(([, value]) => value)
      .join(' ');
    expect(mergeCopy).not.toContain('ถาวร');
    expect(mergeCopy).not.toContain('ย้อนกลับไม่ได้');
  });

  it('the merge confirm dialog says the merge is reversible', () => {
    expect(parts['MERGE_REVERSIBLE_NOTE']).toContain('แยกกลับได้');
  });
});
