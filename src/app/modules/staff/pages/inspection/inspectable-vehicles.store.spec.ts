import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { InspectableVehiclesStore } from './inspectable-vehicles.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('InspectableVehiclesStore', () => {
  it('should be created and start with no value', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [InspectableVehiclesStore, StaffApiService, AuthService],
    });
    const store = TestBed.inject(InspectableVehiclesStore);

    expect(store).toBeTruthy();
    expect(store.hasValue).toBeFalse();
  });

  it('refresh() fetches via StaffApiService.getInspectableVehicles() and caches the result', async () => {
    const vehicles = [{ id: 1, label: 'Van 01 - ABC-123' }];
    const staffApiStub = {
      getInspectableVehicles: jasmine
        .createSpy('getInspectableVehicles')
        .and.returnValue(of({ code: 200, message: 'OK', data: vehicles })),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        InspectableVehiclesStore,
        { provide: StaffApiService, useValue: staffApiStub },
        AuthService,
      ],
    });
    const store = TestBed.inject(InspectableVehiclesStore);

    await store.refresh();

    expect(staffApiStub.getInspectableVehicles).toHaveBeenCalled();
    expect(store.value).toEqual(vehicles);
  });
});
