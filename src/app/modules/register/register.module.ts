// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';

// Components
import { RegisterComponent } from './register.component';

const routes: Routes = [{ path: '', component: RegisterComponent }];

@NgModule({
  declarations: [RegisterComponent],
  imports: [SharedModule, RouterModule.forChild(routes), DropdownObrsComponent],
})
export class RegisterModule {}
