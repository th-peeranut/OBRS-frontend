import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { DriverCashRepairFormComponent } from './driver-cash-repair-form.component';
import { AdminExpensePayeeDto } from '../../../../../services/admin/admin-api.service';
import { ExpensePayeesStore } from '../../../../admin/pages/expense-payees/expense-payees.store';

/**
 * OBRS-1630 — the staff repair box. The bill card itself is covered by its own spec; what is
 * proved here is the half this component owns: the garage list it fetches, the payload it emits,
 * and that a failed submit keeps the lines the salesperson typed.
 */
describe('DriverCashRepairFormComponent', () => {
  let fixture: ComponentFixture<DriverCashRepairFormComponent>;
  let component: DriverCashRepairFormComponent;
  let payeesStore: {
    data$: BehaviorSubject<AdminExpensePayeeDto[] | null>;
    refresh: jasmine.Spy;
  };

  function itemsOf(): FormArray {
    return (component['billForm'] as FormGroup).get('items') as FormArray;
  }

  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [DriverCashRepairFormComponent],
      providers: [{ provide: ExpensePayeesStore, useValue: payeesStore }],
      // The bill card is declared in AdminSharedModule and has a spec of its own; this one is
      // about the wrapper, so the tag is left unknown rather than dragging that module in.
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashRepairFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    payeesStore = {
      data$: new BehaviorSubject<AdminExpensePayeeDto[] | null>([
        { id: 5, name: 'อู่เฮียหน่อง', type: 'GARAGE', active: true },
        { id: 6, name: 'อู่ที่เลิกใช้แล้ว', type: 'GARAGE', active: false },
      ]),
      refresh: jasmine.createSpy('refresh'),
    };
  });

  // The box is behind an accordion, so it is rebuilt on every open/close. Reading the SHARED
  // root-scoped cache is what keeps a reopen from paying for the network again.
  it('reads the shared payee store and asks it to revalidate, instead of fetching for itself', async () => {
    await build();

    expect(payeesStore.refresh).toHaveBeenCalled();
    expect(component['payees'].map((p) => p.id)).toEqual([5]);
  });

  it('drops a retired garage — the picker must never offer one', async () => {
    await build();

    expect(component['payees'].some((p) => p.active === false)).toBeFalse();
  });

  it('leaves the list empty while the cache is still cold, rather than throwing', async () => {
    payeesStore.data$.next(null);

    await build();

    expect(component['payees']).toEqual([]);
  });

  it('emits the lines with the part sentinel translated to absent, and no amount of its own', async () => {
    await build();
    component['billForm'].get('payeeId')!.setValue(5);
    itemsOf().at(0).patchValue({ description: 'ยางหน้าซ้าย', part: 'TIRES', amount: 4200 });
    const spy = spyOn(component.submitRepairBill, 'emit');

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith({
      payeeId: 5,
      items: [
        {
          part: 'TIRES',
          description: 'ยางหน้าซ้าย',
          quantity: null,
          unitPrice: null,
          amount: 4200,
        },
      ],
    });
  });

  // An empty quantity box is absent, not zero: `Number('')` is 0, and the OBRS-1626/1631 family of
  // bug is exactly that coercion reaching a payload.
  it('sends an untouched quantity/unit price as null, never as 0', async () => {
    await build();
    component['billForm'].get('payeeId')!.setValue(5);
    itemsOf().at(0).patchValue({ description: 'ค่าแรง', amount: 300 });
    const spy = spyOn(component.submitRepairBill, 'emit');

    component['onSubmit']();

    const emitted = spy.calls.mostRecent().args[0]!;
    expect(emitted.items[0].quantity).toBeNull();
    expect(emitted.items[0].unitPrice).toBeNull();
    expect(emitted.items[0].part).toBeNull();
  });

  it('refuses to submit a bill of zero — the server would refuse it too, with a message about a field this form does not show', async () => {
    await build();
    component['billForm'].get('payeeId')!.setValue(5);
    itemsOf().at(0).patchValue({ description: 'งานฟรี', amount: 0 });

    expect(component['canSubmit']).toBeFalse();
  });

  it('keeps the typed lines when the submit failed, and starts a blank bill when it succeeded', async () => {
    await build();
    component['billForm'].get('payeeId')!.setValue(5);
    itemsOf().at(0).patchValue({ description: 'ยางหน้าซ้าย', amount: 4200 });

    const flipToDone = {
      isSubmitting: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false },
    } as never;

    component.isSubmitting = false;
    component.submitError = 'STAFF.DRIVER_CASH.ERROR.GENERIC';
    component.ngOnChanges(flipToDone);

    expect(itemsOf().at(0).get('amount')!.value).toBe(4200);

    component.submitError = null;
    component.ngOnChanges(flipToDone);

    expect(itemsOf().at(0).get('amount')!.value).toBeNull();
    expect(component['billForm'].get('payeeId')!.value).toBeNull();
  });
});
