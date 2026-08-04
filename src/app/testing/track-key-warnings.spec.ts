import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { captureDuplicateTrackKeyWarnings } from './track-key-warnings';

// OBRS-967 positive control for the capture helper itself.
//
// Every other use of `captureDuplicateTrackKeyWarnings()` asserts an ABSENCE
// ("no NG0955 after this render"). An absence assertion is worthless unless the
// instrument is known to fire, so these two specs pin both directions on a
// component whose only job is to have (and then not have) duplicate track keys.

@Component({
  selector: 'app-dup-track-probe',
  standalone: true,
  template: `@for (item of items; track item) {
    <i class="probe"></i>
  }`,
})
class DupTrackProbeComponent {
  // The exact shape the 39 skeleton loops had before this card: an
  // `Array.from({ length: n })` placeholder list is n copies of `undefined`,
  // so identity tracking hands @for the same key n times.
  items: unknown[] = Array.from({ length: 3 });
}

describe('captureDuplicateTrackKeyWarnings (positive control, OBRS-967)', () => {
  let readWarnings: () => string[];

  beforeEach(async () => {
    readWarnings = captureDuplicateTrackKeyWarnings();
    await TestBed.configureTestingModule({
      imports: [DupTrackProbeComponent],
    }).compileComponents();
  });

  it('must-CATCH: a genuinely duplicated track key is captured', () => {
    const fixture = TestBed.createComponent(DupTrackProbeComponent);
    fixture.detectChanges();

    expect(readWarnings().length)
      .withContext('the instrument every other spec relies on did not fire on a real duplicate')
      .toBeGreaterThan(0);
    expect(readWarnings()[0]).toContain('NG0955');
  });

  it('must-NOT-catch: unique track keys produce nothing', () => {
    const fixture = TestBed.createComponent(DupTrackProbeComponent);
    fixture.componentInstance.items = ['a', 'b', 'c'];
    fixture.detectChanges();

    expect(readWarnings()).toEqual([]);
  });
});
