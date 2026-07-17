import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { assertProdConfig } from './environments/prod-config-guard';

// OBRS-390 — runs before anything renders, against the bundle that actually shipped.
// No-ops for every build except `--configuration prod`; see prod-config-guard.ts for
// why a prod bundle that cannot take real money must refuse to boot rather than serve
// a checkout that silently issues free tickets.
assertProdConfig(environment);

platformBrowserDynamic().bootstrapModule(AppModule, {
  ngZoneEventCoalescing: true
})
  .catch(err => console.error(err));
