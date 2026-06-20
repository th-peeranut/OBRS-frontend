import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { LookupSettingsPageComponent } from './lookup-settings-page.component';
import { AdminLookupDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

interface Entry {
  id: number;
  category: string;
  slug: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
}

function entry(partial: Partial<Entry>): Entry {
  return {
    id: 1,
    category: 'role_status',
    slug: 'active',
    enLabel: 'Active',
    enDescription: '-',
    thLabel: 'ใช้งาน',
    thDescription: '-',
    ...partial,
  };
}

function makeComponent() {
  const adminApi = {
    updateLookup: jasmine
      .createSpy('updateLookup')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
    createLookup: jasmine
      .createSpy('createLookup')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const store = {
    data$: new BehaviorSubject<unknown>(null),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return true;
    },
  };
  const component = new LookupSettingsPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub() as any,
    store as any
  );
  return { component, adminApi, alert, store };
}

describe('LookupSettingsPageComponent', () => {
  it('groups entries by category, sorted by category name', () => {
    const { component } = makeComponent();
    (component as any).entries = [
      entry({ category: 'role_status', slug: 'active' }),
      entry({ category: 'booking_status', slug: 'paid' }),
      entry({ category: 'role_status', slug: 'inactive' }),
    ];

    const groups = (component as any).groupedEntries as Array<{ category: string; items: Entry[] }>;
    expect(groups.map((g) => g.category)).toEqual(['booking_status', 'role_status']);
    expect(groups[1].items.length).toBe(2);
  });

  it('warns and skips the API when the form is invalid', async () => {
    const { component, adminApi, alert } = makeComponent();
    (component as any).openCreateModal();

    await (component as any).submitLookup();

    expect(alert.warning).toHaveBeenCalled();
    expect(adminApi.createLookup).not.toHaveBeenCalled();
  });

  it('optimistically reflects an edit in the table before the re-fetch', async () => {
    const { component, store } = makeComponent();
    (component as any).entries = [entry({ id: 5, category: 'role_status', slug: 'active', enLabel: 'Active' })];

    (component as any).openEditModal((component as any).entries[0]);
    const form = (component as any).lookupForm;
    form.get('enLabel').setValue('Enabled');

    await (component as any).submitLookup();

    const updated = (component as any).entries.find((e: Entry) => e.slug === 'active');
    expect(updated.enLabel).toBe('Enabled');
    // Re-fetch still runs in the background to reconcile with the server.
    expect(store.refresh).toHaveBeenCalled();
  });
});

describe('LookupSettingsPageComponent confirmDelete — composite category+slug key', () => {
  // Regression for SIT issue #14: the optimistic filter in confirmDelete() uses
  // BOTH category AND slug as a composite key.  Dropping either half would remove
  // the wrong row (a same-slug/different-category entry would disappear, or a
  // same-category/different-slug entry would be wrongly kept).

  /** Flush all pending microtasks so async callbacks run before the next assertion. */
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function makeDeleteComponent() {
    const data$ = new BehaviorSubject<AdminLookupDto[] | null>(null);
    const store = {
      data$,
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      mutate: jasmine.createSpy('mutate').and.callFake(
        (transform: (list: AdminLookupDto[]) => AdminLookupDto[]) => {
          const current = data$.value;
          if (current !== null) {
            data$.next(transform(current));
          }
        }
      ),
      get hasValue() {
        return data$.value !== null;
      },
    };
    const adminApi = {
      updateLookup: jasmine
        .createSpy('updateLookup')
        .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
      createLookup: jasmine
        .createSpy('createLookup')
        .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
      deleteLookup: jasmine
        .createSpy('deleteLookup')
        .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
    };
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
      warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    };
    const component = new LookupSettingsPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub() as any,
      store as any
    );
    return { component, store, alert, adminApi };
  }

  it(
    'removes only the entry matching BOTH category AND slug — same-slug/different-category entry survives (before refresh resolves)',
    async () => {
      const { component, store, alert } = makeDeleteComponent();

      // Two entries share slug='active' but differ in category.
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'role_status', slug: 'active', translations: {} },
        { id: 2, category: 'booking_status', slug: 'active', translations: {} },
        // Third entry: same category as target, different slug — must also survive.
        { id: 3, category: 'role_status', slug: 'inactive', translations: {} },
      ];

      // Drive the store subscription manually (mirrors ngOnInit behaviour).
      store.data$.subscribe((data: AdminLookupDto[] | null) => {
        if (data) {
          (component as any).entries = data.map((lookup: AdminLookupDto) =>
            (component as any).toLookupEntry(lookup)
          );
        }
      });
      store.data$.next(lookups);

      // Keep refresh pending so we assert before reconcile lands.
      let resolveRefresh!: () => void;
      store.refresh.and.returnValue(new Promise<void>((r) => { resolveRefresh = r; }));
      alert.success.and.resolveTo(undefined);

      // Target: category='role_status', slug='active' (id=1).
      (component as any).selectedEntry = {
        id: 1,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: '-',
        thLabel: '-',
        thDescription: '-',
      };
      (component as any).isDeleteModalOpen = true;

      const done = (component as any).confirmDelete();
      await flush();

      const entries: Array<{ id: number }> = (component as any).entries;

      // Targeted entry (id=1) must be gone.
      expect(entries.every((e) => e.id !== 1))
        .withContext('deleted entry id=1 (role_status/active) must be absent')
        .toBeTrue();

      // Same slug 'active' but different category 'booking_status' (id=2) must survive.
      expect(entries.some((e) => e.id === 2))
        .withContext('entry id=2 (booking_status/active) shares slug but must survive')
        .toBeTrue();

      // Same category 'role_status' but different slug 'inactive' (id=3) must also survive.
      expect(entries.some((e) => e.id === 3))
        .withContext('entry id=3 (role_status/inactive) shares category but must survive')
        .toBeTrue();

      resolveRefresh();
      await done;
    }
  );
});
