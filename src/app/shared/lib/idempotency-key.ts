function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function generateIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return [
    randomHex(4),
    randomHex(2),
    randomHex(2),
    randomHex(2),
    randomHex(6),
  ].join('-');
}
