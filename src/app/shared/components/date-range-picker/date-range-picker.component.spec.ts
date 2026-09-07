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

  it('emits the intermediate state where only the start of the range has been picked', () => {
    const emitted: Array<{ from: Date | null; to: Date | null }> = [];
    component.rangeChange.subscribe((range) => emitted.push(range));

    const from = new Date(2026, 5, 1);
    (component as any).onValueChange([from, null]);

    expect(emitted).toEqual([{ from, to: null }]);
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
