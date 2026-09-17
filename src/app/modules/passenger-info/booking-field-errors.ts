/**
 * Turns the backend's `errors[]` bean paths into something a customer can act on (OBRS-1955).
 *
 * `ApiErrorRespDto.errors[]` has always named the field that was refused — `apiFieldErrors()`
 * (OBRS-1255) already extracts it — but the booking funnel threw the whole array away and showed
 * only the generic `error.validation.failed` message, so a rejected booking reached the customer
 * as "ข้อมูลไม่ผ่านการตรวจสอบ" with nothing on screen pointing at the field.
 *
 * The paths this maps are the ones `BookingReqDto` really produces. Measured on origin/dev
 * 2026-09-17: there is no top-level `passengers` — the list hangs off
 * `departureSchedule`/`arrivalSchedule` (`BookingScheduleReqDto`), so the paths are
 *
 *     contact.lastName
 *     departureSchedule.passengers[0].lastName
 *     arrivalSchedule.passengers[0].lastName
 *
 * Both legs map back to the SAME passenger card on screen: the return leg is not a second form,
 * it is the same person travelling back.
 *
 * Anything this cannot recognise keeps its raw path as the label rather than being dropped — a
 * rule the frontend has never heard of is exactly the case this exists for, and a silently
 * discarded entry would put the customer back in front of the bare modal.
 */

/** One backend rejection, ready to show and to scroll to. */
export interface BookingFieldError {
  /** The bean path as the backend sent it, e.g. `departureSchedule.passengers[0].lastName`. */
  path: string;
  /** What to call the field on screen, already translated. */
  label: string;
  /**
   * The backend's own reason text, localized by the server. Empty for a rejection the CLIENT
   * made: the inline message under the field already says what is wrong, and the customer is
   * scrolled to it, so repeating it here would be two copies of one sentence to keep in step.
   */
  reason: string;
  /** The `id` of the input to focus, or null when the path names no control this page renders. */
  controlId: string | null;
}

/** Form control name -> the label key both forms already use for it. */
const FIELD_LABEL_KEYS: Record<string, string> = {
  title: 'PASSENGER_INFO.FORM.TITLE',
  firstName: 'PASSENGER_INFO.FORM.FIRST_NAME',
  middleName: 'PASSENGER_INFO.FORM.MIDDLE_NAME_OPTIONAL',
  lastName: 'PASSENGER_INFO.FORM.LAST_NAME',
  phoneNumber: 'PASSENGER_INFO.FORM.PHONE_NUMBER',
  email: 'PASSENGER_INFO.FORM.EMAIL',
};

const PASSENGER_PATH = /^(?:departure|arrival)Schedule\.passengers\[(\d+)\]\.(.+)$/;
const CONTACT_PATH = /^contact\.(.+)$/;

/**
 * @param byPath    `apiFieldErrors(error)` — field path -> the backend's reason.
 * @param translate `TranslateService.instant`, or an equivalent.
 */
export function mapBookingFieldErrors(
  byPath: Record<string, string>,
  translate: (key: string, params?: Record<string, unknown>) => string
): BookingFieldError[] {
  return Object.entries(byPath).map(([path, reason]) => {
    const passenger = PASSENGER_PATH.exec(path);
    if (passenger) {
      const index = Number(passenger[1]);
      return {
        path,
        label: sectionLabel(
          translate('PASSENGER_INFO.PASSENGER.SECTION_TITLE', { n: index + 1 }),
          passenger[2],
          translate
        ),
        reason,
        // Both forms give every control an id; the passenger form suffixes it with the row index.
        controlId: FIELD_LABEL_KEYS[passenger[2]] ? `${passenger[2]}-${index}` : null,
      };
    }

    const contact = CONTACT_PATH.exec(path);
    if (contact) {
      return {
        path,
        label: sectionLabel(
          translate('PASSENGER_INFO.BOOKER.SECTION_TITLE'),
          contact[1],
          translate
        ),
        reason,
        controlId: FIELD_LABEL_KEYS[contact[1]] ? `booker-${contact[1]}` : null,
      };
    }

    return { path, label: path, reason, controlId: null };
  });
}

/**
 * The same label, for a control the CLIENT refused — there is no bean path then, only the input's
 * own `id`. Reverses the two id shapes both forms use (`booker-<field>` and `<field>-<index>`) so
 * the list above the forms reads identically whoever did the refusing.
 *
 * Returns the id unchanged when it is not one of those shapes: a field with no label is still a
 * field the customer has to find.
 */
export function describeControlId(
  controlId: string,
  translate: (key: string, params?: Record<string, unknown>) => string
): BookingFieldError {
  const booker = /^booker-(.+)$/.exec(controlId);
  if (booker && FIELD_LABEL_KEYS[booker[1]]) {
    return {
      path: controlId,
      label: sectionLabel(translate('PASSENGER_INFO.BOOKER.SECTION_TITLE'), booker[1], translate),
      reason: '',
      controlId,
    };
  }

  const passenger = /^(.+)-(\d+)$/.exec(controlId);
  if (passenger && FIELD_LABEL_KEYS[passenger[1]]) {
    return {
      path: controlId,
      label: sectionLabel(
        translate('PASSENGER_INFO.PASSENGER.SECTION_TITLE', { n: Number(passenger[2]) + 1 }),
        passenger[1],
        translate
      ),
      reason: '',
      controlId,
    };
  }

  return { path: controlId, label: controlId, reason: '', controlId };
}

function sectionLabel(
  section: string,
  field: string,
  translate: (key: string, params?: Record<string, unknown>) => string
): string {
  const key = FIELD_LABEL_KEYS[field];
  return `${section} · ${key ? translate(key) : field}`;
}
