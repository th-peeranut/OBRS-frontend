import { of, throwError } from 'rxjs';
import { StopsPageComponent } from './stops-page.component';
import { createTranslateStub } from '../../../../testing/test-stubs';

const STOP_LIST = [
  {
    id: 7,
    slug: 'nong_chak',
    status: { slug: 'active', translations: { th: { label: 'ใช้งาน' } } },
    stopType: { slug: 'pickup', translations: { th: { label: 'จุดรับ' } } },
    translations: { th: { label: 'หนองชาก' } },
  },
];

const STOP_DETAIL = {
  id: 7,
  slug: 'nong_chak',
  status: { slug: 'active' },
  stopType: { slug: 'pickup' },
  province: { slug: 'chonburi' },
  translations: { th: { label: 'หนองชาก' } },
  latitude: 13.5,
  longitude: 101.5,
  primaryPhotoUrl: null,
  addresses: {},
};

function makeComponent(overrides: Record<string, unknown> = {}) {
  const adminApi = {
    getStopsForAdmin: jasmine.createSpy('getStopsForAdmin').and.returnValue(of({ data: STOP_LIST })),
    getProvincesForAdmin: jasmine
      .createSpy('getProvincesForAdmin')
      .and.returnValue(of({ data: [{ slug: 'chonburi', translations: { th: { label: 'ชลบุรี' } } }] })),
    getLookups: jasmine.createSpy('getLookups').and.returnValue(
      of({
        data: [
          { id: 1, category: 'stop_status', slug: 'active', translations: { th: { label: 'ใช้งาน' } } },
          { id: 2, category: 'stop_type', slug: 'pickup', translations: { th: { label: 'จุดรับ' } } },
          { id: 3, category: 'route_status', slug: 'active', translations: { th: { label: 'ใช้งาน' } } },
        ],
      })
    ),
    getStopDetail: jasmine.createSpy('getStopDetail').and.returnValue(of({ data: STOP_DETAIL })),
    updateStop: jasmine.createSpy('updateStop').and.returnValue(of({ data: null })),
    uploadStopPhoto: jasmine
      .createSpy('uploadStopPhoto')
      .and.returnValue(of({ data: { primaryPhotoUrl: 'https://sb.example/o/public/b/stops/7/x.jpg' } })),
    deleteStopPhoto: jasmine.createSpy('deleteStopPhoto').and.returnValue(of({ data: null })),
    ...overrides,
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
  // The stub defaults to `currentLang: 'en'`; these fixtures are Thai-first, matching the
  // real data (every stop has a `th` label, most have no `en` one at all).
  const translate = createTranslateStub();
  translate.currentLang = 'th';
  const component = new StopsPageComponent(adminApi as any, alert as any, translate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, adminApi, alert, translate };
}

function fileEvent(file: File | null): Event {
  const input = { files: file ? [file] : [], value: 'C:\\fakepath\\photo.jpg' } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

describe('StopsPageComponent (OBRS-1022)', () => {
  it('loads stops, provinces and lookups on init', async () => {
    const { component, adminApi } = makeComponent();

    await component.load();

    expect(adminApi.getStopsForAdmin).toHaveBeenCalled();
    expect(component.rows.length).toBe(1);
    expect(component.rows[0].name).toBe('หนองชาก');
  });

  it('offers only stop_status / stop_type lookups, never every category', async () => {
    // The lookups endpoint returns EVERY category. Handing an owner `route_status` in the
    // stop-status dropdown would produce a 400 they cannot explain from the screen.
    const { component } = makeComponent();

    await component.load();

    expect(component.statusOptions.map((o: { code: string }) => o.code)).toEqual(['active']);
    expect(component.stopTypeOptions.map((o: { code: string }) => o.code)).toEqual(['pickup']);
  });

  it('surfaces a load failure instead of rendering an empty table as success', async () => {
    const { component } = makeComponent({
      getStopsForAdmin: jasmine.createSpy().and.returnValue(throwError(() => new Error('boom'))),
    });

    await component.load();

    expect(component.rows).toEqual([]);
    expect(component.errorMessage).toBeTruthy();
  });

  describe('the photo is never part of the form save', () => {
    it('save() posts a payload with no primaryPhotoUrl key', async () => {
      const { component, adminApi } = makeComponent();
      await component.load();
      await component.openStop(7);

      await component.save();

      const payload = adminApi.updateStop.calls.mostRecent().args[1];
      expect('primaryPhotoUrl' in payload).toBeFalse();
    });

    it('re-reads the stop after saving rather than trusting the local form', async () => {
      // The PUT is a full replace and the server normalizes (trim, drop blank-label locales),
      // so the screen must show what was STORED, not what was typed.
      const { component, adminApi } = makeComponent();
      await component.load();
      await component.openStop(7);
      adminApi.getStopDetail.calls.reset();

      await component.save();

      expect(adminApi.getStopDetail).toHaveBeenCalledWith(7);
    });
  });

  describe('photo upload', () => {
    it('uploads the picked file and shows the new URL without a full reload', async () => {
      const { component, adminApi } = makeComponent();
      await component.load();
      await component.openStop(7);

      await component.onPhotoSelected(fileEvent(new File(['x'], 'photo.jpg', { type: 'image/jpeg' })));

      expect(adminApi.uploadStopPhoto).toHaveBeenCalled();
      expect(component.selected.primaryPhotoUrl).toBe('https://sb.example/o/public/b/stops/7/x.jpg');
    });

    it('clears the file input so re-picking the SAME file after a failure still fires', async () => {
      // A file input does not emit `change` when the same file is chosen twice, so without
      // this the retry button is dead and looks like the upload silently succeeded.
      const { component } = makeComponent();
      await component.load();
      await component.openStop(7);

      const event = fileEvent(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
      await component.onPhotoSelected(event);

      expect((event.target as HTMLInputElement).value).toBe('');
    });

    it('does nothing when the picker is dismissed with no file', async () => {
      const { component, adminApi } = makeComponent();
      await component.load();
      await component.openStop(7);

      await component.onPhotoSelected(fileEvent(null));

      expect(adminApi.uploadStopPhoto).not.toHaveBeenCalled();
    });

    it('reports an upload failure instead of leaving the old photo on screen silently', async () => {
      const { component, alert } = makeComponent({
        uploadStopPhoto: jasmine.createSpy().and.returnValue(throwError(() => new Error('413'))),
      });
      await component.load();
      await component.openStop(7);

      await component.onPhotoSelected(fileEvent(new File(['x'], 'photo.jpg', { type: 'image/jpeg' })));

      expect(alert.error).toHaveBeenCalled();
    });
  });

  describe('photo removal', () => {
    it('asks first, then clears the photo', async () => {
      const { component, adminApi, alert } = makeComponent();
      await component.load();
      await component.openStop(7);
      component.selected.primaryPhotoUrl = 'https://sb.example/o/public/b/stops/7/x.jpg';

      await component.removePhoto();

      expect(alert.confirm).toHaveBeenCalled();
      expect(adminApi.deleteStopPhoto).toHaveBeenCalledWith(7);
      expect(component.selected.primaryPhotoUrl).toBeNull();
    });

    it('does not call the API when the confirm is declined', async () => {
      const { component, adminApi, alert } = makeComponent();
      alert.confirm.and.resolveTo(false);
      await component.load();
      await component.openStop(7);

      await component.removePhoto();

      expect(adminApi.deleteStopPhoto).not.toHaveBeenCalled();
    });
  });

  it('filters the table by keyword', async () => {
    const { component } = makeComponent();
    await component.load();

    component.onSearchKeywordChange('bang');
    expect(component.filteredRows.length).toBe(0);

    component.onSearchKeywordChange('nong');
    expect(component.filteredRows.length).toBe(1);
  });
});
