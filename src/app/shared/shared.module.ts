import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

// Components
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { StepperComponent } from './components/stepper/stepper.component';
import { LangSwitcherComponent } from './components/lang-switcher/lang-switcher.component';

@NgModule({
  declarations: [
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
  ],
  exports: [
    // Modules
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,

    // Components
    FooterComponent,
    NavbarComponent,
    StepperComponent,
    LangSwitcherComponent,
  ],
})
export class SharedModule {}
