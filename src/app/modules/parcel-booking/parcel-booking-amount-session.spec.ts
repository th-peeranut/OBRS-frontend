import { readParcelBookingAmount, stashParcelBookingAmount } from './parcel-booking-amount-session';

describe('parcel-booking-amount-session', () => {
  afterEach(() => sessionStorage.clear());

  it('round-trips a stashed amount by tracking number', () => {
    stashParcelBookingAmount('PCL1', 120.5);
    expect(readParcelBookingAmount('PCL1')).toBe(120.5);
  });

  it('returns null for a tracking number that was never stashed', () => {
    expect(readParcelBookingAmount('UNKNOWN')).toBeNull();
  });

  it('keys are isolated per tracking number', () => {
    stashParcelBookingAmount('PCL1', 100);
    stashParcelBookingAmount('PCL2', 200);
    expect(readParcelBookingAmount('PCL1')).toBe(100);
    expect(readParcelBookingAmount('PCL2')).toBe(200);
  });
});
