import { HttpErrorResponse } from '@angular/common/http';
import { extractInspectionItemErrorCode, mapInspectionItemErrorCode } from './inspection-item-error';

describe('mapInspectionItemErrorCode()', () => {
  it('maps each of the 7 known codes to its own i18n key', () => {
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_LOCALES_INVALID')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.LOCALES_INVALID'
    );
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_CODE_TAKEN')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.CODE_TAKEN'
    );
    expect(mapInspectionItemErrorCode('VEHICLE_INSPECTION_ITEM_ERROR_ID_NOT_FOUND')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.ID_NOT_FOUND'
    );
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_REORDER_MISSING_IDS')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_MISSING_IDS'
    );
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_REORDER_UNKNOWN_ID')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_UNKNOWN_ID'
    );
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_REORDER_DUPLICATE_ID')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_DUPLICATE_ID'
    );
    expect(mapInspectionItemErrorCode('INSPECTION_ITEM_REORDER_INVALID_SEQUENCE')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.REORDER_INVALID_SEQUENCE'
    );
  });

  // SPEC §3.5/§9.2: a constraint backstop, unreachable through the API if the
  // 400 guards are correct — deliberately bucketed as generic, not given a
  // dedicated key that would imply a real distinguishing case.
  it('maps DATA_INTEGRITY_VIOLATION (the 409 constraint backstop) to GENERIC, not a dedicated key', () => {
    expect(mapInspectionItemErrorCode('DATA_INTEGRITY_VIOLATION')).toBe(
      'ADMIN.INSPECTION_ITEMS.ERROR.GENERIC'
    );
  });

  it('falls back to GENERIC for an unknown/unmapped/absent code', () => {
    expect(mapInspectionItemErrorCode('SOME_UNMAPPED_CODE')).toBe('ADMIN.INSPECTION_ITEMS.ERROR.GENERIC');
    expect(mapInspectionItemErrorCode(null)).toBe('ADMIN.INSPECTION_ITEMS.ERROR.GENERIC');
    expect(mapInspectionItemErrorCode(undefined)).toBe('ADMIN.INSPECTION_ITEMS.ERROR.GENERIC');
  });
});

describe('extractInspectionItemErrorCode()', () => {
  it('extracts error.error.errorCode from an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'INSPECTION_ITEM_CODE_TAKEN' },
    });
    expect(extractInspectionItemErrorCode(error)).toBe('INSPECTION_ITEM_CODE_TAKEN');
  });

  it('falls back to GENERIC when the error is not an HttpErrorResponse or has no errorCode', () => {
    expect(extractInspectionItemErrorCode(new Error('network down'))).toBe('GENERIC');
    expect(extractInspectionItemErrorCode(new HttpErrorResponse({ status: 500, error: {} }))).toBe(
      'GENERIC'
    );
  });
});
