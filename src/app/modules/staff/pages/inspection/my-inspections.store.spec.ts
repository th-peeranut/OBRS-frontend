import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { MyInspectionsStore } from './my-inspections.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';

describe('MyInspectionsStore', () => {
  it('should be created and start with no value', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [MyInspectionsStore, StaffApiService, AuthService],
    });
    const store = TestBed.inject(MyInspectionsStore);

    expect(store).toBeTruthy();
    expect(store.hasValue).toBeFalse();
  });

  it('refresh() fetches via StaffApiService.getMyInspections() and caches the result', async () => {
    const inspections = [{ id: 1, inspectedAt: '2026-07-14T09:00:00+07:00' }];
    const staffApiStub = {
      getMyInspections: jasmine
        .createSpy('getMyInspections')
        .and.returnValue(of({ code: 200, message: 'OK', data: inspections })),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        MyInspectionsStore,
        { provide: StaffApiService, useValue: staffApiStub },
        AuthService,
      ],
    });
    const store = TestBed.inject(MyInspectionsStore);

    await store.refresh();

    expect(staffApiStub.getMyInspections).toHaveBeenCalled();
    expect(store.value).toEqual(inspections);
  });
});
