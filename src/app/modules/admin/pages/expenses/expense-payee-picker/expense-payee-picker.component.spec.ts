import { of, throwError } from 'rxjs';
import { ExpensePayeePickerComponent } from './expense-payee-picker.component';
import { AdminExpensePayeeDto } from '../../../../../services/admin/admin-api.service';

/**
 * OBRS-1577 AC4/AC5. Instantiated directly rather than through TestBed, matching
 * `ExpensesPageComponent`'s own spec: everything worth asserting here is the component's decisions —
 * what it offers, when it offers to CREATE, and what it does with the row it gets back — none of
 * which the template changes.
 */
describe('ExpensePayeePickerComponent', () => {
  const GARAGE: AdminExpensePayeeDto = {
    id: 1,
    // อู่เฮียหน่อง, written out so the mark order is visible.
    name: 'อู่เฮียหน่อง',
    type: 'GARAGE',
    active: true,
  };
  const STATION: AdminExpensePayeeDto = {
    id: 2,
    name: 'PTT Nong Chak',
    type: 'FUEL_STATION',
    active: true,
  };

  function makeComponent(
    adminApi: Record<string, unknown> = {},
    alert: Record<string, unknown> = { error: jasmine.createSpy('error').and.resolveTo(undefined) }
  ) {
    const translate = { instant: (key: string) => key };
    const component = new ExpensePayeePickerComponent(
      { nativeElement: document.createElement('div') } as any,
      adminApi as any,
      alert as any,
      translate as any
    );
    component.payees = [GARAGE, STATION];
    return component as any;
  }

  it('offers everything before anything is typed', () => {
    const component = makeComponent();
    expect(component.visiblePayees.length).toBe(2);
  });

  it('narrows on typing, across a space the stored name does not have', () => {
    const component = makeComponent();
    // "อู่เฮีย หน่อง" — the same garage with a space in the middle.
    component.query =
      'อู่เฮีย หน่อง';

    expect(component.visiblePayees.map((p: AdminExpensePayeeDto) => p.id)).toEqual([1]);
  });

  it('does NOT offer to create a name that is already on record, however it was spaced', () => {
    // AC5's whole point: without this the owner adds "อู่เฮีย หน่อง" alongside "อู่เฮียหน่อง" and
    // the per-garage total quietly splits in half.
    const component = makeComponent();
    component.query =
      '  อู่เฮีย หน่อง  ';

    expect(component.showCreateOption).toBeFalse();
  });

  it('offers to create a name that only PARTIALLY matches an existing one', () => {
    const component = makeComponent();
    component.query = 'PTT';

    expect(component.visiblePayees.length).toBe(1);
    expect(component.showCreateOption).toBeTrue();
  });

  it('offers no create affordance to a caller the server would refuse', async () => {
    // An admin. Every other payee operation resolves through `getCurrentOwnerScope()` and works for
    // them; CREATE alone needs `getCurrentOwnerId()`, which throws — so the button is hidden rather
    // than shown-and-failing, and the method refuses too in case something else calls it.
    const spy = jasmine.createSpy('createExpensePayee');
    const component = makeComponent({ createExpensePayee: spy });
    component.canCreate = false;
    component.query = 'Somewhere Not On Record';

    expect(component.showCreateOption).toBeFalse();

    await component.createFromQuery();
    expect(spy).not.toHaveBeenCalled();

    // ...and the picker still LISTS and SELECTS normally for them.
    component.query = 'PTT';
    expect(component.visiblePayees.map((p: AdminExpensePayeeDto) => p.id)).toEqual([2]);
  });

  it('names the type it would create from the bill category, not a fixed default', () => {
    const component = makeComponent();

    component.category = 'REPAIR';
    expect(component.inferredType).toBe('GARAGE');

    component.category = 'FUEL';
    expect(component.inferredType).toBe('FUEL_STATION');

    // The measured case (OBRS-1578, 5 real bills): a tyre bill is filed under TIRE and its payee is
    // usually not a garage, so the guess stays OTHER rather than widening.
    component.category = 'TIRE';
    expect(component.inferredType).toBe('OTHER');
  });

  it('keeps showing the created payee before the parent refreshes its list', async () => {
    // The failure this guards: `select()` sets an id the @Input list does not contain yet, the
    // trigger falls back to the placeholder, and the owner reads that as "it did not save".
    const created: AdminExpensePayeeDto = { id: 9, name: 'Anek Service', type: 'GARAGE', active: true };
    const component = makeComponent({
      createExpensePayee: jasmine
        .createSpy('createExpensePayee')
        .and.returnValue(of({ code: 200, message: 'OK', data: created })),
    });
    // Collected into an array rather than a `let`: TypeScript narrows a `let` initialised to null
    // down to `null` here, because it cannot see that the subscribe callback runs.
    const emitted: AdminExpensePayeeDto[] = [];
    component.payeeCreated.subscribe((payee: AdminExpensePayeeDto) => emitted.push(payee));
    component.category = 'REPAIR';
    component.query = 'Anek Service';

    await component.createFromQuery();

    expect(component.selectedId).toBe(9);
    expect(component.selectedLabel).toBe('Anek Service');
    expect(emitted).toEqual([created]);
  });

  it('sends the trimmed name and the inferred type', async () => {
    const spy = jasmine
      .createSpy('createExpensePayee')
      .and.returnValue(of({ code: 200, message: 'OK', data: { id: 9, name: 'X', type: 'OTHER', active: true } }));
    const component = makeComponent({ createExpensePayee: spy });
    component.category = 'TOLL';
    component.query = '  Anek Service  ';

    await component.createFromQuery();

    expect(spy).toHaveBeenCalledWith({ name: 'Anek Service', type: 'OTHER' });
  });

  it('selects nothing and alerts when the create fails', async () => {
    const alert = { error: jasmine.createSpy('error').and.resolveTo(undefined) };
    const component = makeComponent(
      {
        createExpensePayee: jasmine
          .createSpy('createExpensePayee')
          .and.returnValue(throwError(() => new Error('boom'))),
      },
      alert
    );
    component.query = 'Anek Service';

    await component.createFromQuery();

    expect(component.selectedId).toBeNull();
    expect(alert.error).toHaveBeenCalled();
  });

  it('renders the name carried on the bill for a payee no longer in the list', () => {
    // A garage retired after the bill was filed. The picker offers ACTIVE rows only, so without the
    // fallback this field would read as "no payee" on a bill that has one.
    const component = makeComponent();
    component.writeValue(404);
    component.fallbackName = 'Closed Garage';

    expect(component.selectedLabel).toBe('Closed Garage');
  });

  it('writes null through when cleared, because blank is a real answer', () => {
    const component = makeComponent();
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);
    component.writeValue(1);

    component.clear();

    expect(component.selectedId).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // OBRS-1576. The owner's ruling ("the อู่ซ่อมรถ field must show garages only") and the measurement
  // that ruling collides with (3 of his own 5 ค่าซ่อม payees are NOT garages) are both satisfied by
  // the same rule: the CLOSED list obeys the ruling, a typed query reaches everybody.
  describe('with [restrictToType]', () => {
    it('lists only that type before anything is typed', () => {
      const component = makeComponent();
      component.restrictToType = 'GARAGE';

      expect(component.visiblePayees.map((payee: AdminExpensePayeeDto) => payee.id)).toEqual([1]);
    });

    // The regression this exists to stop: hiding a payee that IS on record puts "+ add this one" in
    // front of the owner, and the duplicate that creates is what OBRS-1577 was built to prevent.
    it('still finds a payee of another type once it is typed', () => {
      const component = makeComponent();
      component.restrictToType = 'GARAGE';
      component.query = 'PTT Nong Chak';

      expect(component.visiblePayees.map((payee: AdminExpensePayeeDto) => payee.id)).toEqual([2]);
      expect(component.showCreateOption)
        .withContext('the name is already on record, so "add it" must not be the offer')
        .toBeFalse();
    });

    it('is inert when unset, which is what the general bill form passes', () => {
      const component = makeComponent();

      expect(component.visiblePayees.length).toBe(2);
    });
  });

  // OBRS-1576 AC4: the owner has a paper bill in the other hand. Enter takes the highlighted match;
  // with nothing matching, the same key is what adds the name they typed.
  describe('keyboard', () => {
    it('Enter selects the highlighted match', () => {
      const component = makeComponent();
      const onChange = jasmine.createSpy('onChange');
      component.registerOnChange(onChange);
      component.query = 'PTT';

      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('arrows move the highlight within the matches', () => {
      const component = makeComponent();

      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.activeIndex).toBe(1);
      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.activeIndex)
        .withContext('must not walk past the last match')
        .toBe(1);
      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.activeIndex).toBe(0);
    });

    it('re-typing resets the highlight, so Enter cannot take a row from the previous list', () => {
      const component = makeComponent();
      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.activeIndex).toBe(1);

      component.onQueryChange('อู่');

      expect(component.activeIndex).toBe(0);
    });

    it('Enter creates when nothing matches what was typed', () => {
      const created = { id: 9, name: 'อู่พรชัย', type: 'GARAGE', active: true };
      const createExpensePayee = jasmine
        .createSpy('createExpensePayee')
        .and.returnValue(of({ code: 200, message: 'OK', data: created }));
      const component = makeComponent({ createExpensePayee });
      component.query = 'อู่พรชัย';

      component.onQueryKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(createExpensePayee).toHaveBeenCalledWith({ name: 'อู่พรชัย', type: 'OTHER' });
    });

    // Without preventDefault the keystroke that picks a garage also submits the bill behind it.
    it('Enter does not reach the surrounding form', () => {
      const component = makeComponent();
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

      component.onQueryKeydown(event);

      expect(event.defaultPrevented).toBeTrue();
    });
  });
});
