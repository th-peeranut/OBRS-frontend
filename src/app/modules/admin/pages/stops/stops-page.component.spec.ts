import { Subject, of, throwError } from 'rxjs';
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

// OBRS-1481: a stop a pin can point at AFTER it stopped being pickup-eligible. Kept out of
// STOP_LIST so the row-count assertions in the existing tests keep meaning what they meant.
const STALE_PIN_STOP = {
  id: 9,
  slug: 'lat_krabang_rest_stop_1',
  status: { slug: 'active', translations: { th: { label: 'ใช้งาน' } } },
  stopType: { slug: 'pickup', translations: { th: { label: 'จุดรับ' } } },
  translations: { th: { label: 'จุดพักรถลาดกระบัง 1' } },
};

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

// OBRS-1481: what GET /private/stops/return-stop-options answers - the stops a bus actually
// picks passengers up at. Deliberately does NOT contain id 9, so the AC-7 test below can prove a
// pin that fell out of the eligible set is still offered.
const RETURN_STOP_OPTIONS = [
  { id: 2, slug: 'ds293_chatuchak', translations: { th: { label: 'ดีเอส293 จตุจักร' } } },
  { id: 3, slug: 'pt_srinakarin', translations: { th: { label: 'ปตท. ศรีนครินทร์' } } },
];

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
    getReturnStopOptions: jasmine
      .createSpy('getReturnStopOptions')
      .and.returnValue(of({ data: RETURN_STOP_OPTIONS })),
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

  describe('OBRS-1298: row-click opens the modal', () => {
    it('onRowActivate opens the row for a plain click and marks it selected', async () => {
      const { component } = makeComponent();
      await component.load();
      spyOn(window, 'getSelection').and.returnValue({ toString: () => '' } as unknown as Selection);

      // openStop flips these flags SYNCHRONOUSLY (optimistic open — see the describe block
      // below), so they are already set the instant onRowActivate returns, well before the
      // fire-and-forget detail fetch it kicks off has resolved.
      component.onRowActivate(component.filteredRows[0], { target: document.createElement('td') } as unknown as MouseEvent);

      expect(component.isFormModalOpen).toBeTrue();
      expect(component.selectedStopId).toBe(7);
    });

    it('the guard blocks a click whose target is inside the "แก้ไข" button, so openStop is not double-invoked', async () => {
      // The button's OWN (click)="openStop(row.id)" handler is what opens the row from a
      // button click; the bubbled click also reaches the <tr>'s onRowActivate, which must
      // ignore it so openStop never fires a second time for the same interaction.
      const { component } = makeComponent();
      await component.load();
      spyOn(component, 'openStop').and.callThrough();

      const buttonTarget = document.createElement('button');
      buttonTarget.type = 'button';
      component.onRowActivate(component.filteredRows[0], { target: buttonTarget } as unknown as MouseEvent);

      expect(component.openStop).not.toHaveBeenCalled();
    });

    it('the guard blocks a click that ends a text selection', async () => {
      const { component } = makeComponent();
      await component.load();
      spyOn(component, 'openStop').and.callThrough();
      spyOn(window, 'getSelection').and.returnValue({ toString: () => 'nong chak' } as unknown as Selection);

      const cellTarget = document.createElement('td');
      component.onRowActivate(component.filteredRows[0], { target: cellTarget } as unknown as MouseEvent);

      expect(component.openStop).not.toHaveBeenCalled();
    });
  });

  describe('OBRS-1298: the modal opens optimistically', () => {
    it('flips isFormModalOpen/isDetailLoading synchronously, before the detail fetch resolves', () => {
      const { component } = makeComponent({
        getStopDetail: jasmine.createSpy().and.returnValue(new Subject().asObservable()),
      });

      void component.openStop(7);

      expect(component.isFormModalOpen).toBeTrue();
      expect(component.isDetailLoading).toBeTrue();
      expect(component.selectedStopId).toBe(7);
      // The detail hasn't arrived yet — the modal is open on the skeleton, not on data.
      expect(component.selected).toBeNull();
    });

    it('drops a stale response when a second row opens before the first one resolves', async () => {
      const first$ = new Subject<{ data: typeof STOP_DETAIL }>();
      const second$ = new Subject<{ data: typeof STOP_DETAIL }>();
      const { component, adminApi } = makeComponent({
        getStopDetail: jasmine
          .createSpy()
          .and.returnValues(first$.asObservable(), second$.asObservable()),
      });

      const firstOpen = component.openStop(7);
      const secondOpen = component.openStop(8);
      expect(component.selectedStopId).toBe(8);

      // Row 7's (now stale) response arrives late — it must not clobber row 8's modal.
      first$.next({ data: { ...STOP_DETAIL, id: 7, slug: 'row-a' } });
      first$.complete();
      await firstOpen;
      expect(component.selected).toBeNull();
      expect(component.selectedStopId).toBe(8);

      second$.next({ data: { ...STOP_DETAIL, id: 8, slug: 'row-b' } });
      second$.complete();
      await secondOpen;
      expect(component.selected?.slug).toBe('row-b');
      expect(adminApi.getStopDetail).toHaveBeenCalledTimes(2);
    });

    it('closes the modal on a fetch failure instead of leaving an empty dialog open', async () => {
      const { component, alert } = makeComponent({
        getStopDetail: jasmine.createSpy().and.returnValue(throwError(() => new Error('500'))),
      });

      await component.openStop(7);

      expect(component.isFormModalOpen).toBeFalse();
      expect(component.selected).toBeNull();
      expect(component.selectedStopId).toBeNull();
      expect(alert.error).toHaveBeenCalled();
    });
  });

  describe('OBRS-1298: closeDetail() and onLangChange', () => {
    it('closeDetail() resets the modal open flag along with the selected stop', async () => {
      const { component } = makeComponent();
      await component.load();
      await component.openStop(7);

      component.closeDetail();

      expect(component.isFormModalOpen).toBeFalse();
      expect(component.selected).toBeNull();
      expect(component.selectedStopId).toBeNull();
    });

    it('re-fetches the open stop on language change without closing the modal', async () => {
      const { component, adminApi, translate } = makeComponent();
      await component.load();
      await component.openStop(7);
      adminApi.getStopDetail.calls.reset();

      translate.onLangChange.next({ lang: 'en' });

      // The re-fetch (openStop) runs synchronously up to its first await, same as the
      // optimistic-open path — the modal must stay open, not flicker shut, while it reloads.
      expect(component.isFormModalOpen).toBeTrue();
      expect(adminApi.getStopDetail).toHaveBeenCalledWith(7);
    });
  });

  // ---------------------------------------------------------------------------
  // OBRS-1481: the return boarding pin
  // ---------------------------------------------------------------------------

  it('offers the pickup-eligible stops the server returned', async () => {
    const { component } = makeComponent();

    await component.load();

    expect(component.returnStopOptions.map((o: { id: number }) => o.id)).toEqual([2, 3]);
  });

  it('keeps a saved pin on the list even after it stopped being pickup-eligible', async () => {
    // AC-7. boarding_type is edited elsewhere, so a pin made months ago can fall out of the
    // eligible set. If the dropdown simply dropped it, the select would render with nothing
    // chosen and the owner's next save would post null - deleting a pin they never touched.
    const { component, adminApi } = makeComponent();
    adminApi.getStopsForAdmin.and.returnValue(of({ data: [...STOP_LIST, STALE_PIN_STOP] }));
    adminApi.getStopDetail.and.returnValue(of({ data: { ...STOP_DETAIL, returnStopId: 9 } }));

    await component.load();
    await component.openStop(7);

    expect(component.selected.returnStopId).toBe(9);
    expect(component.returnStopOptions.map((o: { id: number }) => o.id)).toContain(9);
    expect(component.returnStopOptions.find((o: { id: number }) => o.id === 9).label).toBe(
      'จุดพักรถลาดกระบัง 1'
    );
  });
});