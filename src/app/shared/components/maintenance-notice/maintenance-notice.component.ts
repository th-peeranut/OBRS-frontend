import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { readStoredLanguage } from '../../services/language.service';
import {
  MaintenanceNoticeVm,
  MaintenanceWindowService,
} from '../../../services/maintenance-window/maintenance-window.service';

/**
 * OBRS-1902 — the strip that tells every visitor the site is about to go down for an update.
 *
 * **In normal flow, above the router outlet, exactly like {@link
 * ../booking-closed-notice/booking-closed-notice.component}.** That component's javadoc records
 * why at length: a fixed bar has to win a z-index argument with the PDPA consent bar and the
 * usability FAB, and an element that floats over the page is one that can sit on top of a button.
 * The same reasoning applies unchanged here, so the same placement is used.
 *
 * **Shown on staff and admin pages too — the one place this deliberately differs from the booking
 * closure.** The closure notice is hidden from staff because staff are the people the closure is
 * waiting for. An outage is the opposite: the counter clerk mid-sale is exactly who must not be
 * surprised by it, and the owner's instruction was to tell every user.
 */
@Component({
  selector: 'app-maintenance-notice',
  templateUrl: './maintenance-notice.component.html',
  styleUrl: './maintenance-notice.component.scss',
  standalone: false,
})
export class MaintenanceNoticeComponent {
  protected readonly notice$: Observable<MaintenanceNoticeVm | null>;

  /** Rendered as one extra line inside the strip. Without it the pay button simply stops working
   * and the customer is left guessing why — the banner is the only place that explanation fits. */
  protected readonly paymentLocked$: Observable<boolean>;

  constructor(private readonly maintenance: MaintenanceWindowService) {
    this.notice$ = this.maintenance.notice$;
    this.paymentLocked$ = this.maintenance.paymentLocked$;
  }

  /**
   * The owner's own words in the reader's language. Two messages are stored, not three: `zh` falls
   * back to the English one, the same fallback every other customer-facing string in this product
   * uses.
   *
   * `readStoredLanguage()`, NOT `translate.currentLang` — OBRS-930's finding is that
   * `currentLang` still reads the default during the cold window before the language service has
   * caught up, so an English-preferring visitor would be shown the Thai sentence on exactly the
   * first paint this banner exists for. That free function is the repo's single answer to "which
   * language did this visitor choose", and it is read per render rather than captured once so a
   * language switch re-renders the sentence instead of leaving the previous one on screen.
   */
  protected message(vm: MaintenanceNoticeVm): string {
    return readStoredLanguage() === 'th' ? vm.window.messageTh : vm.window.messageEn;
  }
}
