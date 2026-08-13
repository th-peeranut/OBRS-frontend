import {
  buildPreviewSegments,
  extractPlaceholderIndices,
  parseSampleArgs,
} from './notification-message-placeholder';

describe('extractPlaceholderIndices', () => {
  it('returns distinct indices, ascending, regardless of appearance order', () => {
    expect(extractPlaceholderIndices('Hi {1}, your booking {0} is confirmed. See you, {1}.')).toEqual([0, 1]);
  });

  it('returns an empty array when there are no placeholders', () => {
    expect(extractPlaceholderIndices('No placeholders here.')).toEqual([]);
  });

  it('never throws on malformed brace text — plain regex scan, not a MessageFormat parse', () => {
    expect(() => extractPlaceholderIndices('unbalanced { brace {0')).not.toThrow();
    expect(extractPlaceholderIndices('unbalanced { brace {0')).toEqual([]);
  });
});

describe('parseSampleArgs', () => {
  it('parses "{i}=value" entries into an index -> value map', () => {
    const values = parseSampleArgs(['{0}=BK-00123', '{1}=John']);
    expect(values.get(0)).toBe('BK-00123');
    expect(values.get(1)).toBe('John');
  });

  it('skips an entry that does not match the shape, rather than throwing', () => {
    const values = parseSampleArgs(['not-a-sample-arg', '{2}=OK']);
    expect(values.size).toBe(1);
    expect(values.get(2)).toBe('OK');
  });
});

describe('buildPreviewSegments', () => {
  it('substitutes each {i} with its sample value and marks it highlighted', () => {
    const segments = buildPreviewSegments('Booking {0} confirmed', ['{0}=BK-00123']);
    expect(segments).toEqual([
      { text: 'Booking ', highlighted: false },
      { text: 'BK-00123', highlighted: true },
      { text: ' confirmed', highlighted: false },
    ]);
  });

  it('falls back to the literal {i} when no sample exists for that index', () => {
    const segments = buildPreviewSegments('Hello {5}', []);
    expect(segments).toEqual([
      { text: 'Hello ', highlighted: false },
      { text: '{5}', highlighted: true },
    ]);
  });

  it('returns the whole text as one unhighlighted segment when there are no placeholders', () => {
    expect(buildPreviewSegments('Plain text', [])).toEqual([{ text: 'Plain text', highlighted: false }]);
  });
});
