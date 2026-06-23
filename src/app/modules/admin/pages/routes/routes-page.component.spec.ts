import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { RoutesPageComponent } from './routes-page.component';
import { AdminRouteDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

const ROUTE_ROW = {
  id: 1,
  slug: 'a-b',
  label: 'A to B',
  description: '-',
  status: 'ACTIVE',
  statusCode: 'active',
  updatedAt: '-',
};

function detailResponse(): ResponseAPI<AdminRouteDto> {
  return {
    code: 200,
    message: 'OK',
    data: {
      id: 1,
      slug: 'a-b',
      status: 'active',
      translations: [
        { locale: 'en', label: 'Server EN', description: 'Server EN desc' },
        { locale: 'th', label: 'TH label', description: 'TH desc' },
      ],
    },
  };
}

function makeStoreStub() {
  return {
    data$: new BehaviorSubject<unknown>(null),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return false;
    },
  };
}

function makeComponent(getRouteById$: Subject<ResponseAPI<AdminRouteDto>>) {
  const adminApi = {
    getRouteById: jasmine.createSpy('getRouteById').and.returnValue(getRouteById$.asObservable()),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new RoutesPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    makeStoreStub() as any
  );
  return { component, adminApi };
}

describe('RoutesPageComponent edit modal', () => {
  // Regression: the modal must open immediately on Edit, not after the detail
  // fetch resolves — otherwise a slow SIT response leaves a blank ~4s wait.
  it('opens the edit modal before the route detail fetch resolves', () => {
    const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
    const { component } = makeComponent(getRouteById$);

    void (component as any).openEditModal({ ...ROUTE_ROW });

    // Subject has not emitted yet — the fetch is still in flight.
    expect((component as any).isRouteFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).isEditDetailLoading).toBeTrue();
    // The form is already usable with the row data we had in hand.
    expect((component as any).routeForm.get('enLabel').value).toBe('A to B');
  });

  // Regression: the create-route form must require the Thai route name.
  it('requires the Thai route name (thLabel)', () => {
    const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
    (component as any).openCreateModal();
    const form = (component as any).routeForm;

    form.get('slug').setValue('a-b');
    form.get('status').setValue('active');
    form.get('enLabel').setValue('A to B');
    form.get('thLabel').setValue('');
    expect(form.get('thLabel').valid).toBeFalse();
    expect(form.valid).toBeFalse();

    form.get('thLabel').setValue('เอ ถึง บี');
    expect(form.valid).toBeTrue();
  });

  it('patches server detail into untouched fields without clobbering user input', async () => {
    const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
    const { component } = makeComponent(getRouteById$);

    const promise = (component as any).openEditModal({ ...ROUTE_ROW });

    // User starts editing the English label before the detail arrives.
    const form = (component as any).routeForm;
    form.get('enLabel').setValue('User typed');
    form.get('enLabel').markAsDirty();

    getRouteById$.next(detailResponse());
    getRouteById$.complete();
    await promise;

    // Untouched Thai field is filled from the server detail...
    expect(form.get('thLabel').value).toBe('TH label');
    // ...but the field the user was editing is preserved.
    expect(form.get('enLabel').value).toBe('User typed');
    expect((component as any).isEditDetailLoading).toBeFalse();
  });
});
