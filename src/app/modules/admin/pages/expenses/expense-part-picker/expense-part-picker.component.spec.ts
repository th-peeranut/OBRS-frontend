import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ExpensePartPickerComponent } from './expense-part-picker.component';
import { AdminMaintenancePartDto } from '../../../../../services/admin/admin-api.service';

/**
 * OBRS-1613 AC1/AC2. Instantiated directly rather than through TestBed, matching
 * `ExpensePayeePickerComponent`'s own spec: everything worth asserting is the component's
 * decisions — what it offers, when it offers to CREATE, under which kind, and what it does with the
 * row it gets back — none of which the template changes.
 */
describe('ExpensePartPickerComponent', () => {
  /** One of the 13 seeded rows: it carries a `code`, so it is TRANSLATED on screen. */
  const SEEDED: AdminMaintenancePartDto = {
    id: 1,
    code: 'ENGINE_OIL',
    name: 'น้ำมันเครื่อง',
    kind: 'PART',
    active: true,
  };
  /** Typed by the owner: no code, Thai verbatim on every locale. */
  const OWNER_TYPED: AdminMaintenancePartDto = {
    id: 2,
    code: null,
    name: 'สายพานหน้าเครื่อง',
    kind: 'PART',
    active: true,
  };
  const LABOUR: AdminMaintenancePartDto = {
    id: 3,
    code: null,
    name: 'ค่าแรงเปลี่ยนสายพาน',
    kind: 'LABOUR',
    active: true,
  };

  function makeComponent(
    adminApi: Record<string, unknown> = {},
    alert: Record<string, unknown> = { error: jasmine.createSpy('error').and.resolveTo(undefined) },
    // `instant` echoes the key, which is what a MISSING translation looks like to
    // `maintenancePartLabel` — so by default a seeded row falls back to its stored Thai name.
    translate: Record<string, unknown> = { instant: (key: string) => key }
  ) {
    const component = new ExpensePartPickerComponent(
      { nativeElement: document.createElement('div') } as any,
      adminApi as any,
      alert as any,
      translate as any
    );
    component.parts = [SEEDED, OWNER_TYPED, LABOUR];
    return component as any;
  }

  it('shows the name a RETIRED part is carried under, instead of an empty field', () => {
    // Found by obrs-scrutinize round 2, 2026-08-29. The pickers are handed ACTIVE rows only, so an
    // edit of a bill whose part has since been retired resolves to nothing here. A blank field on a
    // line whose link is perfectly intact reads as "this line has no part", and the owner's natural
    // repair is to pick one - throwing away a correct historical link by hand. The bill carries the
    // server-resolved name for exactly this; `AdminExpenseItemDto#partName` says so and, until this
    // test existed, nothing wired it.
    const component = makeComponent();
    component.fallbackName = 'อะไหล่ที่เลิกใช้แล้ว';
    component.writeValue(404);

    expect(component.selectedLabel).toBe('อะไหล่ที่เลิกใช้แล้ว');
  });

  it('falls back to the placeholder, not to a stale name, when the line has no part at all', () => {
    const component = makeComponent();
    component.fallbackName = 'อะไหล่ที่เลิกใช้แล้ว';
    component.writeValue(null);

    expect(component.selectedLabel).toBe('');
  });

  it('prefers the LIVE row over the carried name when the part is still on the registry', () => {
    const component = makeComponent();
    component.fallbackName = 'ชื่อเก่าที่ไม่ควรชนะ';
    component.writeValue(2);

    expect(component.selectedLabel).toBe('สายพานหน้าเครื่อง');
  });

  it('offers everything before anything is typed', () => {
    const component = makeComponent();
    expect(component.visibleParts.length).toBe(3);
  });

  it('narrows on typing, across a space the stored name does not have', () => {
    const component = makeComponent();
    // "สายพาน หน้าเครื่อง" — the same part with a space in the middle, which is exactly the split
    // this registry exists to prevent.
    component.query = 'สายพาน หน้าเครื่อง';

    expect(component.visibleParts.map((p: AdminMaintenancePartDto) => p.id)).toEqual([2]);
  });

  it('finds a seeded row by the TRANSLATION on screen, not only by the Thai it is stored as', () => {
    // The owner reading an English screen types what they can see. Matching `name` alone would
    // return nothing and offer "+ add Engine oil" for a row that is already there.
    const component = makeComponent({}, undefined, {
      instant: (key: string) =>
        key === 'ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL' ? 'Engine oil' : key,
    });
    component.query = 'engine';

    expect(component.visibleParts.map((p: AdminMaintenancePartDto) => p.id)).toEqual([1]);
  });

  it('does NOT offer to create a name that is already on record, however it was spaced', () => {
    const component = makeComponent();
    component.query = '  สายพาน หน้าเครื่อง  ';

    expect(component.showCreateOption).toBeFalse();
  });

  it('offers to create a name that only PARTIALLY matches an existing one', () => {
    // "สายพาน" is a legitimately different entry from "สายพานหน้าเครื่อง"; refusing it because
    // something merely CONTAINS it would strand the owner with no way to write what the bill says.
    const component = makeComponent();
    component.query = 'สายพาน';

    expect(component.showCreateOption).toBeTrue();
  });

  it('offers no create affordance to a caller the server would refuse', () => {
    // An admin. Every other registry operation resolves through `getCurrentOwnerScope()` and works
    // for them; CREATE alone needs `getCurrentOwnerId()`, which throws.
    const component = makeComponent();
    component.canCreate = false;
    component.query = 'อะไหล่ที่ไม่เคยมี';

    expect(component.showCreateOption).toBeFalse();
  });

  it('creates under the kind the pressed button names, never a guessed one', async () => {
    // The reason this is a button per kind and not one button: the server runs `assertSameKind`
    // BEFORE its idempotent branch, so a name that exists under the other kind is a 409, not a
    // reuse. A bill carries parts and labour line by line, so there is nothing to infer from.
    const created: AdminMaintenancePartDto = {
      id: 9,
      code: null,
      name: 'ค่าแรงถ่ายน้ำมันเครื่อง',
      kind: 'LABOUR',
      active: true,
    };
    const createMaintenancePart = jasmine
      .createSpy('createMaintenancePart')
      .and.returnValue(of({ data: created }));
    const component = makeComponent({ createMaintenancePart });
    component.query = 'ค่าแรงถ่ายน้ำมันเครื่อง';

    await component.createFromQuery('LABOUR');

    expect(createMaintenancePart).toHaveBeenCalledWith({
      name: 'ค่าแรงถ่ายน้ำมันเครื่อง',
      kind: 'LABOUR',
    });
  });

  it('selects what it just created and keeps showing it before the parent refreshes', async () => {
    // Without `createdLocally` the field goes BLANK the instant the create succeeds: `select` sets
    // an id that `selectedLabel` cannot resolve, because `parts` is an @Input the parent has not
    // refreshed yet. The owner reads a blank field as "it did not save" and adds it again.
    const created: AdminMaintenancePartDto = {
      id: 9,
      code: null,
      name: 'ยางแท่นเครื่อง',
      kind: 'PART',
      active: true,
    };
    const component = makeComponent({
      createMaintenancePart: () => of({ data: created }),
    });
    component.query = 'ยางแท่นเครื่อง';

    await component.createFromQuery('PART');

    expect(component.selectedId).toBe(9);
    expect(component.selectedLabel).toBe('ยางแท่นเครื่อง');
  });

  it('emits the created row so the parent can revalidate its cache', async () => {
    const created: AdminMaintenancePartDto = {
      id: 9,
      code: null,
      name: 'ยางแท่นเครื่อง',
      kind: 'PART',
      active: true,
    };
    const component = makeComponent({ createMaintenancePart: () => of({ data: created }) });
    const emitted: AdminMaintenancePartDto[] = [];
    component.partCreated.subscribe((part: AdminMaintenancePartDto) => emitted.push(part));
    component.query = 'ยางแท่นเครื่อง';

    await component.createFromQuery('PART');

    expect(emitted).toEqual([created]);
  });

  it('shows the SERVER wording when the create is refused, and selects nothing', async () => {
    // The refusal that matters here is the 409 for a name that already exists under the other kind.
    // The server words it; replacing that with a generic "save failed" would leave the owner with
    // no way to know that the name is taken by the other kind.
    const error = jasmine.createSpy('error').and.resolveTo(undefined);
    // A real HttpErrorResponse, not a shape that looks like one: `extractApiErrorMessage` only
    // reads the body off an instance of it (OBRS-567 — it must never surface a transport message),
    // so a plain object would silently fall through to the generic fallback and the test would be
    // asserting nothing about the 409 wording.
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'MAINTENANCE_PART_KIND_CONFLICT', message: 'ชื่อนี้ถูกใช้แล้ว' },
    });
    const component = makeComponent(
      { createMaintenancePart: () => throwError(() => refusal) },
      { error }
    );
    component.query = 'น้ำมันเครื่อง';

    await component.createFromQuery('LABOUR');

    expect(error).toHaveBeenCalledWith('ชื่อนี้ถูกใช้แล้ว');
    expect(component.selectedId).toBeNull();
  });

  it('does not spend a request the server would refuse anyway', async () => {
    // `canCreate` is re-tested in the method and not only in the template: hiding a button is a UI
    // decision, and this is the line that actually spends the request.
    const createMaintenancePart = jasmine.createSpy('createMaintenancePart');
    const component = makeComponent({ createMaintenancePart });
    component.canCreate = false;
    component.query = 'อะไหล่ที่ไม่เคยมี';

    await component.createFromQuery('PART');

    expect(createMaintenancePart).not.toHaveBeenCalled();
  });

  it('clears to "not a part", which is a real answer and not an empty one', () => {
    // OBRS-1374 AC3: labour written as free text, service and sundry lines have no part at all.
    const component = makeComponent();
    const seen: (number | null)[] = [];
    component.registerOnChange((value: number | null) => seen.push(value));
    component.select(OWNER_TYPED);
    component.clear();

    expect(seen).toEqual([2, null]);
    expect(component.selectedLabel).toBe('');
  });

  it('Enter takes the highlighted row and never creates - a create needs a kind, a key has none', () => {
    const createMaintenancePart = jasmine.createSpy('createMaintenancePart');
    const component = makeComponent({ createMaintenancePart });
    component.query = 'สายพาน';
    component.activeIndex = 0;

    component.onQueryKeydown({ key: 'Enter', preventDefault: () => {} } as KeyboardEvent);

    expect(component.selectedId).toBe(2);
    expect(createMaintenancePart).not.toHaveBeenCalled();
  });

  it('Enter with nothing matched does nothing at all', () => {
    const createMaintenancePart = jasmine.createSpy('createMaintenancePart');
    const component = makeComponent({ createMaintenancePart });
    component.query = 'ไม่มีอะไรตรง';

    component.onQueryKeydown({ key: 'Enter', preventDefault: () => {} } as KeyboardEvent);

    expect(component.selectedId).toBeNull();
    expect(createMaintenancePart).not.toHaveBeenCalled();
  });

  it('re-cuts the highlight on every keystroke, or Enter would take an unrelated row', () => {
    const component = makeComponent();
    component.onQueryChange('ค่าแรง');
    component.activeIndex = 0;
    component.onQueryChange('สายพาน');

    expect(component.activeIndex).toBe(0);
    expect(component.visibleParts.map((p: AdminMaintenancePartDto) => p.id)).toEqual([2, 3]);
  });
});
