import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { TicketPassenger } from '../../interfaces/e-ticket.interface';

/**
 * Presentational e-ticket "paper". Renders the same markup/style as the booking
 * flow's e-ticket page but is data-driven via inputs, so it can also be shown in
 * a modal (e.g. from "My Bookings") without the flow's stepper. Owns its own QR
 * rendering (from `ticketNumber`) and PNG download.
 */
@Component({
  selector: 'app-e-ticket-card',
  templateUrl: './e-ticket-card.component.html',
  styleUrl: './e-ticket-card.component.scss',
})
export class ETicketCardComponent implements OnChanges {
  @ViewChild('ticketPaper') private ticketPaper?: ElementRef<HTMLElement>;

  @Input() bookingNumber = '-';
  @Input() ticketNumber = '-';
  @Input() travelDate = '-';
  @Input() travelTime = '-';
  @Input() route = '-';
  @Input() origin = '-';
  @Input() destination = '-';
  @Input() vehicleType = '-';
  @Input() vehiclePlate = '-';
  @Input() seats = '-';
  @Input() paymentDate = '-';
  @Input() totalAmount = '0.00';
  @Input() passengers: TicketPassenger[] = [];
  @Input() booker: TicketPassenger | null = null;

  qrCodeDataUrl = '';
  isDownloadingTicket = false;
  private latestQrPayload = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ticketNumber']) {
      void this.updateQrCode(this.ticketNumber);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  async downloadTicketImage(): Promise<void> {
    const ticketElement = this.ticketPaper?.nativeElement;
    if (!ticketElement || this.isDownloadingTicket) {
      return;
    }

    this.isDownloadingTicket = true;

    try {
      const canvas = await html2canvas(ticketElement, {
        backgroundColor: '#ffffff',
        scale: Math.max(window.devicePixelRatio || 1, 2),
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelector('.ticket-paper')
            ?.classList.add('is-exporting');
        },
        ignoreElements: (element) => element.classList.contains('download-btn'),
      });

      this.triggerTicketDownload(canvas.toDataURL('image/png'));
    } catch (error) {
      console.error('Download e-ticket image failed', error);
    } finally {
      this.isDownloadingTicket = false;
    }
  }

  private triggerTicketDownload(imageUrl: string): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = this.getTicketDownloadFilename();
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private getTicketDownloadFilename(): string {
    const rawReference =
      this.ticketNumber !== '-' ? this.ticketNumber : this.bookingNumber;
    const safeReference = String(rawReference || 'ticket')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-');

    return `e-ticket-${safeReference || 'ticket'}.png`;
  }

  private async updateQrCode(ticketNumber: string): Promise<void> {
    const normalizedTicketNumber = ticketNumber?.trim();
    this.latestQrPayload = normalizedTicketNumber;

    if (!normalizedTicketNumber || normalizedTicketNumber === '-') {
      this.qrCodeDataUrl = '';
      return;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(normalizedTicketNumber, {
        width: 140,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      if (this.latestQrPayload === normalizedTicketNumber) {
        this.qrCodeDataUrl = qrDataUrl;
      }
    } catch {
      if (this.latestQrPayload === normalizedTicketNumber) {
        this.qrCodeDataUrl = '';
      }
    }
  }
}
