import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { RouteFormModalComponent } from './route-form-modal.component';
import { AdminRouteDto } from '../../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const ROUTE_ROW = {
  id: 1,
  slug: 'a-b',
  label: 'A to B',
  description: '-',
  status: 'ACTIVE',
  statusCode: 'active',
  updatedAt: '-',
};

const STATUS_OPTIONS = [
  { code: 'active', label: 'ACTIVE' },
  { code: 'suspended', label: 'SUSPENDED' },
];

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

function makeComponent(getRouteById$: Subject<ResponseAPI<AdminRouteDto>>) {
  const adminApi = {
    getRouteById: jasmine.createSpy('getRouteById').and.returnValue(getRouteById$.asObservable()),
    createRoute: jasmine.createSpy('createRoute').and.returnValue(of({ code: 200, message: 'OK', data: null })),
    updateRouteById: jasmine
      .createSpy('updateRouteById')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new RouteFormModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.statusOptions = STATUS_OPTIONS;
  return { component, adminApi, alert };
}

describe('RouteFormModalComponent', () => {
  describe('openCreate', () => {
    it('opens with the first status option as the default and resets the form', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());

      component.openCreate();

      expect((component as any).isOpen).toBeTrue();
      expect((component as any).isEditMode).toBeFalse();
      expect((component as any).routeForm.get('status').value).toBe('active');
      expect((component as any).routeForm.get('slug').value).toBe('');
    });

    it('falls back to "active" when no status options are provided', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.statusOptions = [];

      component.openCreate();

      expect((component as any).routeForm.get('status').value).toBe('active');
    });

    // Regression: the create-route form must require the Thai route name.
    it('requires the Thai route name (thLabel)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.openCreate();
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
  });

  describe('openEdit', () => {
    // Regression: the modal must open immediately on Edit, not after the detail
    // fetch resolves — otherwise a slow SIT response leaves a blank ~4s wait.
    it('opens the edit modal before the route detail fetch resolves', () => {
      const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
      const { component } = makeComponent(getRouteById$);

      void component.openEdit({ ...ROUTE_ROW });

      // Subject has not emitted yet — the fetch is still in flight.
      expect((component as any).isOpen).toBeTrue();
      expect((component as any).isEditMode).toBeTrue();
      expect((component as any).isEditDetailLoading).toBeTrue();
      // The form is already usable with the row data we had in hand.
      expect((component as any).routeForm.get('enLabel').value).toBe('A to B');
    });

    it('patches server detail into untouched fields without clobbering user input', async () => {
      const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
      const { component } = makeComponent(getRouteById$);

      const promise = component.openEdit({ ...ROUTE_ROW });

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

    it('ignores a stale detail response once the modal has been closed', async () => {
      const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
      const { component } = makeComponent(getRouteById$);

      const promise = component.openEdit({ ...ROUTE_ROW });
      (component as any).closeModal(true);

      getRouteById$.next(detailResponse());
      getRouteById$.complete();
      await promise;

      // The modal stays closed and the loading flag was already cleared by close.
      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isEditDetailLoading).toBeFalse();
    });
  });

  describe('isFieldInvalid', () => {
    it('is false until the field is touched/dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.openCreate();

      expect((component as any).isFieldInvalid('enLabel')).toBeFalse();

      (component as any).routeForm.get('enLabel').markAsTouched();
      expect((component as any).isFieldInvalid('enLabel')).toBeTrue();
    });
  });

  describe('closeModal', () => {
    it('does not close while submitting unless forced', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.openCreate();
      (component as any).isSubmitting = true;

      (component as any).closeModal();
      expect((component as any).isOpen).toBeTrue();

      (component as any).closeModal(true);
      expect((component as any).isOpen).toBeFalse();
    });
  });

  describe('submitRoute', () => {
    function fillValidForm(component: RouteFormModalComponent): void {
      const form = (component as any).routeForm;
      form.get('slug').setValue('a-b');
      form.get('status').setValue('active');
      form.get('enLabel').setValue('A to B');
      form.get('thLabel').setValue('เอ ถึง บี');
    }

    it('creates a route, closes the modal, alerts success, and emits saved', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.openCreate();
      fillValidForm(component);

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitRoute();

      expect(adminApi.createRoute).toHaveBeenCalled();
      expect((component as any).isOpen).toBeFalse();
      expect(alert.success).toHaveBeenCalled();
      expect(savedSpy).toHaveBeenCalledWith({ slug: 'a-b' });
    });

    it('updates a route by id when in edit mode', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      void component.openEdit({ ...ROUTE_ROW });
      fillValidForm(component);

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitRoute();

      expect(adminApi.updateRouteById).toHaveBeenCalledWith(1, jasmine.any(Object));
      expect(savedSpy).toHaveBeenCalledWith({ slug: 'a-b' });
    });

    it('marks all fields touched and does not submit when the form is invalid', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminRouteDto>>());
      component.openCreate();

      await (component as any).submitRoute();

      expect(adminApi.createRoute).not.toHaveBeenCalled();
      expect((component as any).routeForm.get('thLabel').touched).toBeTrue();
    });

    it('closes the modal and alerts an error, without emitting saved, on failure', async () => {
      const getRouteById$ = new Subject<ResponseAPI<AdminRouteDto>>();
      const adminApi = {
        getRouteById: jasmine.createSpy('getRouteById').and.returnValue(getRouteById$.asObservable()),
        createRoute: jasmine.createSpy('createRoute').and.returnValue(throwError(() => new Error('boom'))),
        updateRouteById: jasmine.createSpy('updateRouteById'),
      };
      const alert = {
        success: jasmine.createSpy('success').and.resolveTo(undefined),
        error: jasmine.createSpy('error').and.resolveTo(undefined),
      };
      const component = new RouteFormModalComponent(
        adminApi as any,
        new FormBuilder(),
        alert as any,
        createTranslateStub()
      );
      component.statusOptions = STATUS_OPTIONS;
      component.openCreate();
      fillValidForm(component);

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitRoute();

      expect((component as any).isOpen).toBeFalse();
      expect(alert.error).toHaveBeenCalledWith('boom');
      expect(savedSpy).not.toHaveBeenCalled();
    });
  });
});
