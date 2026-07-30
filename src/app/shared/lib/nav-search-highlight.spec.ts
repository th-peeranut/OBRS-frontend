import { buildHighlightSegments } from './nav-search-highlight';

describe('buildHighlightSegments (OBRS-900)', () => {
  it('returns a single non-match segment when the query is empty', () => {
    expect(buildHighlightSegments('เส้นทาง', '')).toEqual([{ text: 'เส้นทาง', match: false }]);
  });

  it('returns no segments for empty text regardless of query', () => {
    expect(buildHighlightSegments('', 'anything')).toEqual([]);
  });

  it('splits a single match in the middle into before/match/after', () => {
    expect(buildHighlightSegments('จัดการข้อมูลเส้นทาง และค่าโดยสารรายช่วง', 'ค่าโดยสาร')).toEqual([
      { text: 'จัดการข้อมูลเส้นทาง และ', match: false },
      { text: 'ค่าโดยสาร', match: true },
      { text: 'รายช่วง', match: false },
    ]);
  });

  it('highlights a match at the very start of the text (no leading non-match segment)', () => {
    expect(buildHighlightSegments('Promotions', 'Prom')).toEqual([
      { text: 'Prom', match: true },
      { text: 'otions', match: false },
    ]);
  });

  it('highlights a match at the very end of the text (no trailing non-match segment)', () => {
    expect(buildHighlightSegments('Promotions', 'tions')).toEqual([
      { text: 'Promo', match: false },
      { text: 'tions', match: true },
    ]);
  });

  it('is case-insensitive but preserves the ORIGINAL casing in the returned text', () => {
    expect(buildHighlightSegments('Promotions', 'PROMO')).toEqual([
      { text: 'Promo', match: true },
      { text: 'tions', match: false },
    ]);
  });

  it('highlights ALL non-overlapping occurrences, not just the first', () => {
    expect(buildHighlightSegments('ababab', 'ab')).toEqual([
      { text: 'ab', match: true },
      { text: 'ab', match: true },
      { text: 'ab', match: true },
    ]);
  });

  it('returns a single non-match segment covering the whole text when nothing matches', () => {
    expect(buildHighlightSegments('Promotions', 'zzz-no-such-menu-zzz')).toEqual([
      { text: 'Promotions', match: false },
    ]);
  });

  // AC 3 (XSS-safety pin): a regex-metacharacter-shaped query must not be
  // compiled as a regex — indexOf treats it as a literal string, so this
  // degrades to "no match" instead of throwing, hanging, or matching
  // something the literal characters don't actually contain.
  it('treats a regex-alternation-shaped query as a LITERAL string, not a compiled pattern', () => {
    const text = 'ข้อมูลเส้นทาง'; // contains neither literal "a)|(b" nor a lone "a" or "b" run matching it
    expect(buildHighlightSegments(text, 'a)|(b')).toEqual([{ text, match: false }]);
  });

  it('matches a regex-alternation-shaped query literally when the text actually contains it', () => {
    expect(buildHighlightSegments('prefix a)|(b suffix', 'a)|(b')).toEqual([
      { text: 'prefix ', match: false },
      { text: 'a)|(b', match: true },
      { text: ' suffix', match: false },
    ]);
  });

  // AC 3: an HTML/script-shaped query is just literal characters here — no
  // parsing, no escaping needed, because the caller renders segments via
  // text interpolation (never innerHTML). This pins that the SEGMENTATION
  // itself doesn't choke on angle brackets/quotes.
  it('treats an HTML-injection-shaped query as a literal string', () => {
    const text = 'Vehicle Management';
    expect(buildHighlightSegments(text, '<img src=x onerror=alert(1)>')).toEqual([
      { text, match: false },
    ]);
  });
});
