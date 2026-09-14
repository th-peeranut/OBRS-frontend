import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ExpenseBatchPageComponent } from './expense-batch-page.component';
import { CreateExpenseBatchPayload } from '../../../../../services/admin/admin-api.service';
import { buildItemGroup } from '../expense-bill-card/expense-bill-card.component';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeStores() {
  return {
    vehicles$: new BehaviorSubject<any>({ vehicles: [{ id: 1, numberPlate: '16-8747' }] }),
    payees$: new BehaviorSubject<any>([
      { id: 5, name: 'อู่ช่างปุ้น', type: 'GARAGE', active: true },
      { id: 6, name: 'ปั๊มบางจาก', type: 'FUEL_STATION', active: true },
    ]),
    // OBRS-1613: the registry store hands down retired rows too - the registry SCREEN needs them.
    // The retired one is here so the page's own filter is what the assertions exercise.
    parts$: new BehaviorSubject<any>([
      { id: 1, code: 'ENGINE_OIL', name: 'น้ำมันเครื่อง', kind: 'PART', active: true },
      { id: 2, code: null, name: 'ค่าแรงเปลี่ยนสายพาน', kind: 'LABOUR', active: true },
      { id: 3, code: null, name: 'อะไหล่ที่เลิกใช้แล้ว', kind: 'PART', active: false },
    ]),
  };
}

function makeComponent(
  options: { isAdmin?: boolean; createBatch?: jasmine.Spy; confirmPlans?: boolean } = {}
) {
  const stores = makeStores();
  const createExpenseBatch =
    options.createBatch ??
    jasmine
      .createSpy('createExpenseBatch')
      .and.returnValue(
        of({ code: 201, message: 'Created', data: { expenseIds: [1, 2], updatedPlans: [] } })
      );
  const adminApiService = {
    createExpenseBatch,
    getOwners: jasmine.createSpy('getOwners').and.returnValue(of({ code: 200, message: 'OK', data: [] })),
  };
  const alertService = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    // OBRS-1588: the post-save plan summary is a confirm, not a success alert - its confirm BUTTON
    // is the link to the plan page, so "read the summary" and "go fix the number" are one dialog.
    confirm: jasmine.createSpy('confirm').and.resolveTo(options.confirmPlans ?? false),
  };
  const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
  const authService = {
    getRoles: () => (options.isAdmin ? ['admin'] : ['owner']),
    hasHeldRole: () => !options.isAdmin,
  };
  const expensesStore = { refresh: jasmine.createSpy('refresh').and.resolveTo(undefined) };
  const vehiclesStore = { data$: stores.vehicles$, refresh: () => Promise.resolve() };
  const payeesStore = { data$: stores.payees$, refresh: jasmine.createSpy('refresh').and.resolveTo(undefined) };
  const maintenancePartsStore = {
    data$: stores.parts$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  };

  const component = new ExpenseBatchPageComponent(
    adminApiService as any,
    new FormBuilder(),
    alertService as any,
    createTranslateStub(),
    router as any,
    authService as any,
    expensesStore as any,
    vehiclesStore as any,
    payeesStore as any,
    maintenancePartsStore as any
  );
  component.ngOnInit();
  return {
    component,
    adminApiService,
    alertService,
    router,
    expensesStore,
    payeesStore,
    maintenancePartsStore,
    stores,
    createExpenseBatch,
  };
}

/** Fill one bill card so the envelope is valid, mirroring what the owner types off a slip. */
function fillBill(bill: FormGroup, lines: Array<{ description: string; amount: number }>): void {
  bill.get('expenseDate')!.setValue(new Date(2026, 7, 14));
  bill.get('vehicleSelection')!.setValue('1');
  bill.get('payeeId')!.setValue(5);
  bill.get('category')!.setValue('REPAIR');
  const items = bill.get('items') as FormArray;
  while (items.length < lines.length) {
    items.push(buildItemGroup(new FormBuilder()));
  }
  lines.forEach((line, index) => {
    items.at(index).get('description')!.setValue(line.description);
    items.at(index).get('amount')!.setValue(line.amount);
  });
}

describe('ExpenseBatchPageComponent', () => {
  it('should create, with one empty bill open', () => {
    const { component } = makeComponent();

    expect(component).toBeTruthy();
    expect(component['billForms'].length).toBe(1);
    expect(component['collapsed']).toEqual([false]);
  });

  // AC1. Adding a bill folds the one just finished — an envelope of 8–10 slips fully expanded is a
  // page the owner has to scroll to find the row they are typing into.
  it('folds the finished bills when another is added, and opens the new one', () => {
    const { component } = makeComponent();

    component['addBill']();
    component['addBill']();

    expect(component['billForms'].length).toBe(3);
    expect(component['collapsed']).toEqual([true, true, false]);
  });

  it('removes a bill and its fold state together', () => {
    const { component } = makeComponent();
    component['addBill']();
    component['addBill']();

    component['removeBill'](1);

    expect(component['billForms'].length).toBe(2);
    expect(component['collapsed'].length)
      .withContext('a stale fold flag would fold the wrong bill from here on')
      .toBe(2);
  });

  // AC3, the near half: an invalid envelope never leaves the browser, and every bill is UNFOLDED
  // first — telling the owner "something is wrong" while the wrong thing is hidden is worse than
  // not telling them.
  it('refuses to send an incomplete envelope and unfolds everything', async () => {
    const { component, adminApiService, alertService } = makeComponent();
    component['addBill']();

    await component['submitEnvelope']();

    expect(adminApiService.createExpenseBatch).not.toHaveBeenCalled();
    expect(alertService.warning).toHaveBeenCalled();
    expect(component['collapsed']).toEqual([false, false]);
  });

  it('sends every bill in ONE call, with the lines as the amount', async () => {
    const { component, createExpenseBatch, expensesStore, router } = makeComponent();
    fillBill(component['billForms'][0], [
      { description: 'ถ่ายน้ำมันเครื่อง + กรองเครื่อง', amount: 1730 },
      { description: 'สายพานหน้าเครื่อง', amount: 700 },
    ]);
    component['addBill']();
    fillBill(component['billForms'][1], [{ description: 'เปลี่ยนยางหน้า', amount: 8400 }]);

    await component['submitEnvelope']();

    expect(createExpenseBatch).toHaveBeenCalledTimes(1);
    const payload = createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload;
    expect(payload.bills.length).toBe(2);
    expect(payload.bills[0].amount)
      .withContext('the bill total is the lines, never a separately typed number')
      .toBe(2430);
    expect(payload.bills[1].amount).toBe(8400);
    expect(expensesStore.refresh).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/expenses']);
  });

  // Owner ruling 2026-08-24: hidden on the SCREEN, and the columns stay. The payload is where that
  // distinction becomes visible — it still carries both fields, explicitly null.
  it('sends receiptNo, vatAmount and note as null rather than omitting them', async () => {
    const { component, createExpenseBatch } = makeComponent();
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    const bill = (createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload).bills[0];
    expect(bill.receiptNo).toBeNull();
    expect(bill.vatAmount).toBeNull();
    expect(bill.note).toBeNull();
  });

  // OBRS-1613 AC1: the picker offers the registry, and only the rows the owner has not retired -
  // retiring one is exactly how they say "stop offering this", so a picker that still showed it
  // would make the action do nothing.
  it('offers the line picker ACTIVE registry rows only', () => {
    const { component } = makeComponent();

    expect(component['partOptions'].map((part: { id: number }) => part.id)).toEqual([2, 1]);
  });

  // OBRS-1613 AC1/AC3: the two columns V128 added. Without this the registry the card exists to
  // build is populated by the maintenance-plan screen alone, and a unit price cannot be compared.
  it('sends the picked registry id and the typed unit on every line', async () => {
    const { component, createExpenseBatch } = makeComponent();
    const bill = component['billForms'][0];
    fillBill(bill, [{ description: 'ฟิล์มกรองแสง', amount: 4500 }]);
    const line = (bill.get('items') as FormArray).at(0);
    line.get('partId')!.setValue(2);
    line.get('unit')!.setValue('  ตารางฟุต  ');

    await component['submitEnvelope']();

    const sent = (createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload)
      .bills[0].items[0];
    expect(sent.partId).toBe(2);
    expect(sent.unit).toBe('ตารางฟุต');
    // The legacy code goes out as null from THIS screen: it picks an id and has no code. The
    // single-bill modal is the one that still sends a code, and the server takes either.
    expect(sent.part).toBeNull();
  });

  it('sends a line with no part as partId null, not as a registry row it guessed', async () => {
    const { component, createExpenseBatch } = makeComponent();
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    const sent = (createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload)
      .bills[0].items[0];
    expect(sent.partId).toBeNull();
    expect(sent.unit).toBeNull();
  });

  it('revalidates the registry after a part is added from inside a bill', () => {
    const { component, maintenancePartsStore } = makeComponent();
    maintenancePartsStore.refresh.calls.reset();

    component['onPartCreated']();

    expect(maintenancePartsStore.refresh).toHaveBeenCalledTimes(1);
  });

  // A rejected envelope has written NOTHING (the server runs it in one transaction), so the screen
  // must keep every bill exactly as typed and show them all.
  it('keeps the envelope on screen and unfolded when the server refuses it', async () => {
    const createBatch = jasmine
      .createSpy('createExpenseBatch')
      .and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { message: 'บิลใบที่ 2 บันทึกไม่ได้', errorCode: 'EXPENSE_BATCH_BILL_INVALID' },
            })
        )
      );
    const { component, alertService, router } = makeComponent({ createBatch });
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);
    component['addBill']();
    fillBill(component['billForms'][1], [{ description: 'ยาง', amount: 4200 }]);

    await component['submitEnvelope']();

    expect(alertService.error).toHaveBeenCalledWith('บิลใบที่ 2 บันทึกไม่ได้');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['billForms'].length).toBe(2);
    expect(component['collapsed'])
      .withContext('the message names a bill; that bill has to be visible')
      .toEqual([false, false]);
  });

  // OBRS-808: an ADMIN has no owner identity, so they must name the operator or the server answers
  // 400 EXPENSE_OWNER_REQUIRED — a failure the screen must prevent rather than relay.
  // OBRS-1588 AC2/AC1. The field is optional and the payload says so EXPLICITLY: a bill whose
  // garage wrote no odometer is a normal bill (owner, 2026-08-23), and `null` is what stops the
  // server inferring one.
  it('sends odometerKm as null when the bill card was left blank', async () => {
    const { component, createExpenseBatch } = makeComponent();
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    const bill = (createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload).bills[0];
    expect(bill.odometerKm).toBeNull();
  });

  it('sends the typed odometer as a NUMBER, per bill', async () => {
    const { component, createExpenseBatch } = makeComponent();
    fillBill(component['billForms'][0], [{ description: 'เปลี่ยนยางหน้า', amount: 8400 }]);
    component['billForms'][0].get('odometerKm')!.setValue('375395');
    component['addBill']();
    fillBill(component['billForms'][1], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    const payload = createExpenseBatch.calls.mostRecent().args[0] as CreateExpenseBatchPayload;
    expect(payload.bills[0].odometerKm)
      .withContext('a number, not the string the number input hands back')
      .toBe(375395);
    expect(payload.bills[1].odometerKm)
      .withContext('the odometer is per BILL - one slip stating it says nothing about the next')
      .toBeNull();
  });

  // Owner ruling 2026-09-13: silent write, ONE summary afterwards. Ten bills must not produce ten
  // dialogs - that is the per-slip clicking OBRS-1576 exists to have removed.
  it('shows ONE summary naming the plans the envelope moved', async () => {
    const createBatch = jasmine.createSpy('createExpenseBatch').and.returnValue(
      of({
        code: 201,
        message: 'Created',
        data: {
          expenseIds: [1],
          updatedPlans: [
            { planId: 41, vehicleId: 1, partName: 'ยางหน้า', lastDoneKm: 375395, lastDoneDate: '2026-08-14' },
            { planId: 42, vehicleId: 1, partName: 'น้ำมันเครื่อง', lastDoneKm: 375395, lastDoneDate: '2026-08-14' },
          ],
        },
      })
    );
    const { component, alertService, router } = makeComponent({ createBatch });
    fillBill(component['billForms'][0], [{ description: 'เปลี่ยนยางหน้า', amount: 8400 }]);
    component['billForms'][0].get('odometerKm')!.setValue(375395);

    await component['submitEnvelope']();

    expect(alertService.confirm).toHaveBeenCalledTimes(1);
    expect(alertService.success)
      .withContext('the summary REPLACES the plain success alert, it is not a second dialog')
      .not.toHaveBeenCalled();
    const options = alertService.confirm.calls.mostRecent().args[0];
    expect(options.text).toContain('ADMIN.EXPENSES.BATCH.PLANS_UPDATED');
    expect(options.text)
      .withContext('the owner recognises the part name, not the plan id')
      .toContain('ADMIN.EXPENSES.BATCH.PLAN_UPDATED_LINE');
    expect(router.navigate)
      .withContext('declining the link goes where a save always went')
      .toHaveBeenCalledWith(['/admin/expenses']);
  });

  it('takes the owner to the plan page when the summary link is accepted', async () => {
    const createBatch = jasmine.createSpy('createExpenseBatch').and.returnValue(
      of({
        code: 201,
        message: 'Created',
        data: {
          expenseIds: [1],
          updatedPlans: [
            { planId: 41, vehicleId: 1, partName: 'ยางหน้า', lastDoneKm: 375395, lastDoneDate: '2026-08-14' },
          ],
        },
      })
    );
    const { component, router } = makeComponent({ createBatch, confirmPlans: true });
    fillBill(component['billForms'][0], [{ description: 'เปลี่ยนยางหน้า', amount: 8400 }]);

    await component['submitEnvelope']();

    expect(router.navigate).toHaveBeenCalledWith(['/admin/vehicles']);
  });

  // By far the common case: no odometer, or a stack that is not repairs. It must still get the
  // plain "saved" confirmation it always had - a save that says nothing reads as a save that failed.
  it('keeps the plain success alert for an envelope that moved no plan', async () => {
    const { component, alertService } = makeComponent();
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    expect(alertService.success).toHaveBeenCalledTimes(1);
    expect(alertService.confirm).not.toHaveBeenCalled();
  });

  it('treats a server that sends no updatedPlans key as "nothing moved", not as a crash', async () => {
    const createBatch = jasmine
      .createSpy('createExpenseBatch')
      .and.returnValue(of({ code: 201, message: 'Created', data: { expenseIds: [1] } }));
    const { component, alertService, router } = makeComponent({ createBatch });
    fillBill(component['billForms'][0], [{ description: 'ค่าแรง', amount: 300 }]);

    await component['submitEnvelope']();

    expect(alertService.success).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/expenses']);
  });

  it('requires an operator from an admin and none from an owner', () => {
    expect(makeComponent({ isAdmin: true }).component['envelopeForm'].get('ownerSelection')!.valid).toBeFalse();
    expect(makeComponent().component['envelopeForm'].get('ownerSelection')!.valid).toBeTrue();
  });

  // OBRS-506 honour-null: a logout emits null through the store, and a page that kept the previous
  // session's rows would show one operator's garages to the next.
  it('treats a null store emission as empty, not as stale data', () => {
    const { component, stores } = makeComponent();
    expect(component['payeeOptions'].length).toBe(2);

    stores.payees$.next(null);

    expect(component['payeeOptions']).toEqual([]);
  });

  it('offers only ACTIVE payees', () => {
    const { component, stores } = makeComponent();

    stores.payees$.next([
      { id: 5, name: 'อู่ช่างปุ้น', type: 'GARAGE', active: true },
      { id: 9, name: 'อู่ที่ปิดไปแล้ว', type: 'GARAGE', active: false },
    ]);

    expect(component['payeeOptions'].map((payee) => payee.id)).toEqual([5]);
  });
});
