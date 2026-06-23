import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { HowToBookComponent } from './how-to-book.component';

const routes: Routes = [{ path: '', component: HowToBookComponent }];

@NgModule({
  declarations: [HowToBookComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class HowToBookModule {}
