import { FormControl } from '@angular/forms';
import { accountNameCharsetValidator } from './account-name-charset.validator';

describe('accountNameCharsetValidator', () => {
  // OBRS-1464 AC-3: the half that matters. A denylist is only worth having if
  // the awkward-but-REAL names still get through - a customer who cannot enter
  // their own account name cannot cancel their ticket at all.
  it('accepts real Thai names that a naive "letters only" rule would block', () => {
    expect(accountNameCharsetValidator(new FormControl('น.ส. สมหญิง ใจดี'))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl('ด.ช. สมชาย ใจดี'))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl('บริษัท เอ็น.เจ. ผู้ใหญ่ปู จำกัด'))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl('บริษัท ขนส่ง จำกัด (มหาชน)'))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl('นางสาว ศิริ-พร แซ่ตั้ง'))).toBeNull();
  });

  it('accepts a Latin-script name on the same account', () => {
    expect(accountNameCharsetValidator(new FormControl('Miss Somying Jaidee'))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl("O'Brien, Patrick"))).toBeNull();
  });

  it('is a no-op on a blank value (left to the required validator)', () => {
    expect(accountNameCharsetValidator(new FormControl(''))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl('   '))).toBeNull();
    expect(accountNameCharsetValidator(new FormControl(null))).toBeNull();
  });

  it('rejects an account NUMBER typed into the name field', () => {
    expect(accountNameCharsetValidator(new FormControl('1480622621'))).toEqual({
      accountNameCharset: true,
    });
    expect(accountNameCharsetValidator(new FormControl('148-0-62262-1'))).toEqual({
      accountNameCharset: true,
    });
  });

  it('rejects Thai digits, not only Arabic ones', () => {
    expect(accountNameCharsetValidator(new FormControl('สมหญิง ๑๒๓'))).toEqual({
      accountNameCharset: true,
    });
  });

  it('rejects a note to oneself rather than a name', () => {
    expect(accountNameCharsetValidator(new FormControl('ชื่อบัญชี ถามพี่เอาอีกที?'))).toEqual({
      accountNameCharset: true,
    });
    expect(accountNameCharsetValidator(new FormControl('somying@example.com'))).toEqual({
      accountNameCharset: true,
    });
  });
});
