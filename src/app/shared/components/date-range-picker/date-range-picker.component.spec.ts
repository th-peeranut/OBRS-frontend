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

  // OBRS-1758 — this used to assert that onValueChange also WROTE the picked dates onto the
  // component's own @Inputs. That write is gone, and its removal is the card: the inputs are the
  // parent's record of what is APPLIED, and onClose restores the box from them. Writing the
  // in-progress pick there would have made the restore restore the very thing being discarded.
  it('emits {from, to} when the picker selects a full range, and leaves its inputs to the parent', () => {
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    component.from = new Date(2026, 0, 1);
    component.to = new Date(2026, 0, 31);
    component.rangeChange.subscribe((range) => emitted.push(range));

    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    (component as any).onValueChange([from, to]);

    expect(emitted).toEqual([{ from, to }]);
    expect(component.from).toEqual(new Date(2026, 0, 1));
    expect(component.to).toEqual(new Date(2026, 0, 31));
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

    component.from = new Date(2026, 0, 1);
    component.to = new Date(2026, 0, 31);

    (component as any).onValueChange([new Date(2026, 5, 1), null]);

    expect(emitted).toEqual([]);
    // OBRS-1758: and the APPLIED range is still what the component holds, so onClose has
    // something true to restore from.
    expect(component.from).toEqual(new Date(2026, 0, 1));
    expect(component.to).toEqual(new Date(2026, 0, 31));
  });

  /**
   * OBRS-1758. Not a rewording of the test above — that one pins the SILENCE (no emit, so a
   * caller's rangeError survives), this one pins the price that silence used to cost. Because
   * nothing is emitted, the parent's inputs never change, ngOnChanges never fires, and PrimeNG
   * leaves the box showing the single date that was picked while the table below is still
   * filtered by the applied range.
   */
  it('puts the APPLIED range back in the box when the popup closes mid-pick', () => {
    component.from = new Date(2026, 0, 1);
    component.to = new Date(2026, 0, 31);
    component.ngOnChanges({
      from: new SimpleChange(null, component.from, true),
      to: new SimpleChange(null, component.to, true),
    });

    // The half-pick lives in PrimeNG's own model, not here: `[ngModel]` is one-way, so this
    // component's `value` is untouched by it. That is exactly why the restore works — assigning
    // a NEW array is what changes the bound identity and makes NgModel write the applied range
    // back into the control. Asserting on identity, not just contents, is the point.
    const before = (component as any).value;

    (component as any).onValueChange([new Date(2026, 5, 1), null]);
    (component as any).onClose();

    expect((component as any).value).not.toBe(before);
    expect((component as any).value).toEqual([new Date(2026, 0, 1), new Date(2026, 0, 31)]);
  });

  it('closing after a COMPLETE pick changes nothing - no special case to get wrong', () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    component.from = from;
    component.to = to;
    (component as any).onValueChange([from, to]);

    (component as any).onClose();

    expect((component as any).value).toEqual([from, to]);
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

    // OBRS-1758: the EMIT is the whole instruction; the parent clears its own state and the
    // cleared inputs come back through ngOnChanges.
    expect(emitted).toEqual([{ from: null, to: null }]);
  });
});
