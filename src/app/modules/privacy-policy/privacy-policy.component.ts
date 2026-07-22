import { Component } from '@angular/core';

import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from './privacy-policy.version';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss',
})
export class PrivacyPolicyComponent {
  // OBRS-628 AC-3: read from the version module, never re-typed into i18n — a
  // date living in three translation files drifts into three different dates.
  readonly version = PRIVACY_POLICY_VERSION;
  readonly effectiveDate = PRIVACY_POLICY_EFFECTIVE_DATE;
}
