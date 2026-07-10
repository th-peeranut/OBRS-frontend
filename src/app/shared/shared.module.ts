import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MenuModule } from 'primeng/menu';

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
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,
    MenuModule,
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
  ],
})
export class SharedModule {}
