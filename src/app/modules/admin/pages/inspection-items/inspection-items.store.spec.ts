import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { InspectionItemsStore } from './inspection-items.store';
import { AdminInspectionItemDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function item(overrides: Partial<AdminInspectionItemDto> = {}): AdminInspectionItemDto {
  return {
    id: 1,
    code: 'engine_oil',
    displayOrder: 1,
    active: true,
    category: 'ENGINE_FLUIDS',
    categoryOrder: 1,
    translations: [
      { locale: 'en', label: 'Engine oil' },
      { locale: 'th', label: 'น้ำมันเครื่อง' },
      { locale: 'zh', label: '机油' },
    ],
    ...overrides,
  };
}

interface FakeApi {
  getInspectionItemsForManage: jasmine.Spy<() => Observable<ResponseAPI<AdminInspectionItemDto[]>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): InspectionItemsStore {
  const full: FakeApi = {
    getInspectionItemsForManage: jasmine
      .createSpy('getInspectionItemsForManage')
      .and.returnValue(of(ok([item()]))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new InspectionItemsStore(full as any, { authStatus$ } as any);
}

describe('InspectionItemsStore', () => {
  it('fetches inspection items on refresh() via getInspectionItemsForManage()', async () => {
    const getInspectionItemsForManage = jasmine
      .createSpy('getInspectionItemsForManage')
      .and.returnValue(of(ok([item()])));
    const store = makeStore({ getInspectionItemsForManage });

    await store.refresh();

    expect(getInspectionItemsForManage).toHaveBeenCalledTimes(1);
    expect(store.value).toEqual([item()]);
  });

  it('defaults to an empty list when the response has no data', async () => {
    const store = makeStore({
      getInspectionItemsForManage: jasmine
        .createSpy('getInspectionItemsForManage')
        .and.returnValue(of({ code: 200, message: 'OK' } as ResponseAPI<AdminInspectionItemDto[]>)),
    });

    await store.refresh();

    expect(store.value).toEqual([]);
  });

  it('replays the last-fetched list synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({});
    await store.refresh();

    let received: AdminInspectionItemDto[] | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received).toEqual([item()]);
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getInspectionItemsForManage = jasmine
      .createSpy('getInspectionItemsForManage')
      .and.returnValue(of(ok([item()])));
    const store = makeStore({ getInspectionItemsForManage });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getInspectionItemsForManage.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value).toEqual([item()]); // stale value retained
    expect(errored).toBeTrue();
  });

  it('mutate() applies a transform to the cached value immediately (optimistic update)', async () => {
    const store = makeStore({});
    await store.refresh();

    store.mutate((list) => [...list, item({ id: 2, code: 'wheel_nuts' })]);

    expect(store.value?.length).toBe(2);
    expect(store.value?.[1].id).toBe(2);
  });

  it('clears the cached items on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore({}, authStatus$);
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });
});
