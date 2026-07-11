import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { TicketLeg } from '../../interfaces/e-ticket.interface';
import { ETicketCardComponent } from './e-ticket-card.component';

function buildLeg(overrides: Partial<TicketLeg> = {}): TicketLeg {
  return {
    travelDate: '20 Dec 2026',
    travelTime: '08:00 - 09:00',
    route: 'Station A - Station B',
    origin: 'Station A',
    destination: 'Station B',
    vehicleType: 'Van',
    vehiclePlate: '12/1234',
    seats: '1',
    distanceKm: 45,
    ...overrides,
  };
}

describe('ETicketCardComponent', () => {
  let component: ETicketCardComponent;

  beforeEach(() => {
    component = new ETicketCardComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('clears the QR for a placeholder ticket number', async () => {
    component.qrCodeDataUrl = 'data:image/png;base64,old';

    await (component as unknown as {
      updateQrCode: (value: string) => Promise<void>;
    }).updateQrCode('-');

    expect(component.qrCodeDataUrl).toBe('');
  });

  it('builds a filesystem-safe download name from the ticket number', () => {
    component.ticketNumber = 'T-ABC, T-DEF';

    const filename = (component as unknown as {
      getTicketDownloadFilename: () => string;
    }).getTicketDownloadFilename();

    expect(filename).toBe('e-ticket-T-ABC--T-DEF.png');
  });
});

describe('ETicketCardComponent — leg rendering', () => {
  let fixture: ComponentFixture<ETicketCardComponent>;
  let component: ETicketCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ETicketCardComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ETicketCardComponent);
    component = fixture.componentInstance;
  });

  function headings(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.ticket-leg-heading'))
      .map((el) => (el.nativeElement.textContent || '').trim());
  }

  function distanceChips(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.trip-estimate'))
      .map((el) => (el.nativeElement.textContent || '').trim().replace(/\s+/g, ' '));
  }

  it('one-way (legs.length === 1): renders no leg heading', () => {
    component.legs = [buildLeg()];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ticket-leg-heading'))).toBeNull();
  });

  it('one-way: renders the leg fields directly', () => {
    component.legs = [buildLeg()];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('Station A - Station B');
    expect(distanceChips().length).toBe(1);
    expect(distanceChips()[0]).toContain('≈ 45');
  });

  it('round-trip (legs.length === 2): renders exactly two headings with the correct translated text', () => {
    component.legs = [
      buildLeg({ route: 'Station A - Station B', distanceKm: 45 }),
      buildLeg({ route: 'Station B - Station C', distanceKm: 40 }),
    ];
    fixture.detectChanges();

    const headingTexts = headings();
    expect(headingTexts.length).toBe(2);
    expect(headingTexts[0]).toBe('E_TICKET.LABEL.LEG_OUTBOUND');
    expect(headingTexts[1]).toBe('E_TICKET.LABEL.LEG_RETURN');
  });

  it('round-trip: each leg shows its own distance chip', () => {
    component.legs = [
      buildLeg({ route: 'Station A - Station B', distanceKm: 45 }),
      buildLeg({ route: 'Station B - Station C', distanceKm: 40 }),
    ];
    fixture.detectChanges();

    const chips = distanceChips();
    expect(chips.length).toBe(2);
    expect(chips[0]).toContain('≈ 45');
    expect(chips[1]).toContain('≈ 40');
  });

  it('hides a leg\'s distance chip when its distanceKm is null', () => {
    component.legs = [
      buildLeg({ distanceKm: 45 }),
      buildLeg({ distanceKm: null }),
    ];
    fixture.detectChanges();

    expect(distanceChips().length).toBe(1);
  });

  it('renders the shared passengers/total/QR block exactly once regardless of leg count', () => {
    component.legs = [buildLeg(), buildLeg()];
    component.passengers = [{ name: 'Mr A', phone: '-', seat: '1' }];
    component.totalAmount = '500.00';
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.ticket-total')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.ticket-qr')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.passenger-row')).length).toBe(1);
  });
});
