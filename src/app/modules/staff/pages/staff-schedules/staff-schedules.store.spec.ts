import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { StaffSchedulesStore } from './staff-schedules.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('StaffSchedulesStore', () => {
  let store: StaffSchedulesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [StaffSchedulesStore, AdminApiService, AuthService],
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
});
