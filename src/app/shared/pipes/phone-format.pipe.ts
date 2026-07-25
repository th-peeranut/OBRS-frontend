import { Pipe, PipeTransform } from '@angular/core';
import { formatThaiMobile } from '../constants/thai-msisdn';

/**
 * OBRS-691 — display-only 3-3-4 grouping for a Thai mobile number
 * (`0800000000` -> `080-000-0000`), reusing the SAME `formatThaiMobile` helper
 * `account-page.component.ts` already applies on blur (OBRS-646) rather than
 * forking a second formatting rule. A value that is not a clean 10-digit
 * `0`-prefixed number (half-typed, international, already-grouped, etc.)
 * renders as bare digits — `formatThaiMobile` already handles that fallback,
 * so this pipe adds no branching of its own.
 *
 * Standalone so any NgModule-declared host component can pull it in via its
 * owning `@NgModule.imports` without a SharedModule round-trip.
 */
@Pipe({
  name: 'phoneFormat',
  standalone: true,
})
export class PhoneFormatPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatThaiMobile(value);
  }
}
