/**
 * The three things every "backend returns bytes, frontend saves them" caller
 * needs. Extracted verbatim from `ExportService` (OBRS-642), which was the only
 * such caller until OBRS-1802 added the e-ticket PDF — two copies of a
 * `Content-Disposition` parser is how one of them quietly stops handling the
 * RFC 5987 form.
 *
 * Deliberately plain functions, not a service: none of this touches HTTP or any
 * injectable, and a service would only add a constructor argument to every
 * caller.
 */

/** Parses `filename="..."` or the RFC 5987 `filename*=UTF-8''...` form from a
 *  Content-Disposition header. Returns null if neither is present. */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const encodedMatch = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1].trim());
    } catch {
      return encodedMatch[1].trim();
    }
  }

  const plainMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plainMatch ? plainMatch[1].trim() : null;
}

/**
 * Path separators and control characters, stripped from any filename that came
 * off the wire (OBRS-1802 security review, L1).
 *
 * <p>The names these functions save are SERVER-supplied - they arrive in
 * `Content-Disposition` - and what kept that safe was a sanitiser at the other
 * end of the wire (`ETicketPdfService.java`'s
 * `replaceAll("[^A-Za-z0-9_-]", "-")`). That is a real protection, but it is an
 * invariant of a different repository that nothing on this side states, so this
 * side states it: separators close traversal, and the C0 range (which includes
 * CR and LF) closes header/line injection into the saved name.
 *
 * <p>Deliberately a DENY list of the two dangerous classes, not an allow list:
 * an allow list would have to know every script a filename may legitimately be
 * written in, and this app ships Thai and Chinese documents. Spaces, dots,
 * accents and CJK all survive untouched.
 */
const UNSAFE_FILENAME_CHARS = /[\\/\x00-\x1f]/g;

/**
 * blob -> object URL -> hidden `<a download>` -> revoke.
 *
 * <p>`filename` is sanitised here rather than at each call site: this is the one
 * place the value reaches the browser, so a later caller cannot forget.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeDownloadFilename(filename);
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Exported for its own spec - `anchor.download` cannot be read back through a
 *  meaningful assertion about what a real browser would then write to disk. */
export function sanitizeDownloadFilename(filename: string): string {
  return filename.replace(UNSAFE_FILENAME_CHARS, '-');
}

/**
 * Reads a stable UPPER_SNAKE `errorCode` out of an error body that arrived as
 * TEXT because the request set `responseType: 'blob'` (which applies to error
 * responses too, so the global `errorInterceptor` cannot read it).
 *
 * Returns `fallback` for anything that is not a JSON object carrying a
 * non-empty string `errorCode`. Never returns the server's localized `message`
 * — callers map the CODE to their own i18n (design-system.md §9).
 */
export function parseBlobErrorCode(text: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const errorCode = (parsed as { errorCode?: unknown })?.errorCode;
    return typeof errorCode === 'string' && errorCode.length > 0 ? errorCode : fallback;
  } catch {
    return fallback;
  }
}
