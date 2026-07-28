import { SimpleChange } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ExpenseFormModalComponent } from './expense-form-modal.component';
import { ExpenseRow, VEHICLE_CENTRAL_SENTINEL } from '../expenses-page.mappers';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const VEHICLE_ROW: ExpenseRow = {
  id: 1,
  ownerId: 7,
  ownerLabel: 'NJ Travel',
  vehicleId: 1,
  vehicleLabel: 'V1 / ABC-123',
  category: 'FUEL',
  categoryOtherLabel: '',
  categoryDisplay: 'Fuel',
  amount: 500,
  vatAmount: 35,
  expenseDate: '2026-07-20',
  expenseDateDisplay: '20 ก.ค. 2026',
  receiptNo: 'RC-1',
  paidBy: 'Somchai',
  note: 'note',
};

const CENTRAL_ROW: ExpenseRow = {
  ...VEHICLE_ROW,
  id: 2,
  vehicleId: null,
  vehicleLabel: 'Central',
  category: 'OTHER',
  categoryOtherLabel: 'ล้างรถ',
};

function makeComponent() {
  const adminApiServiceSpy = {
    createExpense: jasmine
      .createSpy('createExpense')
      .and.returnValue(of({ code: 201, message: 'Created', data: { expenseId: 99 } })),
    updateExpense: jasmine.createSpy('updateExpense').and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alertServiceSpy = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new ExpenseFormModalComponent(
    adminApiServiceSpy as any,
    new FormBuilder(),
    alertServiceSpy as any,
    createTranslateStub()
  );
  component.vehicleOptions = [
    { code: VEHICLE_CENTRAL_SENTINEL, label: 'Central / Not linked' },
    { code: '1', label: 'V1 / ABC-123' },
  ];
  component.categoryOptions = [
    { code: 'FUEL', label: 'Fuel' },
    { code: 'OTHER', label: 'Other' },
  ];
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApiServiceSpy, alertServiceSpy };
}

/** OBRS-808: the same component, but as an admin who has a roster in hand. */
function makeAdminComponent() {
  const made = makeComponent();
  made.component.isAdmin = true;
  made.component.ownerOptions = [
    { code: '7', label: 'NJ Travel' },
    { code: '9', label: 'Second Operator' },
  ];
  return made;
}

function openCreate(component: ExpenseFormModalComponent): void {
  (component as any).isOpen = true;
  (component as any).mode = 'create';
  (component as any).selectedExpense = null;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

function openEdit(component: ExpenseFormModalComponent, row: ExpenseRow): void {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedExpense = row;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

describe('ExpenseFormModalComponent', () => {
  describe('create mode', () => {
    it('opens with vehicleSelection/category blank (design-system §3.1, no pre-seeded default)', () => {
      const { component } = makeComponent();
      openCreate(component);

      const form = (component as any).expenseForm;
      expect(form.get('vehicleSelection').value).toBe('');
      expect(form.get('category').value).toBe('');
      expect(form.get('amount').value).toBeNull();
      expect(form.get('expenseDate').value).toBeNull();
    });

    it('blocks submit while vehicleSelection is untouched (placeholder) — required, not silently defaulted', async () => {
      const { component, adminApiServiceSpy, alertServiceSpy } = makeComponent();
      openCreate(component);

      const form = (component as any).expenseForm;
      form.patchValue({ vehicleSelection: '', category: 'FUEL', amount: 500, expenseDate: new Date(2026, 6, 24) });

      await (component as any).submitExpense();

      expect(adminApiServiceSpy.createExpense).not.toHaveBeenCalled();
      expect(alertServiceSpy.warning).toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('opens synchronously from the row already in hand (no second detail fetch)', () => {
      const { component, adminApiServiceSpy } = makeComponent();
      openEdit(component, VEHICLE_ROW);

      const form = (component as any).expenseForm;
      expect(form.get('vehicleSelection').value).toBe('1');
      expect(form.get('amount').value).toBe(500);
      expect(adminApiServiceSpy.createExpense).not.toHaveBeenCalled();
      expect(adminApiServiceSpy.updateExpense).not.toHaveBeenCalled();
    });

    it('prefills the vehicle dropdown to the EXPLICIT central sentinel for a saved central expense, never blank', () => {
      const { component } = makeComponent();
      openEdit(component, CENTRAL_ROW);

      expect((component as any).expenseForm.get('vehicleSelection').value).toBe(VEHICLE_CENTRAL_SENTINEL);
    });

    it('sends all 9 fields on PUT', async () => {
      const { component, adminApiServiceSpy } = makeComponent();
      openEdit(component, VEHICLE_ROW);

      await (component as any).submitExpense();

      expect(adminApiServiceSpy.updateExpense).toHaveBeenCalledWith(VEHICLE_ROW.id, {
        // OBRS-808: null on PUT, always. The backend ignores ownerId there for
        // every caller (re-attribution is delete-and-recreate), and the edit
        // form never renders the picker, so anything else here would mean a
        // stale value survived a modal reuse.
        ownerId: null,
        vehicleId: 1,
        category: 'FUEL',
        categoryOtherLabel: null,
        amount: 500,
        vatAmount: 35,
        expenseDate: '2026-07-20',
        receiptNo: 'RC-1',
        paidBy: 'Somchai',
        note: 'note',
      });
    });
  });

  describe('categoryOtherLabel conditional (§4.1)', () => {
    it('is hidden and unrequired while category !== OTHER', () => {
      const { component } = makeComponent();
      openCreate(component);
      expect(component['showCategoryOtherLabel']).toBeFalse();
    });

    it('becomes visible and required when category = OTHER', () => {
      const { component } = makeComponent();
      openCreate(component);
      (component as any).expenseForm.patchValue({ category: 'OTHER' });

      expect(component['showCategoryOtherLabel']).toBeTrue();
      const control = (component as any).expenseForm.get('categoryOtherLabel');
      control.markAsTouched();
      expect(control.valid).toBeFalse();
    });

    it('clears BOTH the value and the validator the instant category leaves OTHER', () => {
      const { component } = makeComponent();
      openCreate(component);
      const form = (component as any).expenseForm;

      form.patchValue({ category: 'OTHER', categoryOtherLabel: 'ล้างรถ' });
      form.patchValue({ category: 'FUEL' });

      const control = form.get('categoryOtherLabel');
      expect(control.value).toBe('');
      expect(control.valid).toBeTrue(); // no leftover required validator
    });
  });

  // UX-OBRS-685 §4.1.1 locking spec — full-object toEqual, not
  // objectContaining, so a stray "" or an omitted key both fail this.
  describe('full-DTO payload locking specs (UX-OBRS-685 §4.1.1)', () => {
    it('submits vehicleId: null literally (never "") when Central/Not-linked is chosen', async () => {
      const { component, adminApiServiceSpy } = makeComponent();
      openCreate(component);

      (component as any).expenseForm.patchValue({
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'FUEL',
        categoryOtherLabel: '',
        amount: 500,
        vatAmount: null,
        expenseDate: new Date(2026, 6, 24),
        receiptNo: '',
        paidBy: '',
        note: '',
      });

      await (component as any).submitExpense();

      const payload = adminApiServiceSpy.createExpense.calls.mostRecent().args[0];
      expect(payload).toEqual({
        // OBRS-808: this caller is not an admin, so the picker never rendered
        // and the key is an explicit null rather than an omission — the backend
        // ignores it for non-admins either way, but a missing key would mean
        // toExpensePayload had branched, and it must not.
        ownerId: null,
        vehicleId: null,
        category: 'FUEL',
        categoryOtherLabel: null,
        amount: 500,
        vatAmount: null,
        expenseDate: '2026-07-24',
        receiptNo: null,
        paidBy: null,
        note: null,
      });
    });

    it('submits categoryOtherLabel: null when category is not OTHER, even if the control was populated before switching away', async () => {
      const { component, adminApiServiceSpy } = makeComponent();
      openCreate(component);
      const form = (component as any).expenseForm;

      form.patchValue({ category: 'OTHER', categoryOtherLabel: 'ล้างรถ' });
      form.patchValue({ category: 'FUEL' }); // switch away — control auto-cleared
      form.patchValue({
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        amount: 100,
        expenseDate: new Date(2026, 6, 24),
      });

      await (component as any).submitExpense();

      const payload = adminApiServiceSpy.createExpense.calls.mostRecent().args[0];
      expect(payload.categoryOtherLabel).toBeNull();
    });
  });

  // OBRS-808. The bug this card closes is a 400 that only an `admin` could hit,
  // so every test here names the role it is speaking for.
  describe('operator picker (OBRS-808)', () => {
    const VALID_REST = {
      vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
      category: 'FUEL',
      amount: 500,
      expenseDate: new Date(2026, 6, 24),
    };

    it('AC2: an owner never sees the picker, and their form is still submittable without one', async () => {
      const { component, adminApiServiceSpy } = makeComponent(); // isAdmin defaults false
      openCreate(component);

      expect(component['showOwnerPicker']).toBeFalse();

      (component as any).expenseForm.patchValue(VALID_REST);
      await (component as any).submitExpense();

      // The real assertion is that the create HAPPENED. A required validator
      // left switched on for a field the owner cannot see would block submit
      // with no visible error to fix — a worse bug than the one being fixed.
      expect(adminApiServiceSpy.createExpense).toHaveBeenCalled();
      expect(adminApiServiceSpy.createExpense.calls.mostRecent().args[0].ownerId).toBeNull();
    });

    it('AC1: an admin sees the picker in create mode', () => {
      const { component } = makeAdminComponent();
      openCreate(component);

      expect(component['showOwnerPicker']).toBeTrue();
    });

    it('AC3: an admin who has not chosen an operator cannot submit — blocked here, not by a 400', async () => {
      const { component, adminApiServiceSpy, alertServiceSpy } = makeAdminComponent();
      openCreate(component);

      (component as any).expenseForm.patchValue(VALID_REST); // everything BUT the operator

      await (component as any).submitExpense();

      expect(adminApiServiceSpy.createExpense).not.toHaveBeenCalled();
      expect(alertServiceSpy.warning).toHaveBeenCalled();
    });

    it('AC1: an admin who chooses an operator sends it as a NUMBER', async () => {
      const { component, adminApiServiceSpy } = makeAdminComponent();
      openCreate(component);

      (component as any).expenseForm.patchValue({ ...VALID_REST, ownerSelection: '9' });
      await (component as any).submitExpense();

      const payload = adminApiServiceSpy.createExpense.calls.mostRecent().args[0];
      // Not '9'. The dropdown's value is a string by construction; a string id
      // reaching a Long field is the kind of thing that works until it does not.
      expect(payload.ownerId).toBe(9);
    });

    it('does not show the picker on EDIT, even for an admin — the backend ignores ownerId on PUT', () => {
      const { component } = makeAdminComponent();
      openEdit(component, VEHICLE_ROW);

      expect(component['showOwnerPicker']).toBeFalse();
      // ...and instead names the operator as read-only text.
      expect(component['editingOwnerLabel']).toBe('NJ Travel');
    });

    it('a create AFTER an edit is required again — the validator is re-applied, not left cleared', async () => {
      // The failure this catches: one component instance serves every open, so
      // clearing the validator for an edit and never restoring it would let the
      // NEXT create submit with no operator and hit the exact 400 this card is
      // about. Nothing in a single-open test would notice.
      const { component, adminApiServiceSpy, alertServiceSpy } = makeAdminComponent();

      openEdit(component, VEHICLE_ROW);
      openCreate(component);

      (component as any).expenseForm.patchValue(VALID_REST);
      await (component as any).submitExpense();

      expect(adminApiServiceSpy.createExpense).not.toHaveBeenCalled();
      expect(alertServiceSpy.warning).toHaveBeenCalled();
    });

    it('an edit AFTER a create is submittable — the validator is cleared, not left on an invisible field', async () => {
      // The mirror image, and the reason set/clear live in one method: a
      // required validator surviving into edit mode makes the form permanently
      // invalid with no field on screen to fill in.
      const { component, adminApiServiceSpy } = makeAdminComponent();

      openCreate(component);
      openEdit(component, VEHICLE_ROW);

      await (component as any).submitExpense();

      expect(adminApiServiceSpy.updateExpense).toHaveBeenCalled();
    });

    it('warns an admin when the roster came back empty, instead of offering an empty dropdown', () => {
      const { component } = makeComponent();
      component.isAdmin = true;
      component.ownerOptions = []; // the fetch failed
      openCreate(component);

      expect(component['showOwnerPicker']).toBeTrue(); // still shown - see the input's javadoc
      expect(component['ownerRosterUnavailable']).toBeTrue();
    });

    it('does not warn a non-admin about a roster they were never meant to have', () => {
      const { component } = makeComponent();
      openCreate(component);

      expect(component['ownerRosterUnavailable']).toBeFalse();
    });
  });

  describe('submit ordering and error handling', () => {
    it('closes, alerts success, then reloads — in that order', async () => {
      const { component, alertServiceSpy } = makeComponent();
      openCreate(component);
      (component as any).expenseForm.patchValue({
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'FUEL',
        amount: 500,
        expenseDate: new Date(2026, 6, 24),
      });

      const calls: string[] = [];
      component.closed.subscribe(() => calls.push('closed'));
      alertServiceSpy.success.and.callFake(() => {
        calls.push('success');
        return Promise.resolve();
      });
      (component.reloadStructure as jasmine.Spy).and.callFake(() => {
        calls.push('reload');
        return Promise.resolve();
      });

      await (component as any).submitExpense();

      expect(calls).toEqual(['closed', 'success', 'reload']);
    });

    it('shows a save-failed alert and does not throw when the API call fails', async () => {
      const { component, adminApiServiceSpy, alertServiceSpy } = makeComponent();
      adminApiServiceSpy.createExpense.and.returnValue(throwError(() => new Error('boom')));
      openCreate(component);
      (component as any).expenseForm.patchValue({
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'FUEL',
        amount: 500,
        expenseDate: new Date(2026, 6, 24),
      });

      await (component as any).submitExpense();

      expect(alertServiceSpy.error).toHaveBeenCalled();
    });
  });
});
