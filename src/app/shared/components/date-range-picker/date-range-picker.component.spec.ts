import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { DateRangePickerComponent } from './date-range-picker.component';

describe('DateRangePickerComponent', () => {
  let fixture: ComponentFixture<DateRangePickerComponent>;
  let component: DateRangePickerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot(), DatePickerModule],
      declarations: [DateRangePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DateRangePickerComponent);
    component = fixture.componentInstance;
  });

  it('creates, showing two months in one popup', () => {
    fixture.detectChanges();

    expect((component as any).numberOfMonths).toBe(2);
    expect((component as any).responsiveOptions).toEqual([{ breakpoint: '640px', numMonths: 1 }]);
  });

  it('exposes the from/to inputs as PrimeNG\'s own [start, end] range value', () => {
    component.from = new Date(2026, 5, 1);
    component.to = new Date(2026, 5, 30);
    // Directly setting @Input fields in a test does not trigger Angular's own
    // ngOnChanges (that only fires through a template binding) — call it
    // explicitly, the same way Angular would after a bound `from`/`to` change.
    component.ngOnChanges({
      from: new SimpleChange(null, component.from, true),
      to: new SimpleChange(null, component.to, true),
    });

    expect((component as any).value).toEqual([component.from, component.to]);
  });

  it('emits {from, to} and updates its own inputs when the picker selects a full range', () => {
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    component.rangeChange.subscribe((range) => emitted.push(range));

    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    (component as any).onValueChange([from, to]);

    expect(component.from).toBe(from);
    expect(component.to).toBe(to);
    expect(emitted).toEqual([{ from, to }]);
  });

  // OBRS-1735 — this used to assert the OPPOSITE (that the half-picked state IS
  // emitted). It is inverted on purpose: every caller's applyRange() clears its
  // rangeError before its own null guard, so emitting here wiped a message that
  // was on screen and let the previous range's table return with nothing saying
  // why. The picker still tracks the half-picked value for its own display —
  // only the emit is withheld until the range is complete.
  it('does NOT emit while only the start of the range has been picked', () => {
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    component.rangeChange.subscribe((range) => emitted.push(range));

    const from = new Date(2026, 5, 1);
    (component as any).onValueChange([from, null]);

    expect(emitted).toEqual([]);
    expect(component.from).toBe(from);
    expect(component.to).toBeNull();
  });

  // The other end of the same rule: a page showing a range error must still be
  // able to get back to a clean slate, so a CLEARED range is a complete
  // instruction and is emitted.
  it('still emits when the range is cleared, so a caller can reset its error', () => {
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    (component as any).onValueChange([new Date(2026, 5, 1), new Date(2026, 5, 30)]);
    component.rangeChange.subscribe((range) => emitted.push(range));

    (component as any).onValueChange([null, null]);

    expect(emitted).toEqual([{ from: null, to: null }]);
  });

  it('treats a null value (cleared range) as {from: null, to: null}', () => {
    component.from = new Date(2026, 5, 1);
    component.to = new Date(2026, 5, 30);
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    component.rangeChange.subscribe((range) => emitted.push(range));

    (component as any).onValueChange(null);

    expect(component.from).toBeNull();
    expect(component.to).toBeNull();
    expect(emitted).toEqual([{ from: null, to: null }]);
  });
});
