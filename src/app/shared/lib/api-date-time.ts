const OFFSET_DATE_TIME_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const BANGKOK_OFFSET = '+07:00';

export function toApiOffsetDateTime(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().replace(' ', 'T');
  if (!normalized) {
    return '';
  }

  return OFFSET_DATE_TIME_PATTERN.test(normalized)
    ? normalized
    : `${normalized}${BANGKOK_OFFSET}`;
}

export function combineBangkokDateTime(date: string, time: string): string {
  return toApiOffsetDateTime(`${date}T${time}:00`);
}
