import { PhoneFormatPipe } from './phone-format.pipe';

describe('PhoneFormatPipe (OBRS-691)', () => {
  let pipe: PhoneFormatPipe;

  beforeEach(() => {
    pipe = new PhoneFormatPipe();
  });

  it('groups a clean 10-digit local mobile number as 3-3-4', () => {
    expect(pipe.transform('0800000000')).toBe('080-000-0000');
    expect(pipe.transform('0812345678')).toBe('081-234-5678');
  });

  it('leaves a half-typed number as bare digits', () => {
    expect(pipe.transform('0812')).toBe('0812');
    expect(pipe.transform('081234567')).toBe('081234567');
  });

  it('renders a non-10-digit / international number as bare digits, not mis-grouped', () => {
    expect(pipe.transform('66812345678')).toBe('66812345678');
    expect(pipe.transform('123456789012345')).toBe('123456789012345');
  });

  it('is idempotent — an already-grouped value passes through unchanged', () => {
    expect(pipe.transform('081-234-5678')).toBe('081-234-5678');
  });

  it('renders null/undefined/empty as an empty string', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
