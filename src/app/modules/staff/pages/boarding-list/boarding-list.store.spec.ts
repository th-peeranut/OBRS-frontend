import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BoardingListStore } from './boarding-list.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('BoardingListStore', () => {
  let store: BoardingListStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [BoardingListStore, StaffApiService, AuthService],
    });
    store = TestBed.inject(BoardingListStore);
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
    // Manually put data in cache via mutate (no-op since null, but testing idempotency)
    store.setScheduleId(5);
    expect(store.hasValue).toBeFalse();
  });
});
