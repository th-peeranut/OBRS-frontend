/**
 * OBRS-900: split `text` into segments marking which parts match `query`
 * (case-insensitive, ALL non-overlapping occurrences highlighted). Used by
 * `AdminLayoutComponent`'s sidebar menu search to show *why* a result matched
 * — until this card, a match against a menu's description (OBRS-290) never
 * showed the description at all, so a correct match read as "nothing found".
 *
 * Deliberately NOT regex-based: `query` is raw user input typed into the
 * sidebar search box. A regex built from it would either need every special
 * character escaped or risk a pathological pattern from something as
 * plausible as `a)|(b`. Plain `String#indexOf` needs no escaping, cannot
 * backtrack, and treats every character of `query` as a literal — a
 * regex-shaped query just degrades to "no match", never a crash or a hang.
 *
 * Render the returned segments as `<span>{{ seg.text }}</span>` (Angular
 * interpolation, auto-escaped) — never concatenate them into an HTML string
 * bound via `[innerHTML]`. That is what keeps an HTML-injection-shaped query
 * (e.g. `<img src=x onerror=alert(1)>`) inert: `seg.text` can only ever
 * become the content of a text node, never markup.
 */
export interface NavSearchHighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

export function buildHighlightSegments(text: string, query: string): NavSearchHighlightSegment[] {
  if (!text) {
    return [];
  }
  if (!query) {
    return [{ text, match: false }];
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: NavSearchHighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), match: false });
    }
    segments.push({ text: text.slice(matchIndex, matchIndex + query.length), match: true });
    cursor = matchIndex + query.length;
  }

  return segments;
}
