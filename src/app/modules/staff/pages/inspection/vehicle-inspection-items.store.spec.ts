import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { VehicleInspectionItemsStore } from './vehicle-inspection-items.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('VehicleInspectionItemsStore', () => {
  it('should be created and start with no value', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [VehicleInspectionItemsStore, StaffApiService, AuthService],
    });
    const store = TestBed.inject(VehicleInspectionItemsStore);

    expect(store).toBeTruthy();
    expect(store.hasValue).toBeFalse();
  });

  it('refresh() fetches via StaffApiService.getInspectionItems() and caches the result', async () => {
    const items = [{ id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true }];
    const staffApiStub = {
      getInspectionItems: jasmine
        .createSpy('getInspectionItems')
        .and.returnValue(of({ code: 200, message: 'OK', data: items })),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        VehicleInspectionItemsStore,
        { provide: StaffApiService, useValue: staffApiStub },
        AuthService,
      ],
    });
    const store = TestBed.inject(VehicleInspectionItemsStore);

    await store.refresh();

    expect(staffApiStub.getInspectionItems).toHaveBeenCalled();
    expect(store.value).toEqual(items);
  });

  it('falls back to [] when the response carries no data', async () => {
    const staffApiStub = {
      getInspectionItems: jasmine
        .createSpy('getInspectionItems')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        VehicleInspectionItemsStore,
        { provide: StaffApiService, useValue: staffApiStub },
        AuthService,
      ],
    });
    const store = TestBed.inject(VehicleInspectionItemsStore);

    await store.refresh();

    expect(store.value).toEqual([]);
  });
});
