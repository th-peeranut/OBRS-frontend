import { SimpleChange } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { MaintenancePartMergeModalComponent } from './maintenance-part-merge-modal.component';
import { AdminMaintenancePartDto } from '../../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const SOURCE: AdminMaintenancePartDto = {
  id: 1,
  code: null,
  name: 'จาระบี',
  kind: 'PART',
  active: true,
  mergedIntoId: null,
};
const CANDIDATE: AdminMaintenancePartDto = {
  id: 2,
  code: null,
  name: 'จาระบี PBR',
  kind: 'PART',
  active: true,
  mergedIntoId: null,
};

function makeComponent(impact$ = of({ data: { billLineCount: 3, planCount: 1 } })) {
  const adminApi = {
    getMaintenancePartMergeImpact: jasmine
      .createSpy('getMaintenancePartMergeImpact')
      .and.returnValue(impact$),
    mergeMaintenancePart: jasmine
      .createSpy('mergeMaintenancePart')
      .and.returnValue(of({ data: SOURCE })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new MaintenancePartMergeModalComponent(
    adminApi as any,
    alert as any,
    createTranslateStub()
  );
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function open(
  component: MaintenancePartMergeModalComponent,
  source: AdminMaintenancePartDto,
  candidates: AdminMaintenancePartDto[]
): void {
  (component as any).isOpen = true;
  (component as any).sourcePart = source;
  (component as any).candidates = candidates;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

describe('MaintenancePartMergeModalComponent', () => {
  /**
   * AC4: the confirm dialog must show the impact counts BEFORE the owner can confirm. Asserted at
   * both ends — no target chosen, and a target chosen but the fetch still in flight — because
   * either state confirming would be a merge the owner never saw the consequences of.
   */
  it('does not allow confirming before a target is chosen', () => {
    const { component } = makeComponent();
    open(component, SOURCE, [CANDIDATE]);

    expect((component as any).canConfirm).toBe(false);
  });

  it('does not allow confirming while the impact is still loading', () => {
    const { component } = makeComponent(of({ data: { billLineCount: 3, planCount: 1 } }));
    open(component, SOURCE, [CANDIDATE]);

    (component as any).onTargetChange('2');
    // Before the microtask resolves, isLoadingImpact is true and impact is still null.
    expect((component as any).isLoadingImpact).toBe(true);
    expect((component as any).canConfirm).toBe(false);
  });

  it('allows confirming only once the impact has loaded, and shows the counts it was given', async () => {
    const { component } = makeComponent(of({ data: { billLineCount: 3, planCount: 1 } }));
    open(component, SOURCE, [CANDIDATE]);

    (component as any).onTargetChange('2');
    await Promise.resolve();
    await Promise.resolve();

    expect((component as any).impact).toEqual({ billLineCount: 3, planCount: 1 });
    expect((component as any).canConfirm).toBe(true);
  });

  it('sends {targetId} to mergeMaintenancePart on the source id, not the target id, when confirmed', async () => {
    const { component, adminApi } = makeComponent(of({ data: { billLineCount: 2, planCount: 0 } }));
    open(component, SOURCE, [CANDIDATE]);
    (component as any).onTargetChange('2');
    await Promise.resolve();
    await Promise.resolve();

    await (component as any).confirmMerge();

    expect(adminApi.mergeMaintenancePart).toHaveBeenCalledWith(1, 2);
  });

  it('refreshes the parent structure and shows success after a merge', async () => {
    const { component, alert } = makeComponent(of({ data: { billLineCount: 2, planCount: 0 } }));
    open(component, SOURCE, [CANDIDATE]);
    (component as any).onTargetChange('2');
    await Promise.resolve();
    await Promise.resolve();

    await (component as any).confirmMerge();

    expect(alert.success).toHaveBeenCalled();
    expect(component.reloadStructure).toHaveBeenCalled();
  });

  it('surfaces the server message on a failed merge, without refreshing', async () => {
    const adminApi = {
      getMaintenancePartMergeImpact: jasmine
        .createSpy('getMaintenancePartMergeImpact')
        .and.returnValue(of({ data: { billLineCount: 1, planCount: 0 } })),
      mergeMaintenancePart: jasmine
        .createSpy('mergeMaintenancePart')
        .and.returnValue(
          throwError(
            () => new HttpErrorResponse({ status: 409, error: { message: 'Kind mismatch' } })
          )
        ),
    };
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new MaintenancePartMergeModalComponent(
      adminApi as any,
      alert as any,
      createTranslateStub()
    );
    component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
    open(component, SOURCE, [CANDIDATE]);
    (component as any).onTargetChange('2');
    await Promise.resolve();
    await Promise.resolve();

    await (component as any).confirmMerge();

    expect(alert.error).toHaveBeenCalledWith('Kind mismatch');
    expect(component.reloadStructure).not.toHaveBeenCalled();
  });

  it('resets the selection and impact on every fresh open, so a stale count cannot survive a re-open', () => {
    const { component } = makeComponent();
    open(component, SOURCE, [CANDIDATE]);
    (component as any).selectedTargetId = '2';
    (component as any).impact = { billLineCount: 9, planCount: 9 };

    open(component, SOURCE, [CANDIDATE]);

    expect((component as any).selectedTargetId).toBe('');
    expect((component as any).impact).toBeNull();
  });
});
