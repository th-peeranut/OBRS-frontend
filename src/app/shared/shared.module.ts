import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SelectButtonModule } from 'primeng/selectbutton';

// Components
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { StepperComponent } from './components/stepper/stepper.component';
import { LangSwitcherComponent } from './components/lang-switcher/lang-switcher.component';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ReportUsabilityFabComponent } from './components/report-usability-fab/report-usability-fab.component';

@NgModule({
  declarations: [
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
    ThemeToggleComponent,
    ReportUsabilityFabComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,
  ],
  exports: [
    // Modules
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    SelectButtonModule,

    // Components
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
    ThemeToggleComponent,
    ReportUsabilityFabComponent,
  ],
})
export class SharedModule {}
