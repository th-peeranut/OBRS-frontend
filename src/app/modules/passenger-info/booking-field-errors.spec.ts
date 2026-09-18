import { describeControlId, mapBookingFieldErrors } from './booking-field-errors';

/**
 * OBRS-1955. The bean paths here are the ones `BookingReqDto` really produces — there is no
 * top-level `passengers`, the list hangs off `departureSchedule`/`arrivalSchedule`. Getting that
 * wrong would make every entry fall through to the raw-path branch and the customer would be back
 * in front of a message that names nothing.
 */
describe('mapBookingFieldErrors', () => {
  const translate = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key;

  it('maps a contact field to the booker card and its input id', () => {
    const [error] = mapBookingFieldErrors(
      { 'contact.lastName': 'must be between 2 and 50 characters' },
      translate
    );

    expect(error.controlId).toBe('booker-lastName');
    expect(error.label).toBe(
      'PASSENGER_INFO.BOOKER.SECTION_TITLE · PASSENGER_INFO.FORM.LAST_NAME'
    );
    expect(error.reason).toBe('must be between 2 and 50 characters');
  });

  it('maps an outbound passenger to that passenger row, 1-based on screen', () => {
    const [error] = mapBookingFieldErrors(
      { 'departureSchedule.passengers[1].firstName': 'too short' },
      translate
    );

    expect(error.controlId).toBe('firstName-1');
    expect(error.label).toBe(
      'PASSENGER_INFO.PASSENGER.SECTION_TITLE({"n":2}) · PASSENGER_INFO.FORM.FIRST_NAME'
    );
  });

  it('maps the return leg onto the SAME passenger card — it is the same person', () => {
    const [error] = mapBookingFieldErrors(
      { 'arrivalSchedule.passengers[0].lastName': 'too short' },
      translate
    );

    expect(error.controlId).toBe('lastName-0');
  });

  it('keeps a path it does not recognise instead of dropping it', () => {
    const [error] = mapBookingFieldErrors({ 'totalAmount': 'must not be null' }, translate);

    expect(error.label).toBe('totalAmount');
    expect(error.controlId).toBeNull();
    expect(error.reason).toBe('must not be null');
  });

  it('shows a known passenger field with no input of its own without a control to focus', () => {
    const [error] = mapBookingFieldErrors(
      { 'departureSchedule.passengers[0].seatNumber': 'must be at most 10 characters' },
      translate
    );

    expect(error.controlId).toBeNull();
    expect(error.label).toContain('seatNumber');
  });

  it('returns nothing for an empty map, so the caller can branch on emptiness', () => {
    expect(mapBookingFieldErrors({}, translate)).toEqual([]);
  });
});

/**
 * The client half of OBRS-1955 has no bean path to work from, only the input's own id — but the
 * list it fills is the same list, so it has to read the same way.
 */
describe('describeControlId', () => {
  const translate = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key;

  it('names a booker control the way a contact.* rejection is named', () => {
    expect(describeControlId('booker-lastName', translate).label).toBe(
      'PASSENGER_INFO.BOOKER.SECTION_TITLE · PASSENGER_INFO.FORM.LAST_NAME'
    );
  });

  it('names a passenger control 1-based, like the card on screen', () => {
    expect(describeControlId('firstName-1', translate).label).toBe(
      'PASSENGER_INFO.PASSENGER.SECTION_TITLE({"n":2}) · PASSENGER_INFO.FORM.FIRST_NAME'
    );
  });

  it('carries no reason — the inline message under the field is the reason', () => {
    expect(describeControlId('booker-lastName', translate).reason).toBe('');
  });

  it('keeps an id it cannot name rather than hiding the field', () => {
    const described = describeControlId('some-other-control', translate);

    expect(described.label).toBe('some-other-control');
    expect(described.controlId).toBe('some-other-control');
  });
});
