import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import {
  optionalGpsImeiValidator,
  optionalPositiveIntegerValidator,
  optionalYearRangeValidator,
  vehicleNumberRequiredUnlessRetiredValidator,
} from './vehicle-form-modal.validators';

describe('vehicle-form-modal.validators', () => {
  describe('optionalPositiveIntegerValidator', () => {
    it('treats null/undefined/empty-string as valid (field is optional)', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(null))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(undefined))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(''))).toBeNull();
    });

    it('accepts a positive integer', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(2982))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(1))).toBeNull();
    });

    it('rejects a non-integer with notInteger', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(1.5))).toEqual({ notInteger: true });
    });

    it('rejects zero/negative with positiveNumber', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(0))).toEqual({ positiveNumber: true });
      expect(optionalPositiveIntegerValidator(new FormControl(-5))).toEqual({ positiveNumber: true });
    });

    it('rejects a non-numeric string with positiveNumber', () => {
      expect(optionalPositiveIntegerValidator(new FormControl('abc'))).toEqual({ positiveNumber: true });
    });
  });

  describe('optionalYearRangeValidator', () => {
    const validator = optionalYearRangeValidator(1980, 2027);

    it('treats null/undefined/empty-string as valid (field is optional)', () => {
      expect(validator(new FormControl(null))).toBeNull();
      expect(validator(new FormControl(undefined))).toBeNull();
      expect(validator(new FormControl(''))).toBeNull();
    });

    it('accepts a year within [min, max] inclusive', () => {
      expect(validator(new FormControl(1980))).toBeNull();
      expect(validator(new FormControl(2027))).toBeNull();
      expect(validator(new FormControl(2019))).toBeNull();
    });

    it('rejects a non-integer with notInteger', () => {
      expect(validator(new FormControl(2019.5))).toEqual({ notInteger: true });
    });

    it('rejects an out-of-range year with yearRange', () => {
      expect(validator(new FormControl(1979))).toEqual({ yearRange: true });
      expect(validator(new FormControl(2028))).toEqual({ yearRange: true });
    });

    it('rejects a non-numeric string with yearRange', () => {
      expect(validator(new FormControl('abc'))).toEqual({ yearRange: true });
    });
  });

  // OBRS-842: mirrors the backend's VehicleReqDto#isVehicleNumberValid exactly
  // (`retired || hasNumber`). The pairing that matters is the LAST two specs:
  // `retired` + blank must pass AND `inactive` + blank must still fail — a
  // validator that simply excused every non-active status would pass the first
  // and hand the admin an unexplainable 400 on the second.
  describe('vehicleNumberRequiredUnlessRetiredValidator', () => {
    const validator = vehicleNumberRequiredUnlessRetiredValidator();

    function group(status: string, vehicleNumber: string | null): FormGroup {
      const form = new FormBuilder().group({
        vehicleNumber: [vehicleNumber, [validator]],
        status: [status],
      });
      form.get('vehicleNumber')?.updateValueAndValidity();
      return form;
    }

    function errorsFor(status: string, vehicleNumber: string | null) {
      return group(status, vehicleNumber).get('vehicleNumber')?.errors ?? null;
    }

    it('accepts a blank number when the status is retired', () => {
      expect(errorsFor('retired', '')).toBeNull();
      expect(errorsFor('retired', null)).toBeNull();
      expect(errorsFor('retired', '   ')).toBeNull();
    });

    it('accepts a real number regardless of status', () => {
      expect(errorsFor('active', '51-24')).toBeNull();
      expect(errorsFor('inactive', '51-24')).toBeNull();
      expect(errorsFor('retired', '51-24')).toBeNull();
    });

    it('rejects a blank number for inactive — still in the fleet, still holds its number', () => {
      expect(errorsFor('inactive', '')).toEqual({ requiredUnlessRetired: true });
      expect(errorsFor('inactive', '   ')).toEqual({ requiredUnlessRetired: true });
    });

    it('rejects a blank number for active/maintenance/repair', () => {
      expect(errorsFor('active', '')).toEqual({ requiredUnlessRetired: true });
      expect(errorsFor('maintenance', '')).toEqual({ requiredUnlessRetired: true });
      expect(errorsFor('repair', '')).toEqual({ requiredUnlessRetired: true });
    });

    it('matches the retired slug case-insensitively and ignores surrounding space', () => {
      expect(errorsFor('  RETIRED  ', '')).toBeNull();
    });

    // A control with no parent (or a status not yet populated) must NOT be waved
    // through: the error only blocks a save the server would reject anyway, so
    // "unknown status" has to fall on the required side.
    it('treats an unresolvable status as NOT retired', () => {
      expect(validator(new FormControl(''))).toEqual({ requiredUnlessRetired: true });
      expect(errorsFor('', '')).toEqual({ requiredUnlessRetired: true });
    });
  });

  // OBRS-835: a GSM IMEI is exactly 15 decimal digits. The column is VARCHAR(20), so
  // nothing downstream rejects a 14-digit typo - it just matches no incoming GPS batch
  // and the van is silently never on the map. Both directions asserted: a rule that only
  // proves its happy path survives being replaced with "accept anything".
  describe('optionalGpsImeiValidator (OBRS-835)', () => {
    it('treats null/undefined/blank as valid - most vehicles have no box fitted', () => {
      expect(optionalGpsImeiValidator(new FormControl(null))).toBeNull();
      expect(optionalGpsImeiValidator(new FormControl(undefined))).toBeNull();
      expect(optionalGpsImeiValidator(new FormControl(''))).toBeNull();
      expect(optionalGpsImeiValidator(new FormControl('   '))).toBeNull();
    });

    it('accepts exactly 15 digits, including one padded with spaces', () => {
      expect(optionalGpsImeiValidator(new FormControl('860470062518406'))).toBeNull();
      expect(optionalGpsImeiValidator(new FormControl(' 862608080309567 '))).toBeNull();
    });

    it('rejects 14 and 16 digits - the near misses a length-blind field would take', () => {
      expect(optionalGpsImeiValidator(new FormControl('86047006251840'))).toEqual({
        gpsImeiFormat: true,
      });
      expect(optionalGpsImeiValidator(new FormControl('8604700625184067'))).toEqual({
        gpsImeiFormat: true,
      });
    });

    it('rejects 15 characters that are not 15 DIGITS', () => {
      expect(optionalGpsImeiValidator(new FormControl('86047006251840X'))).toEqual({
        gpsImeiFormat: true,
      });
      expect(optionalGpsImeiValidator(new FormControl('860-470-0625184'))).toEqual({
        gpsImeiFormat: true,
      });
    });
  });
});
