import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ParcelDeliveryListStore } from './parcel-delivery-list.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('ParcelDeliveryListStore', () => {
  let store: ParcelDeliveryListStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [ParcelDeliveryListStore, StaffApiService, AuthService],
    });
    store = TestBed.inject(ParcelDeliveryListStore);
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

  it('is a fresh instance per TestBed.inject (not providedIn: root)', () => {
    store.setScheduleId(99);
    const other = new ParcelDeliveryListStore(
      TestBed.inject(StaffApiService),
      TestBed.inject(AuthService)
    );
    expect(other.hasValue).toBeFalse();
    expect(other).not.toBe(store);
  });
});
