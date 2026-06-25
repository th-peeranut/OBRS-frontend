import { PassengerSeatVanComponent } from './passenger-seat-van.component';

describe('PassengerSeatVanComponent', () => {
  let component: PassengerSeatVanComponent;

  beforeEach(() => {
    component = new PassengerSeatVanComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('seatClicked output', () => {
    beforeEach(() => {
      component.gender = 'female';
      component.takenSeats = [];
      component.availableSeatNumbers = null; // all seats available
    });

    it('emits the clicked seat label on first click (select)', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('3');

      expect(emitted).toEqual(['3']);
    });

    it('emits the SAME seat label again on a second click (deselect) — never emits empty string', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('3'); // select
      component.setPassengerSeatPosition('3'); // deselect

      expect(emitted).toEqual(['3', '3']);
      expect(emitted).not.toContain('');
    });

    it('does NOT emit seatClicked when gender is empty (guard)', () => {
      component.gender = '';
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('3');

      expect(emitted.length).toBe(0);
    });

    it('does NOT emit seatClicked when seat is taken by another passenger', () => {
      component.takenSeats = ['5'];
      component.currentSeat = '';
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('5');

      expect(emitted.length).toBe(0);
    });

    it('passengerSeatPositionOnChange still emits empty string on deselect (existing behavior unchanged)', () => {
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('3'); // select → emits '3'
      component.setPassengerSeatPosition('3'); // deselect → emits ''

      expect(emitted).toEqual(['3', '']);
    });
  });
});
