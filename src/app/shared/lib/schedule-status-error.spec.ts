import { HttpErrorResponse } from '@angular/common/http';
import { extractScheduleStatusErrorCode, mapScheduleStatusErrorCode } from './schedule-status-error';

describe('mapScheduleStatusErrorCode()', () => {
  it('maps SCHEDULE_TRANSITION_ILLEGAL to its known i18n key', () => {
    expect(mapScheduleStatusErrorCode('SCHEDULE_TRANSITION_ILLEGAL')).toBe(
      'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_ILLEGAL'
    );
  });

  // OBRS-434: a driver who opens someone else's :scheduleId must be told WHY the
  // click failed — a GENERIC "please try again" would invite them to retry forever.
  it('maps SCHEDULE_TRANSITION_NOT_ASSIGNED_DRIVER to its own i18n key, not GENERIC', () => {
    expect(mapScheduleStatusErrorCode('SCHEDULE_TRANSITION_NOT_ASSIGNED_DRIVER')).toBe(
      'STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_NOT_ASSIGNED_DRIVER'
    );
  });

  it('falls back to the GENERIC key for an unknown/unmapped code (covers backend 400/404)', () => {
    expect(mapScheduleStatusErrorCode('SOME_UNMAPPED_CODE')).toBe('STAFF.SCHEDULE_STATUS.ERROR.GENERIC');
    expect(mapScheduleStatusErrorCode(null)).toBe('STAFF.SCHEDULE_STATUS.ERROR.GENERIC');
    expect(mapScheduleStatusErrorCode(undefined)).toBe('STAFF.SCHEDULE_STATUS.ERROR.GENERIC');
  });
});

describe('extractScheduleStatusErrorCode()', () => {
  it('extracts error.error.errorCode from an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({ status: 409, error: { errorCode: 'SCHEDULE_TRANSITION_ILLEGAL' } });
    expect(extractScheduleStatusErrorCode(error)).toBe('SCHEDULE_TRANSITION_ILLEGAL');
  });

  it('falls back to GENERIC when the error is not an HttpErrorResponse or has no errorCode', () => {
    expect(extractScheduleStatusErrorCode(new Error('network down'))).toBe('GENERIC');
    expect(extractScheduleStatusErrorCode(new HttpErrorResponse({ status: 500, error: {} }))).toBe('GENERIC');
  });
});
