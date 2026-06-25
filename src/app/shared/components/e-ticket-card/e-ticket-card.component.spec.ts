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
