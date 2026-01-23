import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

import { ETicketComponent } from './e-ticket.component';

const routes: Routes = [{ path: '', component: ETicketComponent }];

@NgModule({
  declarations: [ETicketComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class ETicketModule {}
