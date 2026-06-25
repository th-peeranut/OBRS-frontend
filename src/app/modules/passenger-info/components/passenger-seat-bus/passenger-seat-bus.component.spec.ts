import { PassengerSeatBusComponent } from './passenger-seat-bus.component';

describe('PassengerSeatBusComponent', () => {
  let component: PassengerSeatBusComponent;

  beforeEach(() => {
    component = new PassengerSeatBusComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('seatClicked output', () => {
    beforeEach(() => {
      component.gender = 'male';
      component.takenSeats = [];
    });

    it('emits the clicked seat label on first click (select)', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('A1');

      expect(emitted).toEqual(['A1']);
    });

    it('emits the SAME seat label again on a second click (deselect) — never emits empty string', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('A1'); // select
      component.setPassengerSeatPosition('A1'); // deselect

      expect(emitted).toEqual(['A1', 'A1']);
      expect(emitted).not.toContain('');
    });

    it('does NOT emit seatClicked when gender is empty (guard)', () => {
      component.gender = '';
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('A1');

      expect(emitted.length).toBe(0);
    });

    it('does NOT emit seatClicked when seat is taken by another passenger', () => {
      component.takenSeats = ['B2'];
      component.currentSeat = '';
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B2');

      expect(emitted.length).toBe(0);
    });

    it('passengerSeatPositionOnChange still emits empty string on deselect (existing behavior unchanged)', () => {
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('A1'); // select → emits 'A1'
      component.setPassengerSeatPosition('A1'); // deselect → emits ''

      expect(emitted).toEqual(['A1', '']);
    });
  });
});
