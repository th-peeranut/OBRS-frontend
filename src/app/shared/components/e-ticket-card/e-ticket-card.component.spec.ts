import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ETicketCardComponent } from './e-ticket-card.component';

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

describe('ETicketCardComponent — distance estimate chip (render)', () => {
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

  function chipText(): string {
    const el = fixture.debugElement.query(By.css('.trip-estimate'));
    return el ? (el.nativeElement.textContent || '').trim().replace(/\s+/g, ' ') : '';
  }

  it('renders "≈ {km} {unit}" when estimateDistanceKm is set', () => {
    component.estimateDistanceKm = 45;
    fixture.detectChanges();

    expect(chipText()).toContain('≈ 45');
  });

  it('hides the chip when estimateDistanceKm is null', () => {
    component.estimateDistanceKm = null;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.trip-estimate'))).toBeNull();
  });

  it('hides the return half when returnEstimateDistanceKm equals estimateDistanceKm', () => {
    component.estimateDistanceKm = 45;
    component.returnEstimateDistanceKm = 45;
    fixture.detectChanges();

    const text = chipText();
    expect(text).toContain('≈ 45');
    expect(text.match(/≈/g)?.length).toBe(1);
  });

  it('shows the return half when returnEstimateDistanceKm differs from estimateDistanceKm', () => {
    component.estimateDistanceKm = 45;
    component.returnEstimateDistanceKm = 40;
    fixture.detectChanges();

    const text = chipText();
    expect(text).toContain('≈ 45');
    expect(text).toContain('≈ 40');
    expect(text).toContain('/');
  });

  it('contains no minute/duration text', () => {
    component.estimateDistanceKm = 45;
    component.returnEstimateDistanceKm = 40;
    fixture.detectChanges();

    const text = chipText().toLowerCase();
    expect(text).not.toContain('min');
    expect(text).not.toContain('นาที');
    expect(text).not.toContain('分');
  });
});
