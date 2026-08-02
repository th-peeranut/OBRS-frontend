import { BoardingListPageComponent } from './boarding-list-page.component';

function createActivatedRouteStub(scheduleId: number): any {
  return {
    snapshot: {
      paramMap: {
        get: (key: string) => (key === 'scheduleId' ? String(scheduleId) : null),
      },
    },
  };
}

function createAuthServiceStub(isSalesperson: boolean): any {
  return { hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(isSalesperson) };
}

describe('BoardingListPageComponent — thin route wrapper (OBRS-130)', () => {
  it('reads scheduleId from the route once and exposes it for the [scheduleId] input binding', () => {
    const component = new BoardingListPageComponent(createActivatedRouteStub(42), createAuthServiceStub(false));

    expect(component['scheduleId']).toBe(42);
  });

  // OBRS-960 — view-selection idiom for app-driver-cash-panel.
  describe('isSalesperson — gates app-driver-cash-panel (view selection, not authorization)', () => {
    it('is true for a salesperson viewer', () => {
      const authService = createAuthServiceStub(true);
      const component = new BoardingListPageComponent(createActivatedRouteStub(42), authService);

      expect(component['isSalesperson']).toBeTrue();
      expect(authService.hasAnyRole).toHaveBeenCalledWith(['salesperson']);
    });

    it('is false for a driver-only viewer', () => {
      const component = new BoardingListPageComponent(createActivatedRouteStub(42), createAuthServiceStub(false));

      expect(component['isSalesperson']).toBeFalse();
    });
  });
});
