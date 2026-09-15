import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { of } from 'rxjs';
import {
  AdminApiService,
  MaintenanceWindowConfigDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { MaintenanceWindowConfigPageComponent } from './maintenance-window-config-page.component';

/**
 * OBRS-1902 — the back-office form the owner schedules a deploy from.
 *
 * The "nothing scheduled" arm is asserted first and deliberately: it is the state this page is in
 * on every ordinary day, and it is the one an `AdminCollectionStore` would have turned into an
 * error (see the component's own note on why it does not use one).
 */
describe('MaintenanceWindowConfigPageComponent', () => {
  const scheduled: MaintenanceWindowConfigDto = {
    startAt: '2026-09-15T17:00:00.000Z',
    endAt: '2026-09-15T17:30:00.000Z',
    paymentLockMinutesBefore: 10,
    messageTh: 'ปิดปรับปรุงระบบชั่วคราว',
    messageEn: 'Scheduled maintenance',
    paymentLockedFrom: '2026-09-15T16:50:00.000Z',
  };

  let fixture: ComponentFixture<MaintenanceWindowConfigPageComponent>;
  let adminApi: jasmine.SpyObj<AdminApiService>;
  let alertService: jasmine.SpyObj<AlertService>;

  async function mount(current: MaintenanceWindowConfigDto | null): Promise<void> {
    TestBed.resetTestingModule();
    adminApi = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'getMaintenanceWindow',
      'updateMaintenanceWindow',
      'cancelMaintenanceWindow',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'confirm',
    ]);
    adminApi.getMaintenanceWindow.and.returnValue(
      of({ code: 200, message: 'OK', data: current })
    );

    await TestBed.configureTestingModule({
      declarations: [MaintenanceWindowConfigPageComponent],
      // The real p-datePicker, not a stub: it IS the control value accessor for the two
      // instants, and NO_ERRORS_SCHEMA alone leaves those form controls unbound (NG01203).
      imports: [ReactiveFormsModule, TranslateModule.forRoot(), DatePickerModule],
      providers: [
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alertService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MaintenanceWindowConfigPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function cancelButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.admin-btn-danger');
  }

  it('offers nothing to call off when nothing is scheduled', async () => {
    await mount(null);

    expect(cancelButton()).toBeNull();
  });

  it('fills the form from the scheduled window and offers to call it off', async () => {
    await mount(scheduled);

    expect(fixture.componentInstance['form'].value.messageTh).toBe(scheduled.messageTh);
    expect(fixture.componentInstance['form'].value.paymentLockMinutesBefore).toBe(10);
    expect(cancelButton()).not.toBeNull();
  });

  it('sends the two instants as ISO-8601, which is what the backend stores', async () => {
    await mount(scheduled);
    adminApi.updateMaintenanceWindow.and.returnValue(
      of({ code: 200, message: 'OK', data: scheduled })
    );

    await fixture.componentInstance['save']();

    const payload = adminApi.updateMaintenanceWindow.calls.mostRecent().args[0];
    expect(payload.startAt).toBe(scheduled.startAt);
    expect(payload.endAt).toBe(scheduled.endAt);
    expect(payload.paymentLockMinutesBefore).toBe(10);
    expect(alertService.success).toHaveBeenCalled();
  });

  it('refuses to save a window that ends before it starts, without calling the API', async () => {
    await mount(scheduled);
    fixture.componentInstance['form'].patchValue({
      startAt: new Date('2026-09-15T17:30:00.000Z'),
      endAt: new Date('2026-09-15T17:00:00.000Z'),
    });

    await fixture.componentInstance['save']();

    expect(adminApi.updateMaintenanceWindow).not.toHaveBeenCalled();
  });

  it('asks before calling an announcement off, and does nothing if the answer is no', async () => {
    await mount(scheduled);
    alertService.confirm.and.resolveTo(false);

    await fixture.componentInstance['cancelAnnouncement']();

    expect(alertService.confirm).toHaveBeenCalled();
    expect(adminApi.cancelMaintenanceWindow).not.toHaveBeenCalled();
  });

  it('clears the announcement once the owner confirms', async () => {
    await mount(scheduled);
    alertService.confirm.and.resolveTo(true);
    adminApi.cancelMaintenanceWindow.and.returnValue(of({ code: 200, message: 'OK', data: null }));

    await fixture.componentInstance['cancelAnnouncement']();
    fixture.detectChanges();

    expect(adminApi.cancelMaintenanceWindow).toHaveBeenCalled();
    expect(cancelButton()).toBeNull();
  });
});
