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

describe('BoardingListPageComponent — thin route wrapper (OBRS-130)', () => {
  it('reads scheduleId from the route once and exposes it for the [scheduleId] input binding', () => {
    const component = new BoardingListPageComponent(createActivatedRouteStub(42));

    expect(component['scheduleId']).toBe(42);
  });
});
