import { WalkInCenterPanelComponent } from './walk-in-center-panel.component';
import { WalkInTripDto } from '../../../../services/staff/staff-api.service';
import { StopOption } from '../../pages/sell/sell-page.component';

function makeTrip(overrides: Partial<WalkInTripDto> = {}): WalkInTripDto {
  return {
    scheduleId: 1,
    vehicleType: 'bus',
    licensePlate: 'AB-1234',
    driverName: 'John',
    departureDateTime: '2026-07-01T08:00:00',
    arrivalDateTime: '2026-07-01T12:00:00',
    pricePerSeat: '300',
    capacity: 21,
    availableCount: 15,
    reservedUnpaidCount: 3,
    soldPaidCount: 3,
    availableSeatNumbers: ['1', '2', '3', '4', '5'],
    ...overrides,
  };
}

function makeStopOption(slug: string, name: string, time = ''): StopOption {
  return { slug, name, time };
}

function makeComponent(): WalkInCenterPanelComponent {
  return new WalkInCenterPanelComponent();
}

describe('WalkInCenterPanelComponent', () => {
  it('should create', () => {
    expect(makeComponent()).toBeTruthy();
  });

  describe('passengerTypeOptions', () => {
    it('defines 4 passenger type options (male, female, monk, nun)', () => {
      const comp = makeComponent();
      const values = (comp as any).passengerTypeOptions.map((o: { value: string }) => o.value);
      expect(values).toEqual(['male', 'female', 'monk', 'nun']);
    });

    it('provides an SVG icon path for male, female and monk', () => {
      const comp = makeComponent();
      const opts: { value: string; icon: string }[] = (comp as any).passengerTypeOptions;
      expect(opts.find((o) => o.value === 'male')?.icon).toContain('passenger-male.svg');
      expect(opts.find((o) => o.value === 'female')?.icon).toContain('passenger-female.svg');
      expect(opts.find((o) => o.value === 'monk')?.icon).toContain('passenger-monk.svg');
    });

    it('uses empty icon string for nun (Bootstrap Icon fallback)', () => {
      const comp = makeComponent();
      const opts: { value: string; icon: string }[] = (comp as any).passengerTypeOptions;
      expect(opts.find((o) => o.value === 'nun')?.icon).toBe('');
    });
  });

  describe('onSelectPassengerType', () => {
    it('emits passengerTypeChange with the clicked value', () => {
      const comp = makeComponent();
      let emitted: string | undefined;
      comp.passengerTypeChange.subscribe((v) => { emitted = v; });

      (comp as any).onSelectPassengerType('female');
      expect(emitted).toBe('female');
    });

    it('emits for each valid passenger type', () => {
      const comp = makeComponent();
      const emitted: string[] = [];
      comp.passengerTypeChange.subscribe((v) => emitted.push(v));

      for (const v of ['male', 'female', 'monk', 'nun']) {
        (comp as any).onSelectPassengerType(v);
      }
      expect(emitted).toEqual(['male', 'female', 'monk', 'nun']);
    });
  });

  describe('routeEndpoints getter', () => {
    it('returns null when routeLabel is null', () => {
      const comp = makeComponent();
      comp.routeLabel = null;
      expect((comp as any).routeEndpoints).toBeNull();
    });

    it('returns null when routeLabel is empty string', () => {
      const comp = makeComponent();
      comp.routeLabel = '';
      expect((comp as any).routeEndpoints).toBeNull();
    });

    it('splits "Bangkok → Chiang Mai" on arrow separator', () => {
      const comp = makeComponent();
      comp.routeLabel = 'Bangkok → Chiang Mai';
      const ep = (comp as any).routeEndpoints;
      expect(ep).not.toBeNull();
      expect(ep.from).toBe('Bangkok');
      expect(ep.to).toBe('Chiang Mai');
    });

    it('splits "BANGKOK-CHONBURI" on dash separator', () => {
      const comp = makeComponent();
      comp.routeLabel = 'BANGKOK-CHONBURI';
      const ep = (comp as any).routeEndpoints;
      expect(ep).not.toBeNull();
      expect(ep.from).toBe('BANGKOK');
      expect(ep.to).toBe('CHONBURI');
    });

    it('returns first and last parts for a 3-segment label', () => {
      const comp = makeComponent();
      comp.routeLabel = 'Bangkok → Chonburi → Chiang Mai';
      const ep = (comp as any).routeEndpoints;
      expect(ep?.from).toBe('Bangkok');
      expect(ep?.to).toBe('Chiang Mai');
    });

    it('returns null when label has only one part (no separator)', () => {
      const comp = makeComponent();
      comp.routeLabel = 'Bangkok';
      expect((comp as any).routeEndpoints).toBeNull();
    });
  });

  describe('seatGender getter', () => {
    it('uppercases passengerGender for seat-map components', () => {
      const comp = makeComponent();
      comp.passengerGender = 'male';
      expect((comp as any).seatGender).toBe('MALE');
    });

    it('defaults to MALE when passengerGender is empty', () => {
      const comp = makeComponent();
      comp.passengerGender = '';
      expect((comp as any).seatGender).toBe('MALE');
    });
  });

  describe('seatGendersUpper getter', () => {
    it('returns null when seatPassengerTypes is empty', () => {
      const comp = makeComponent();
      comp.seatPassengerTypes = {};
      expect((comp as any).seatGendersUpper).toBeNull();
    });

    it('returns upper-cased map when seatPassengerTypes has entries', () => {
      const comp = makeComponent();
      comp.seatPassengerTypes = { B1: 'male', B3: 'female' };
      const upper = (comp as any).seatGendersUpper;
      expect(upper).not.toBeNull();
      expect(upper['B1']).toBe('MALE');
      expect(upper['B3']).toBe('FEMALE');
    });
  });

  describe('takenSeats getter', () => {
    it('returns empty array when no trip selected', () => {
      const comp = makeComponent();
      comp.selectedTrip = null;
      expect((comp as any).takenSeats).toEqual([]);
    });

    it('returns taken bus seats that are not in availableSeatNumbers', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ availableSeatNumbers: ['1', '2', '3'] });
      const taken: string[] = (comp as any).takenSeats;
      expect(taken).not.toContain('B1');
      expect(taken).not.toContain('B2');
      expect(taken).not.toContain('B3');
      expect(taken).toContain('B4');
    });
  });

  describe('formatTime', () => {
    it('formats ISO datetime to HH:mm', () => {
      const comp = makeComponent();
      expect((comp as any).formatTime('2026-07-01T08:30:00')).toBe('08:30');
    });
  });

  describe('stop selection outputs', () => {
    it('emits pickupChange when stop button is clicked', () => {
      const comp = makeComponent();
      const emitted: string[] = [];
      comp.pickupChange.subscribe((v) => emitted.push(v));
      comp.pickupChange.emit('stop_a');
      expect(emitted).toEqual(['stop_a']);
    });

    it('emits dropoffChange when stop button is clicked', () => {
      const comp = makeComponent();
      const emitted: string[] = [];
      comp.dropoffChange.subscribe((v) => emitted.push(v));
      comp.dropoffChange.emit('stop_c');
      expect(emitted).toEqual(['stop_c']);
    });
  });
});
