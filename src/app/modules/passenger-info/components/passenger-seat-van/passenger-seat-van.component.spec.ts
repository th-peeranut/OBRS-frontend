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

  describe('seatOwners (shared seat map, OBRS-242)', () => {
    beforeEach(() => {
      component.gender = '';
      component.takenSeats = [];
      component.availableSeatNumbers = null;
      component.seatGenders = null;
      component.seatOwners = { '1': { label: '1', gender: 'MALE' }, '3': { label: '2', gender: 'FEMALE' } };
    });

    it('seatGenderFor takes priority over seatGenders/single-select and reads the owner map', () => {
      expect(component.seatGenderFor('1')).toBe('MALE');
      expect(component.seatGenderFor('3')).toBe('FEMALE');
      expect(component.seatGenderFor('2')).toBe('');
    });

    it('isSeatActive is true for every owned seat, not just the active passenger', () => {
      expect(component.isSeatActive('1')).toBeTrue();
      expect(component.isSeatActive('3')).toBeTrue();
      expect(component.isSeatActive('2')).toBeFalse();
    });

    it('ownerLabelFor returns the owning passenger badge, null when unowned', () => {
      expect(component.ownerLabelFor('1')).toBe('1');
      expect(component.ownerLabelFor('3')).toBe('2');
      expect(component.ownerLabelFor('2')).toBeNull();
    });

    it("isActiveOwnerFor is true only for the active passenger's own currentSeat", () => {
      component.currentSeat = '1';
      expect(component.isActiveOwnerFor('1')).toBeTrue();
      expect(component.isActiveOwnerFor('3')).toBeFalse();
    });

    it('clicking a seat owned by another passenger is rejected (takenSeats still guards)', () => {
      component.currentSeat = '';
      component.takenSeats = ['1', '3'];
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('1');

      expect(emitted.length).toBe(0);
    });

    it('clicking an available seat assigns it to the active passenger (emits the new seat)', () => {
      component.currentSeat = '1';
      component.takenSeats = ['3'];
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('7');

      expect(emitted).toEqual(['7']);
    });

    it("clicking the active passenger's own seat clears it (deselect)", () => {
      // Mirror the real data flow: the host binds [currentSeat] to the
      // active passenger's seat, which Angular delivers via ngOnChanges and
      // syncs into `isSelected` — the flag setPassengerSeatPosition toggles.
      component.currentSeat = '1';
      component.ngOnChanges({ currentSeat: { currentValue: '1' } } as any);

      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('1');

      expect(emitted).toEqual(['']);
    });

    it('emits seatClicked even when gender is empty (owner map drives the guard)', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('7');

      expect(emitted).toEqual(['7']);
    });
  });
});
