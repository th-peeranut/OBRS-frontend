import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PassengerSeatVanComponent } from './passenger-seat-van.component';
import { PassengerSeatModule } from '../../passenger-seat.module';

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

  describe('seatAttributes (OBRS-362)', () => {
    beforeEach(() => {
      component.seatAttributes = {
        '1': ['WHEELCHAIR'],
        '2': ['EXTRA_LEGROOM'],
        '3': ['WHEELCHAIR', 'EXTRA_LEGROOM'],
      };
    });

    it('attributesFor normalizes the label ("A1" -> "1") to match the numeric key', () => {
      expect(component.attributesFor('A1')).toEqual(['WHEELCHAIR']);
      expect(component.attributesFor('A2')).toEqual(['EXTRA_LEGROOM']);
    });

    it('attributesFor returns an empty array for a seat with no attributes', () => {
      expect(component.attributesFor('A4')).toEqual([]);
    });

    it('hasWheelchairBadge / hasExtraLegroomBadge read the per-seat attribute list', () => {
      expect(component.hasWheelchairBadge('A1')).toBeTrue();
      expect(component.hasExtraLegroomBadge('A1')).toBeFalse();
      expect(component.hasWheelchairBadge('A2')).toBeFalse();
      expect(component.hasExtraLegroomBadge('A2')).toBeTrue();
    });

    it('a seat can carry BOTH badges at once (e.g. front-row A1)', () => {
      expect(component.hasWheelchairBadge('A3')).toBeTrue();
      expect(component.hasExtraLegroomBadge('A3')).toBeTrue();
    });

    it('returns no badges when seatAttributes is null (default — every existing call site unaffected)', () => {
      component.seatAttributes = null;
      expect(component.attributesFor('A1')).toEqual([]);
      expect(component.hasWheelchairBadge('A1')).toBeFalse();
      expect(component.hasExtraLegroomBadge('A1')).toBeFalse();
    });
  });
});

// OBRS-362: real-DOM render check that a badge lands on the CORRECT seat
// box (van label form, 'A1'..'A13') — not merely that the logic method
// returns the right booleans in isolation.
describe('PassengerSeatVanComponent — badge placement (real DOM, OBRS-362)', () => {
  let fixture: ComponentFixture<PassengerSeatVanComponent>;
  let component: PassengerSeatVanComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassengerSeatModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PassengerSeatVanComponent);
    component = fixture.componentInstance;
  });

  it('the wheelchair badge renders inside seat A1 only, not any other seat box', () => {
    component.seatAttributes = { '1': ['WHEELCHAIR'] };
    fixture.detectChanges();

    const seatBoxes = fixture.debugElement.queryAll(By.css('app-passenger-seat-box'));
    const a1 = seatBoxes.find((box) => box.componentInstance.label === 'A1');
    const others = seatBoxes.filter((box) => box.componentInstance.label !== 'A1');

    expect(a1?.query(By.css('.seat-attribute-badge-wheelchair'))).not.toBeNull();
    for (const box of others) {
      expect(box.query(By.css('.seat-attribute-badge-wheelchair')))
        .withContext(`seat ${box.componentInstance.label}`)
        .toBeNull();
    }
  });

  it('a seat with both attributes renders both badges in the real DOM', () => {
    component.seatAttributes = { '2': ['WHEELCHAIR', 'EXTRA_LEGROOM'] };
    fixture.detectChanges();

    const seatBoxes = fixture.debugElement.queryAll(By.css('app-passenger-seat-box'));
    const a2 = seatBoxes.find((box) => box.componentInstance.label === 'A2');

    expect(a2?.query(By.css('.seat-attribute-badge-wheelchair'))).not.toBeNull();
    expect(a2?.query(By.css('.seat-attribute-badge-legroom'))).not.toBeNull();
  });
});
