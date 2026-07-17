import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PassengerSeatBusComponent } from './passenger-seat-bus.component';
import { PassengerSeatModule } from '../../passenger-seat.module';

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

  describe('seatOwners (shared seat map, OBRS-242)', () => {
    beforeEach(() => {
      component.gender = '';
      component.takenSeats = [];
      component.seatGenders = null;
      component.seatOwners = { B1: { label: '1', gender: 'MALE' }, B3: { label: '2', gender: 'FEMALE' } };
    });

    it('seatGenderFor takes priority over seatGenders/single-select and reads the owner map', () => {
      expect(component.seatGenderFor('B1')).toBe('MALE');
      expect(component.seatGenderFor('B3')).toBe('FEMALE');
      expect(component.seatGenderFor('B2')).toBe('');
    });

    it('isSeatActive is true for every owned seat, not just the active passenger', () => {
      expect(component.isSeatActive('B1')).toBeTrue();
      expect(component.isSeatActive('B3')).toBeTrue();
      expect(component.isSeatActive('B2')).toBeFalse();
    });

    it('ownerLabelFor returns the owning passenger badge, null when unowned', () => {
      expect(component.ownerLabelFor('B1')).toBe('1');
      expect(component.ownerLabelFor('B3')).toBe('2');
      expect(component.ownerLabelFor('B2')).toBeNull();
    });

    it('isActiveOwnerFor is true only for the active passenger\'s own currentSeat', () => {
      component.currentSeat = 'B1';
      expect(component.isActiveOwnerFor('B1')).toBeTrue();
      expect(component.isActiveOwnerFor('B3')).toBeFalse();
    });

    it('clicking a seat owned by another passenger is rejected (takenSeats still guards)', () => {
      component.currentSeat = '';
      component.takenSeats = ['B1', 'B3'];
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B1');

      expect(emitted.length).toBe(0);
    });

    it('clicking an available seat assigns it to the active passenger (emits the new seat)', () => {
      component.currentSeat = 'B1';
      component.takenSeats = ['B3'];
      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B7');

      expect(emitted).toEqual(['B7']);
    });

    it('clicking the active passenger\'s own seat clears it (deselect)', () => {
      // Mirror the real data flow: the host binds [currentSeat] to the
      // active passenger's seat, which Angular delivers via ngOnChanges and
      // syncs into `isSelected` — the flag setPassengerSeatPosition toggles.
      component.currentSeat = 'B1';
      component.ngOnChanges({ currentSeat: { currentValue: 'B1' } } as any);

      const emitted: string[] = [];
      component.passengerSeatPositionOnChange.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B1');

      expect(emitted).toEqual(['']);
    });

    it('emits seatClicked even when gender is empty (owner map drives the guard)', () => {
      const emitted: string[] = [];
      component.seatClicked.subscribe((s: string) => emitted.push(s));

      component.setPassengerSeatPosition('B7');

      expect(emitted).toEqual(['B7']);
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

    it('attributesFor normalizes the label ("B1" -> "1") to match the numeric key', () => {
      expect(component.attributesFor('B1')).toEqual(['WHEELCHAIR']);
      expect(component.attributesFor('B2')).toEqual(['EXTRA_LEGROOM']);
    });

    it('attributesFor returns an empty array for a seat with no attributes', () => {
      expect(component.attributesFor('B4')).toEqual([]);
    });

    it('hasWheelchairBadge / hasExtraLegroomBadge read the per-seat attribute list', () => {
      expect(component.hasWheelchairBadge('B1')).toBeTrue();
      expect(component.hasExtraLegroomBadge('B1')).toBeFalse();
      expect(component.hasWheelchairBadge('B2')).toBeFalse();
      expect(component.hasExtraLegroomBadge('B2')).toBeTrue();
    });

    it('a seat can carry BOTH badges at once (e.g. front-row B1)', () => {
      expect(component.hasWheelchairBadge('B3')).toBeTrue();
      expect(component.hasExtraLegroomBadge('B3')).toBeTrue();
    });

    it('returns no badges when seatAttributes is null (default — every existing call site unaffected)', () => {
      component.seatAttributes = null;
      expect(component.attributesFor('B1')).toEqual([]);
      expect(component.hasWheelchairBadge('B1')).toBeFalse();
      expect(component.hasExtraLegroomBadge('B1')).toBeFalse();
    });
  });
});

// OBRS-362: real-DOM render check that a badge lands on the CORRECT seat
// box (bus label form, 'B1'..'B21') — not merely that the logic method
// returns the right booleans in isolation.
describe('PassengerSeatBusComponent — badge placement (real DOM, OBRS-362)', () => {
  let fixture: ComponentFixture<PassengerSeatBusComponent>;
  let component: PassengerSeatBusComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassengerSeatModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PassengerSeatBusComponent);
    component = fixture.componentInstance;
  });

  it('the wheelchair badge renders inside seat B1 only, not any other seat box', () => {
    component.seatAttributes = { '1': ['WHEELCHAIR'] };
    fixture.detectChanges();

    const seatBoxes = fixture.debugElement.queryAll(By.css('app-passenger-seat-box'));
    const b1 = seatBoxes.find((box) => box.componentInstance.label === 'B1');
    const others = seatBoxes.filter((box) => box.componentInstance.label !== 'B1');

    expect(b1?.query(By.css('.seat-attribute-badge-wheelchair'))).not.toBeNull();
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
    const b2 = seatBoxes.find((box) => box.componentInstance.label === 'B2');

    expect(b2?.query(By.css('.seat-attribute-badge-wheelchair'))).not.toBeNull();
    expect(b2?.query(By.css('.seat-attribute-badge-legroom'))).not.toBeNull();
  });
});
