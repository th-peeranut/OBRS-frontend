import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MenuModule } from 'primeng/menu';
import { DatePickerModule } from 'primeng/datepicker';
import { PopoverModule } from 'primeng/popover';

// Components
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { StepperComponent } from './components/stepper/stepper.component';
import { LangSwitcherComponent } from './components/lang-switcher/lang-switcher.component';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ReportUsabilityFabComponent } from './components/report-usability-fab/report-usability-fab.component';
import { ExportButtonComponent } from './components/export-button/export-button.component';
import { PromoCodeFieldComponent } from './components/promo-code-field/promo-code-field.component';
import { BoardingListComponent } from './components/boarding-list/boarding-list.component';
// OBRS-317: owner/staff in-app notification bell + inbox panel family.
import { NotificationBellComponent } from './components/notification-bell/notification-bell.component';
import { NotificationInboxPanelComponent } from './components/notification-inbox-panel/notification-inbox-panel.component';
import { NotificationInboxRowComponent } from './components/notification-inbox-row/notification-inbox-row.component';
// OBRS-433: cross-shell shared components — the "My Reports" edit form/
// composer AND the admin inline detail modal both reuse these.
import { UsabilityReportImagePickerComponent } from './components/usability-report-image-picker/usability-report-image-picker.component';
import { UsabilityReportFollowUpTimelineComponent } from './components/usability-report-follow-up-timeline/usability-report-follow-up-timeline.component';
// OBRS-286: the first cross-shell dumb INPUT component — renders in both the
// customer shell (cancel-with-destination modal) and the admin shell
// (override-cancel modal), so it lives here for the same reason
// `AdminModalBackdropDirective` does (ADR-0017 precedent).
import { AppRefundDestinationFieldsComponent } from './components/refund-destination-fields/refund-destination-fields.component';
// OBRS-867: the PDPA consent bar. Mounted once in app.component.html as a
// sibling of <router-outlet>, so it survives every navigation.
import { AnalyticsConsentBannerComponent } from './components/analytics-consent-banner/analytics-consent-banner.component';
// OBRS-874: the grant/withdraw control. Lives on /privacy-policy only — but in
// shared/ rather than in the privacy-policy module because it is a consent
// surface, and it belongs beside the bar that links to it.
import { AnalyticsConsentControlComponent } from './components/analytics-consent-control/analytics-consent-control.component';
// OBRS-1302: the "online booking is closed, message the page" strip. Mounted
// once in app.component.html, ABOVE <router-outlet> — same survives-navigation
// reasoning as the consent bar, opposite end of the page so the two cannot
// collide.
import { BookingClosedNoticeComponent } from './components/booking-closed-notice/booking-closed-notice.component';
// OBRS-907: the one shared loading indicator (skeleton / spinner / inline).
import { LoadingStateComponent } from './components/loading-state/loading-state.component';
// OBRS-1141: the "this round was announced as delayed" disclosure. Shared
// because three surfaces render rows built from the SAME backend query
// (customer search — both legs, and the reschedule-options list), and the
// defect OBRS-1099 was filed for was exactly N readers each deciding alone.
import { ArrivalDateNoticeComponent } from './components/arrival-date-notice/arrival-date-notice.component';
import { ScheduleDelayNoticeComponent } from './components/schedule-delay-notice/schedule-delay-notice.component';
import { StationLoadErrorComponent } from './components/station-load-error/station-load-error.component';

// Directives
// OBRS-272: relocated here from `modules/admin/components/` — see the
// directive's own doc comment for the module-cycle rationale.
import { AdminModalBackdropDirective } from './directives/admin-modal-backdrop.directive';
// OBRS-1464: the project's only keystroke-level charset filter — see the
// census in docs/input-charset-census-2026-08-21.md for why there was none.
import { DigitsOnlyDirective } from './directives/digits-only.directive';

@NgModule({
  declarations: [
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
    ThemeToggleComponent,
    ReportUsabilityFabComponent,
    ExportButtonComponent,
    PromoCodeFieldComponent,
    BoardingListComponent,
    NotificationBellComponent,
    NotificationInboxPanelComponent,
    NotificationInboxRowComponent,
    UsabilityReportImagePickerComponent,
    UsabilityReportFollowUpTimelineComponent,
    AppRefundDestinationFieldsComponent,
    AnalyticsConsentBannerComponent,
    AnalyticsConsentControlComponent,
    ArrivalDateNoticeComponent,
    BookingClosedNoticeComponent,
    LoadingStateComponent,
    ScheduleDelayNoticeComponent,
    StationLoadErrorComponent,
    AdminModalBackdropDirective,
    DigitsOnlyDirective,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,
    MenuModule,
    DatePickerModule,
    PopoverModule,
  ],
  exports: [
    // Modules
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,
    MenuModule,

    // Components
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
    ThemeToggleComponent,
    ReportUsabilityFabComponent,
    ExportButtonComponent,
    PromoCodeFieldComponent,
    BoardingListComponent,
    NotificationBellComponent,
    UsabilityReportImagePickerComponent,
    UsabilityReportFollowUpTimelineComponent,
    AppRefundDestinationFieldsComponent,
    AnalyticsConsentBannerComponent,
    AnalyticsConsentControlComponent,
    ArrivalDateNoticeComponent,
    BookingClosedNoticeComponent,
    LoadingStateComponent,
    ScheduleDelayNoticeComponent,
    StationLoadErrorComponent,

    // Directives
    AdminModalBackdropDirective,
    DigitsOnlyDirective,
  ],
})
export class SharedModule {}
