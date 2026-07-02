import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SharedModule } from '../../shared/shared.module';
import { VerifyEmailComponent } from './verify-email.component';

const routes: Routes = [{ path: '', component: VerifyEmailComponent }];

@NgModule({
  declarations: [VerifyEmailComponent],
  imports: [SharedModule, RouterModule.forChild(routes), ProgressSpinnerModule],
})
export class VerifyEmailModule {}
