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

  describe('seatGenderFor (single-select mode, seatGenders=null)', () => {
    beforeEach(() => {
      component.gender = 'MALE';
      component.seatGenders = null;
      component.takenSeats = [];
    });

    it('returns gender for the currently selected seat', () => {
      component.setPassengerSeatPosition('B1');
      expect(component.seatGenderFor('B1')).toBe('MALE');
    });

    it('returns empty string for non-selected seats', () => {
      component.setPassengerSeatPosition('B1');
      expect(component.seatGenderFor('B2')).toBe('');
    });
  });

  describe('seatGenderFor (multi-select mode, seatGenders set)', () => {
    beforeEach(() => {
      component.seatGenders = { B1: 'MALE', B3: 'FEMALE' };
      component.takenSeats = [];
    });

    it('returns the gender from the map for a mapped seat', () => {
      expect(component.seatGenderFor('B1')).toBe('MALE');
      expect(component.seatGenderFor('B3')).toBe('FEMALE');
    });

    it('returns empty string for a seat not in the map', () => {
      expect(component.seatGenderFor('B2')).toBe('');
    });
  });

  describe('isSeatActive', () => {
    it('single-select: true only for the isSelected seat', () => {
      component.gender = 'MALE';
      component.seatGenders = null;
      component.takenSeats = [];
      component.setPassengerSeatPosition('B1');
      expect(component.isSeatActive('B1')).toBeTrue();
      expect(component.isSeatActive('B2')).toBeFalse();
    });

    it('multi-select: true for seats in the seatGenders map', () => {
      component.seatGenders = { B1: 'MALE', B3: 'FEMALE' };
      expect(component.isSeatActive('B1')).toBeTrue();
      expect(component.isSeatActive('B3')).toBeTrue();
      expect(component.isSeatActive('B2')).toBeFalse();
    });

    it('multi-select: emits seatClicked even when gender input is empty (map drives guard)', () => {
      // In multi-select mode the gender string is irrelevant — the seatGenders map guards.
      component.gender = '';
      component.seatGenders = { B1: 'MALE' };
      component.takenSeats = [];
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B2'); // not in map, but map is non-null → click allowed
      expect(emitted).toEqual(['B2']);
    });
  });
});
