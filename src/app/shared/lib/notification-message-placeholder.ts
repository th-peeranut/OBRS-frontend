/**
 * OBRS-1308 — client-side `{n}` placeholder helpers for the owner edit
 * screen: the live hint chip row and the substituted preview. **Display
 * only** — the backend's `MessageFormat` compile + set-equality validator is
 * the tested authority (system spec, Business rule 3); nothing here accepts
 * or rejects a save.
 */

/** Every DISTINCT `{n}` index found in `text`, ascending. Plain regex scan —
 * not a `MessageFormat` parse, so it never throws on malformed input. */
export function extractPlaceholderIndices(text: string): number[] {
  const indices = new Set<number>();
  for (const match of text.matchAll(/\{(\d+)\}/g)) {
    indices.add(Number(match[1]));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/** `sampleArgs` arrives as `"{0}=BK-00123"` entries (system spec's
 * `OverridableMessageKeyDto.sampleArgs` shape) — this parses them into an
 * index → sample-value lookup. An entry that doesn't match the shape is
 * skipped rather than throwing, since this only ever feeds a preview. */
export function parseSampleArgs(sampleArgs: readonly string[]): Map<number, string> {
  const values = new Map<number, string>();
  for (const entry of sampleArgs) {
    const match = /^\{(\d+)\}=(.*)$/.exec(entry);
    if (match) {
      values.set(Number(match[1]), match[2]);
    }
  }
  return values;
}

export interface PreviewSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits `text` into literal segments and highlighted "substituted sample
 * value" segments, one per `{n}` occurrence — `{0}` becomes the sample value
 * for index 0 (or the literal `{0}` back, if no sample exists for that
 * index), and the template renders `highlighted` segments styled.
 */
export function buildPreviewSegments(
  text: string,
  sampleArgs: readonly string[]
): PreviewSegment[] {
  const values = parseSampleArgs(sampleArgs);
  const segments: PreviewSegment[] = [];
  const regex = /\{(\d+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
    }
    const value = values.get(Number(match[1])) ?? match[0];
    segments.push({ text: value, highlighted: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments;
}
