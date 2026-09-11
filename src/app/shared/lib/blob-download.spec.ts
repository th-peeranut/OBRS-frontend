import {
  parseBlobErrorCode,
  parseContentDispositionFilename,
  sanitizeDownloadFilename,
  saveBlob,
} from './blob-download';

/**
 * Scrutinize (OBRS-1802): these three functions were extracted out of
 * `ExportService` so a second caller (the e-ticket PDF) could share them instead
 * of carrying a copy. The extraction doubled the number of callers and left the
 * coverage where it was — transitive, through two service specs, each of which
 * only exercises the branch its own endpoint happens to return. The RFC 5987
 * branch in particular is now reachable from two places and was pinned from one.
 *
 * So: direct specs, the convention nearly every sibling in `shared/lib/` already
 * follows. Nothing here asserts a service's behaviour; these are the pure
 * functions, at the boundaries that actually differ.
 */
describe('parseContentDispositionFilename', () => {
  it('reads the plain quoted form', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="e-ticket-BK-42.pdf"')
    ).toBe('e-ticket-BK-42.pdf');
  });

  it('reads the plain form without quotes', () => {
    expect(
      parseContentDispositionFilename('attachment; filename=bookings.csv')
    ).toBe('bookings.csv');
  });

  /** The whole reason a second copy of this parser would have been a defect:
   *  the backend sends this form for any non-ASCII name, and a parser that only
   *  knows the plain form silently falls back to its caller's generic name. */
  it('prefers the RFC 5987 form and percent-decodes it', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"e-ticket.pdf\"; filename*=UTF-8''%E0%B8%95%E0%B8%B1%E0%B9%8B%E0%B8%A7.pdf"
      )
    ).toBe('ตั๋ว.pdf');
  });

  it('is case-insensitive about the parameter name', () => {
    expect(
      parseContentDispositionFilename('attachment; FileName="ticket.pdf"')
    ).toBe('ticket.pdf');
  });

  /** A truncated percent-escape makes `decodeURIComponent` throw. The raw value
   *  is still a better filename than none, so the catch hands it back rather
   *  than dropping to the caller's fallback. */
  it('falls back to the raw value when the escape sequence is malformed', () => {
    expect(
      parseContentDispositionFilename("attachment; filename*=UTF-8''%E0%A4%A")
    ).toBe('%E0%A4%A');
  });

  it('returns null for a header with no filename at all', () => {
    expect(parseContentDispositionFilename('attachment')).toBeNull();
  });

  it('returns null for an absent header', () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('')).toBeNull();
  });
});

/**
 * With `responseType: 'blob'` the ERROR body is a Blob too, so the global
 * `errorInterceptor` cannot read it and every caller parses the envelope itself.
 * What must come out is a stable UPPER_SNAKE code — never the server's localized
 * `message`, which the caller would then render (design-system.md §9).
 */
describe('parseBlobErrorCode', () => {
  const FALLBACK = 'GENERIC';

  it('returns the errorCode from a well-formed envelope', () => {
    expect(
      parseBlobErrorCode(
        JSON.stringify({ errorCode: 'NO_PRINTABLE_TICKET', message: 'wording' }),
        FALLBACK
      )
    ).toBe('NO_PRINTABLE_TICKET');
  });

  it('falls back when errorCode is an empty string', () => {
    expect(parseBlobErrorCode(JSON.stringify({ errorCode: '' }), FALLBACK)).toBe(
      FALLBACK
    );
  });

  it('falls back when errorCode is absent or not a string', () => {
    expect(parseBlobErrorCode(JSON.stringify({ message: 'x' }), FALLBACK)).toBe(
      FALLBACK
    );
    expect(parseBlobErrorCode(JSON.stringify({ errorCode: 500 }), FALLBACK)).toBe(
      FALLBACK
    );
  });

  /** A proxy's HTML error page, a gateway timeout, an empty body — all of these
   *  reach here, and none may throw out of a download handler. */
  it('falls back on a body that is not JSON at all', () => {
    expect(parseBlobErrorCode('<html>502 Bad Gateway</html>', FALLBACK)).toBe(
      FALLBACK
    );
    expect(parseBlobErrorCode('', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back on JSON that is not an object', () => {
    expect(parseBlobErrorCode('"NO_PRINTABLE_TICKET"', FALLBACK)).toBe(FALLBACK);
    expect(parseBlobErrorCode('null', FALLBACK)).toBe(FALLBACK);
  });

  /** The one thing this function must never do. */
  it('never returns the server message', () => {
    expect(
      parseBlobErrorCode(
        JSON.stringify({ message: 'ไม่พบการจอง' }),
        FALLBACK
      )
    ).toBe(FALLBACK);
  });
});

/**
 * OBRS-1802 security review, L1. Every name these functions save came off the
 * wire, and what kept that safe was a sanitiser in the BACKEND
 * (`ETicketPdfService.java`'s `replaceAll("[^A-Za-z0-9_-]", "-")`) — a real
 * protection, but an invariant of another repository that nothing here stated.
 *
 * ⚠️ Scope, stated rather than implied: these specs assert the SANITISER's
 * output. They do not test what a real browser does with a `download` attribute
 * — Karma cannot observe the file that lands on disk, and `anchor.download`
 * reads back whatever was assigned. The claim being locked is "this string never
 * reaches the attribute", not "the browser would have written it safely".
 */
describe('sanitizeDownloadFilename', () => {
  it('strips forward slashes, so a relative path cannot survive as one', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('..-..-etc-passwd');
  });

  it('strips backslashes too — the separator on the platform this app is built on', () => {
    expect(sanitizeDownloadFilename('..\\..\\Windows\\System32\\x.dll')).toBe(
      '..-..-Windows-System32-x.dll'
    );
  });

  /** CR and LF live in the C0 range. A name carrying them is how a header or a
   *  log line gets a second line injected into it downstream. */
  it('strips CR, LF, NUL and the rest of the C0 range', () => {
    expect(sanitizeDownloadFilename('tick\r\net.pdf')).toBe('tick--et.pdf');
    expect(sanitizeDownloadFilename('tick\u0000et.pdf')).toBe('tick-et.pdf');
    expect(sanitizeDownloadFilename('tick\u001bet.pdf')).toBe('tick-et.pdf');
  });

  /**
   * The other half of the claim, and the reason this is a deny list of two
   * dangerous classes rather than an allow list of safe ones: this app ships
   * Thai and Chinese documents, and an allow list would have to enumerate every
   * script a filename may legitimately be written in.
   */
  it('leaves a legitimate name completely alone', () => {
    for (const name of [
      'e-ticket-BK-42.pdf',
      'bookings report.csv',
      'bookings-2026-07-08.csv',
      'ตั๋ว.pdf',
      '电子票.pdf',
      'rapport-café.xlsx',
    ]) {
      expect(sanitizeDownloadFilename(name)).toBe(name);
    }
  });

  it('is a no-op on an empty name', () => {
    expect(sanitizeDownloadFilename('')).toBe('');
  });
});

describe('saveBlob', () => {
  it('hands the browser an object URL on a download anchor and revokes it', () => {
    const anchor = document.createElement('a');
    const realCreateElement = document.createElement.bind(document);
    const click = spyOn(anchor, 'click');
    spyOn(document, 'createElement').and.callFake((tag: string) =>
      tag === 'a' ? anchor : realCreateElement(tag)
    );
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:saved');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    saveBlob(blob, 'e-ticket-BK-42.pdf');

    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor.getAttribute('href')).toBe('blob:saved');
    expect(anchor.download).toBe('e-ticket-BK-42.pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:saved');
  });

  /** Sanitised HERE, at the one place the value reaches the browser, so a later
   *  caller cannot forget to do it. */
  it('never hands the browser an unsanitised server filename', () => {
    const anchor = document.createElement('a');
    const realCreateElement = document.createElement.bind(document);
    spyOn(anchor, 'click');
    spyOn(document, 'createElement').and.callFake((tag: string) =>
      tag === 'a' ? anchor : realCreateElement(tag)
    );
    spyOn(URL, 'createObjectURL').and.returnValue('blob:saved');
    spyOn(URL, 'revokeObjectURL');

    saveBlob(new Blob(['x']), '../../e-ticket\r\n.pdf');

    expect(anchor.download).toBe('..-..-e-ticket--.pdf');
  });
});
