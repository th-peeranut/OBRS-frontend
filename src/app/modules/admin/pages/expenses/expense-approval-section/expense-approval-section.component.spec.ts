import { BehaviorSubject, of, throwError } from 'rxjs';
import { ExpenseApprovalSectionComponent } from './expense-approval-section.component';
import { AdminExpenseDto } from '../../../../../services/admin/admin-api.service';

function pendingDto(id: number, vehicleId: number | null): AdminExpenseDto {
  return {
    id,
    ownerId: 1,
    vehicleId,
    category: 'FUEL',
    categoryOtherLabel: null,
    amount: '300.00',
    vatAmount: null,
    expenseDate: '2026-09-14',
    receiptNo: null,
    paidBy: null,
    payeeId: null,
    payeeName: null,
    note: null,
    source: 'FIELD',
    status: 'PENDING',
  } as unknown as AdminExpenseDto;
}

function createAdminApiStub(): any {
  return {
    getPendingExpenses: jasmine
      .createSpy('getPendingExpenses')
      .and.returnValue(of({ code: 200, message: 'OK', data: [pendingDto(7, 3)] })),
    approveExpense: jasmine
      .createSpy('approveExpense')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    rejectExpense: jasmine
      .createSpy('rejectExpense')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
}

function createVehiclesStoreStub(): any {
  return {
    data$: new BehaviorSubject<any>({
      vehicles: [{ id: 3, vehicleNumber: '12', numberPlate: '1กข 1234' }],
      vehicleTypes: [],
      lookups: [],
    }),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
  };
}

describe('ExpenseApprovalSectionComponent', () => {
  let adminApi: any;
  let alertService: any;
  let vehiclesStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;

  beforeEach(() => {
    adminApi = createAdminApiStub();
    alertService = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    vehiclesStore = createVehiclesStoreStub();
    component = new ExpenseApprovalSectionComponent(adminApi, alertService, {
      instant: (key: string) => key,
      currentLang: 'th',
      onLangChange: of(),
    } as any, vehiclesStore);
  });

  afterEach(() => component.ngOnDestroy());

  it('loads the pending queue on init and labels the vehicle from the shared store', async () => {
    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(adminApi.getPendingExpenses).toHaveBeenCalled();
    expect(component['pendingExpenses'].length).toBe(1);
    expect(component['pendingExpenses'][0].vehicleLabel).toBe('1กข 1234');
  });

  /** The reason this section is allowed to fail quietly: the settlements page
   * around it is fully usable without the queue, and the lane renders nothing
   * when it has no rows. */
  it('leaves the queue empty and raises nothing when the fetch fails', async () => {
    adminApi.getPendingExpenses.and.returnValue(throwError(() => new Error('boom')));

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component['pendingExpenses']).toEqual([]);
    expect(alertService.error).not.toHaveBeenCalled();
  });

  it('re-reads the queue after a verdict so a ruled row leaves the lane', async () => {
    component.ngOnInit();
    await Promise.resolve();
    adminApi.getPendingExpenses.calls.reset();

    await component['onApproveExpense'](7);

    expect(adminApi.approveExpense).toHaveBeenCalledWith(7);
    expect(adminApi.getPendingExpenses).toHaveBeenCalled();
    expect(alertService.success).toHaveBeenCalled();
    expect(component['approvalBusyId']).toBeNull();
  });

  it('passes the rejection reason through and never rules on two rows at once', async () => {
    component.ngOnInit();
    await Promise.resolve();

    component['approvalBusyId'] = 7;
    await component['onRejectExpense']({ id: 8, rejectionReason: 'บิลซ้ำ' });
    expect(adminApi.rejectExpense).not.toHaveBeenCalled();

    component['approvalBusyId'] = null;
    await component['onRejectExpense']({ id: 8, rejectionReason: 'บิลซ้ำ' });
    expect(adminApi.rejectExpense).toHaveBeenCalledWith(8, 'บิลซ้ำ');
  });
});
