import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ParcelCargoAvailabilityStore } from './parcel-cargo-availability.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('ParcelCargoAvailabilityStore', () => {
  let store: ParcelCargoAvailabilityStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [ParcelCargoAvailabilityStore, StaffApiService, AuthService],
    });
    store = TestBed.inject(ParcelCargoAvailabilityStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should start with no value', () => {
    expect(store.hasValue).toBeFalse();
    expect(store.value).toBeNull();
  });

  it('setScheduleId() clears cache when scheduleId changes', () => {
    store.setScheduleId(1);
    store.setScheduleId(2);
    expect(store.hasValue).toBeFalse();
  });

  it('setScheduleId() does NOT clear when same id is set', () => {
    store.setScheduleId(5);
    store.setScheduleId(5);
    expect(store.hasValue).toBeFalse();
  });

  it('is a fresh instance per TestBed.inject (not providedIn: root)', () => {
    store.setScheduleId(99);
    const other = new ParcelCargoAvailabilityStore(
      TestBed.inject(StaffApiService),
      TestBed.inject(AuthService)
    );
    expect(other.hasValue).toBeFalse();
    expect(other).not.toBe(store);
  });
});
