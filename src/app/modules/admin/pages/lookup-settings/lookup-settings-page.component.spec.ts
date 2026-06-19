import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { LookupSettingsPageComponent } from './lookup-settings-page.component';
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
