import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DriverSchedulesStore } from './driver-schedules.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('DriverSchedulesStore', () => {
  let store: DriverSchedulesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [DriverSchedulesStore, StaffApiService, AuthService],
    });
    store = TestBed.inject(DriverSchedulesStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should start with no value', () => {
    expect(store.hasValue).toBeFalse();
  });

  it('data$ should emit null initially', (done) => {
    store.data$.subscribe((val) => {
      expect(val).toBeNull();
      done();
    });
  });
});
