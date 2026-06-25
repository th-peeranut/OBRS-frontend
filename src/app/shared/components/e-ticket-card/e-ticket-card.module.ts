import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ETicketCardComponent } from './e-ticket-card.component';

/**
 * Standalone-feature module for the shared e-ticket card. Kept out of
 * SharedModule (which is eager) so its heavy deps (html2canvas, qrcode) stay in
 * the lazy chunks of the feature modules that import it.
 */
@NgModule({
  declarations: [ETicketCardComponent],
  imports: [CommonModule, TranslateModule],
  exports: [ETicketCardComponent],
})
export class ETicketCardModule {}
