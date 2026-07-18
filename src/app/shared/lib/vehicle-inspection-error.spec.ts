import { HttpErrorResponse } from '@angular/common/http';
import {
  extractVehicleInspectionErrorCode,
  mapVehicleInspectionErrorCode,
} from './vehicle-inspection-error';

function httpError(errorCode?: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({
    error: errorCode ? { errorCode } : {},
    status,
  });
}

describe('vehicle-inspection-error', () => {
  describe('extractVehicleInspectionErrorCode', () => {
    it('reads error.error.errorCode off an HttpErrorResponse', () => {
      expect(extractVehicleInspectionErrorCode(httpError('ODOMETER_BELOW_LAST_RECORDED'))).toBe(
        'ODOMETER_BELOW_LAST_RECORDED'
      );
    });

    it('returns null when there is no recognizable errorCode', () => {
      expect(extractVehicleInspectionErrorCode(httpError())).toBeNull();
      expect(extractVehicleInspectionErrorCode(new Error('network down'))).toBeNull();
      expect(extractVehicleInspectionErrorCode(null)).toBeNull();
    });
  });

  describe('mapVehicleInspectionErrorCode', () => {
    it('maps every documented known code to its i18n key', () => {
      expect(mapVehicleInspectionErrorCode('INSPECTION_ITEMS_INCOMPLETE')).toBe(
        'STAFF.INSPECTION.ERROR.ITEMS_INCOMPLETE'
      );
      expect(mapVehicleInspectionErrorCode('INSPECTION_NOTE_REQUIRED')).toBe(
        'STAFF.INSPECTION.ERROR.NOTE_REQUIRED'
      );
      expect(mapVehicleInspectionErrorCode('INSPECTION_ITEM_INACTIVE')).toBe(
        'STAFF.INSPECTION.ERROR.ITEM_INACTIVE'
      );
      expect(mapVehicleInspectionErrorCode('ODOMETER_BELOW_LAST_RECORDED')).toBe(
        'STAFF.INSPECTION.ERROR.ODOMETER_BELOW_LAST_RECORDED'
      );
    });

    it('falls back to ACTION_UNAVAILABLE by default for an unrecognized code', () => {
      expect(mapVehicleInspectionErrorCode('SOMETHING_NEW')).toBe(
        'STAFF.INSPECTION.ERROR.ACTION_UNAVAILABLE'
      );
      expect(mapVehicleInspectionErrorCode(null)).toBe('STAFF.INSPECTION.ERROR.ACTION_UNAVAILABLE');
    });

    it('falls back to SERVICE_UNAVAILABLE when the tier says so', () => {
      expect(mapVehicleInspectionErrorCode(null, 'SERVICE_UNAVAILABLE')).toBe(
        'STAFF.INSPECTION.ERROR.SERVICE_UNAVAILABLE'
      );
    });
  });
});
