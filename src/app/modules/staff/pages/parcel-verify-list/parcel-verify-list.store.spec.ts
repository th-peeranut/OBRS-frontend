import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ParcelVerifyListStore } from './parcel-verify-list.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

function makeRow(overrides: Partial<ParcelDeliveryListItemDto> = {}): ParcelDeliveryListItemDto {
  return {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    senderName: 'Somchai',
    senderPhone: '0812345678',
    recipientName: 'Somsri',
    recipientPhone: '0898765432',
    pickupStop: { name: 'Bangkok' },
    dropoffStop: { name: 'Chiang Mai' },
    weightKg: 5,
    deliveryStatus: 'created',
    bookingStatus: 'confirmed',
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    ...overrides,
  };
}

describe('ParcelVerifyListStore', () => {
  let store: ParcelVerifyListStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [ParcelVerifyListStore, StaffApiService, AuthService],
    });
    store = TestBed.inject(ParcelVerifyListStore);
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
    const other = new ParcelVerifyListStore(
      TestBed.inject(StaffApiService),
      TestBed.inject(AuthService)
    );
    expect(other.hasValue).toBeFalse();
    expect(other).not.toBe(store);
  });

  it('filters the shared consigned-parcels response to only deliveryStatus === "created"', async () => {
    const staffApi = TestBed.inject(StaffApiService);
    spyOn(staffApi, 'getConsignedParcelsForSchedule').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: [
          makeRow({ parcelId: 1, deliveryStatus: 'created' }),
          makeRow({ parcelId: 2, deliveryStatus: 'accepted' }),
          makeRow({ parcelId: 3, deliveryStatus: 'rejected' }),
          makeRow({ parcelId: 4, deliveryStatus: 'created' }),
        ],
      })
    );

    store.setScheduleId(42);
    await store.refresh();

    expect(staffApi.getConsignedParcelsForSchedule).toHaveBeenCalledWith(42);
    expect(store.value?.map((r) => r.parcelId)).toEqual([1, 4]);
  });

  it('returns an empty array when no scheduleId has been set yet', async () => {
    const staffApi = TestBed.inject(StaffApiService);
    const spy = spyOn(staffApi, 'getConsignedParcelsForSchedule').and.returnValue(
      of({ code: 200, message: 'OK', data: [makeRow()] })
    );

    await store.refresh();

    expect(spy).not.toHaveBeenCalled();
    expect(store.value).toEqual([]);
  });
});
