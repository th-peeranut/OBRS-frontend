import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ETicketCardComponent } from './e-ticket-card.component';
import { PhoneFormatPipe } from '../../pipes/phone-format.pipe';
import { TitleLabelPipe } from '../../pipes/title-label.pipe';
import { SharedModule } from '../../shared.module';

/**
 * Standalone-feature module for the shared e-ticket card. Kept out of
 * SharedModule (which is eager) so its heavy dep (`qrcode`, which
 * `BoardingQrService` uses to render the per-passenger boarding QRs client-side)
 * stays in the lazy chunks of the feature modules that import it. OBRS-1802
 * removed the second one - a canvas rasteriser - along with the client-side PNG
 * export it existed for; the lazy-chunk rationale stands on the one that is left.
 */
@NgModule({
  declarations: [ETicketCardComponent],
  imports: [
    TitleLabelPipe,CommonModule, TranslateModule, PhoneFormatPipe, SharedModule],
  exports: [ETicketCardComponent],
})
export class ETicketCardModule {}
