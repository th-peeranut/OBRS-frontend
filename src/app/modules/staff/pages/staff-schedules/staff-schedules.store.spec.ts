import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { StaffSchedulesStore } from './staff-schedules.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('StaffSchedulesStore', () => {
  let store: StaffSchedulesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [StaffSchedulesStore, AdminApiService, StaffApiService, AuthService],
    });
    store = TestBed.inject(StaffSchedulesStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should start with no value', () => {
    expect(store.hasValue).toBeFalse();
    expect(store.value).toBeNull();
  });

  it('refreshing$ should emit false initially', (done) => {
    store.refreshing$.subscribe((refreshing) => {
      expect(refreshing).toBeFalse();
      done();
    });
  });

  it('loads drivers from the SALESPERSON-scoped endpoint, never the OWNER-only users list (OBRS-175)', async () => {
    const adminApi = TestBed.inject(AdminApiService);
    const staffApi = TestBed.inject(StaffApiService);
    const ok = (data: unknown) => of({ code: 200, message: 'OK', data } as any);
    spyOn(adminApi, 'getSchedules').and.returnValue(ok([]));
    spyOn(adminApi, 'getRoutes').and.returnValue(ok([]));
    spyOn(adminApi, 'getVehicles').and.returnValue(ok([]));
    spyOn(adminApi, 'getVehicleTypes').and.returnValue(ok([]));
    spyOn(adminApi, 'getLookups').and.returnValue(ok([]));
    const getUsersSpy = spyOn(adminApi, 'getUsers').and.returnValue(ok([]));
    const getDriversSpy = spyOn(staffApi, 'getDrivers').and.returnValue(
      ok([{ id: 4, name: 'Mr. Driver Wheeler' }])
    );

    await store.refresh();

    // The whole reason for OBRS-175: getUsers 403s for salespersons and sinks the
    // Promise.all, so the store must use the scoped drivers endpoint instead.
    expect(getDriversSpy).toHaveBeenCalledTimes(1);
    expect(getUsersSpy).not.toHaveBeenCalled();
    expect(store.value?.drivers).toEqual([{ id: 4, name: 'Mr. Driver Wheeler' }]);
  });
});
