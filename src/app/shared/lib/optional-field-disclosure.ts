/**
 * OBRS-1953: an optional booking-form field that lives behind a `+ เพิ่ม…` disclosure
 * link, shared by the booker form and each passenger row so the two cannot drift.
 *
 * The state is deliberately TRI-state. `undefined` means the traveler has not touched
 * the link yet, and the section then derives its state from the control's own value:
 * a value restored into the form (Back from /payment re-seeds the passenger-info store)
 * opens its own section instead of hiding a filled field behind a link nobody would
 * think to click. Once the traveler has clicked, that choice wins — which is what lets
 * a FILLED field be collapsed again without its value being touched. Deriving on every
 * read instead (value ⇒ open) would make collapsing a filled field impossible.
 */
export type OptionalFieldDisclosure = boolean | undefined;

/** Whether the optional field behind a disclosure link is currently on screen. */
export function isOptionalFieldShown(
  choice: OptionalFieldDisclosure,
  value: unknown
): boolean {
  return choice ?? hasDisclosableValue(value);
}

/**
 * A control emptied by `reset()` holds `null`, not `''` — both count as "nothing
 * filled in", and so does a value that is only whitespace.
 */
function hasDisclosableValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}
