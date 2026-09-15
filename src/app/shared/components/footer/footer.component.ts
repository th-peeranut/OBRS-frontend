import { Component } from '@angular/core';
import { buildInfo } from '../../../../environments/build-info';

@Component({
    selector: 'app-footer',
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss',
    standalone: false
})
export class FooterComponent {
  // OBRS-1075 AC-5. build-info.ts is generated fresh by scripts/inject-build-info.mjs on
  // every build/test/e2e/start lane — never edited by hand.
  readonly build = buildInfo;
}
