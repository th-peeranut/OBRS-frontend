import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MenuModule } from 'primeng/menu';
import { CalendarModule } from 'primeng/calendar';
import { OverlayPanelModule } from 'primeng/overlaypanel';

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
// OBRS-403: shared server-side paginator, promoted from bookings-page's
// inline Previous/Next markup now that a second admin list needs it.
import { AdminPaginatorComponent } from './components/admin-paginator/admin-paginator.component';

// Directives
// OBRS-272: relocated here from `modules/admin/components/` — see the
// directive's own doc comment for the module-cycle rationale.
import { AdminModalBackdropDirective } from './directives/admin-modal-backdrop.directive';

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
    AdminPaginatorComponent,
    AdminModalBackdropDirective,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,
    MenuModule,
    CalendarModule,
    OverlayPanelModule,
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
    AdminPaginatorComponent,

    // Directives
    AdminModalBackdropDirective,
  ],
})
export class SharedModule {}
