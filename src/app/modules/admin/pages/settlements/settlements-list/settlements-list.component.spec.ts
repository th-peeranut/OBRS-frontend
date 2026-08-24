import { SettlementsListComponent } from './settlements-list.component';
import { SettlementPendingItemDto } from '../../../../../shared/interfaces/settlement.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeItem(overrides: Partial<SettlementPendingItemDto> = {}): SettlementPendingItemDto {
  return {
    scheduleId: 1,
    originStopId: 5,
    originStopSlug: 'nong_chak',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    routeSlug: 'bkk-cnx',
    liveTotalAmount: '1000.00',
    ticketCount: 4,
    ...overrides,
  };
}

describe('SettlementsListComponent', () => {
  it('should create', () => {
    const component = new SettlementsListComponent(createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('emits the scheduleId on row activation, ignoring clicks on the row action button', () => {
    const component = new SettlementsListComponent(createTranslateStub());
    const spy = jasmine.createSpy('rowClick');
    component.rowClick.subscribe(spy);

    const row = document.createElement('tr');
    const button = document.createElement('button');
    row.appendChild(button);

    component['onRowActivate'](7, { target: row } as unknown as MouseEvent);
    expect(spy).toHaveBeenCalledWith(7);

    spy.calls.reset();
    component['onRowActivate'](7, { target: button } as unknown as MouseEvent);
    expect(spy).not.toHaveBeenCalled(); // interactive-target click is ignored
  });

  // OBRS-1592: the currency argument is gone (the backend emits THB and nothing
  // else), and a whole amount no longer carries `.00` — satang show only when
  // there are satang. The stub reports `en`, so the unit leads.
  it('formats a decimal-string amount through the one shared formatter', () => {
    const component = new SettlementsListComponent(createTranslateStub());
    expect(component['formatMoney']('0.00')).toBe('THB 0');
    expect(component['formatMoney']('1234.5')).toBe('THB 1,234.50');
  });

  it('trackByScheduleId tracks by scheduleId', () => {
    const component = new SettlementsListComponent(createTranslateStub());
    expect(component['trackByScheduleId'](0, makeItem({ scheduleId: 42 }))).toBe(42);
  });
});
