import { BehaviorSubject, of, throwError } from 'rxjs';
import { ExpenseApprovalSectionComponent } from './expense-approval-section.component';
import { AdminExpenseDto, PendingExpenseGroupDto } from '../../../../../services/admin/admin-api.service';

function expenseDto(id: number, vehicleId: number | null, note: string | null = null): AdminExpenseDto {
  return {
    id,
    ownerId: 1,
    vehicleId,
    category: 'FUEL',
    categoryOtherLabel: null,
    amount: 300,
    vatAmount: null,
    expenseDate: '2026-09-14',
    receiptNo: null,
    paidBy: null,
    payeeId: null,
    payeeName: null,
    note,
    source: 'FIELD',
    approvalStatus: 'PENDING',
  } as unknown as AdminExpenseDto;
}

function singleGroup(id: number, vehicleId: number | null): PendingExpenseGroupDto {
  return {
    groupType: 'SINGLE',
    settleId: null,
    totalAmount: 300,
    expenseDate: '2026-09-14',
    vehicleId,
    expenses: [expenseDto(id, vehicleId)],
  };
}

// OBRS-1891: a gas-bill submission — several AdminExpenseDto rows folded under one settle.
function billGroup(settleId: number, vehicleId: number | null): PendingExpenseGroupDto {
  return {
    groupType: 'SETTLE_BILL',
    settleId,
    totalAmount: 900,
    expenseDate: '2026-09-14',
    vehicleId,
    expenses: [expenseDto(101, vehicleId), { ...expenseDto(102, vehicleId), category: 'DRIVER_WAGE', amount: 600 }],
  };
}

function createAdminApiStub(): any {
  return {
    getPendingExpenses: jasmine
      .createSpy('getPendingExpenses')
      .and.returnValue(of({ code: 200, message: 'OK', data: [singleGroup(7, 3)] })),
    approveExpense: jasmine
      .createSpy('approveExpense')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    rejectExpense: jasmine
      .createSpy('rejectExpense')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    approveExpenseSettle: jasmine
      .createSpy('approveExpenseSettle')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    rejectExpenseSettle: jasmine
      .createSpy('rejectExpenseSettle')
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

  it('re-reads the queue after a SINGLE-row verdict so a ruled row leaves the lane', async () => {
    component.ngOnInit();
    await Promise.resolve();
    adminApi.getPendingExpenses.calls.reset();

    const row = component['pendingExpenses'][0];
    expect(row.groupType).toBe('SINGLE');
    await component['onApproveExpense'](row);

    expect(adminApi.approveExpense).toHaveBeenCalledWith(7);
    expect(adminApi.approveExpenseSettle).not.toHaveBeenCalled();
    expect(adminApi.getPendingExpenses).toHaveBeenCalled();
    expect(alertService.success).toHaveBeenCalled();
    expect(component['approvalBusyId']).toBeNull();
  });

  it('passes the rejection reason through a SINGLE row and never rules on two rows at once', async () => {
    component.ngOnInit();
    await Promise.resolve();
    const row = component['pendingExpenses'][0];

    component['approvalBusyId'] = row.actionKey;
    await component['onRejectExpense']({ row, rejectionReason: 'บิลซ้ำ' });
    expect(adminApi.rejectExpense).not.toHaveBeenCalled();

    component['approvalBusyId'] = null;
    await component['onRejectExpense']({ row, rejectionReason: 'บิลซ้ำ' });
    expect(adminApi.rejectExpense).toHaveBeenCalledWith(7, 'บิลซ้ำ');
  });

  // OBRS-1891 AC-2: a SETTLE_BILL row rules via the whole-bill endpoints, keyed by settleId —
  // never the per-expense endpoints, even though the group folds several expense ids together.
  it('rules on a SETTLE_BILL row via the settle endpoints, keyed by settleId', async () => {
    adminApi.getPendingExpenses.and.returnValue(of({ code: 200, message: 'OK', data: [billGroup(55, 3)] }));
    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    const bill = component['pendingExpenses'][0];
    expect(bill.groupType).toBe('SETTLE_BILL');
    expect(bill.actionKey).toBe('bill:55');

    await component['onApproveExpense'](bill);
    expect(adminApi.approveExpenseSettle).toHaveBeenCalledWith(55);
    expect(adminApi.approveExpense).not.toHaveBeenCalled();

    await component['onRejectExpense']({ row: bill, rejectionReason: 'บิลไม่ครบ' });
    expect(adminApi.rejectExpenseSettle).toHaveBeenCalledWith(55, 'บิลไม่ครบ');
    expect(adminApi.rejectExpense).not.toHaveBeenCalled();
  });
});
