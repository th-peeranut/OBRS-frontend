import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ReportUsabilityModalService } from '../../services/report-usability-modal.service';

/**
 * OBRS-1832. The entry point to the usability-report modal, as a piece of the
 * chrome instead of an element floating over whatever the page put underneath it.
 *
 * Two variants, one component: `icon` for the tools cluster at the top right of
 * every shell, `row` for the labelled item inside a menu that has slid open.
 * `buttonClass` lets each shell dress the control in the class its own siblings
 * already use, so the trigger inherits that shell's hover, focus and dark-mode
 * treatment rather than carrying a fourth copy of it.
 */
@Component({
  selector: 'app-report-trigger',
  templateUrl: './report-trigger.component.html',
  styleUrl: './report-trigger.component.scss',
  standalone: false,
})
export class ReportTriggerComponent {
  @Input() variant: 'icon' | 'row' = 'icon';

  /** Class put on the button itself, e.g. `admin-icon-btn`, `navbar-mobile-link`. */
  @Input() buttonClass = '';

  /** Fired after the modal has been asked to open — a menu uses it to close itself. */
  @Output() triggered = new EventEmitter<void>();

  constructor(private readonly modalService: ReportUsabilityModalService) {}

  onClick(): void {
    this.modalService.open();
    this.triggered.emit();
  }
}
