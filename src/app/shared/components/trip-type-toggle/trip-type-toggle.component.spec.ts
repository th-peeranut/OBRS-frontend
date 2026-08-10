import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { TripTypeToggleComponent } from './trip-type-toggle.component';
import { Dropdown } from '../../interfaces/dropdown.interface';

describe('TripTypeToggleComponent (OBRS-1025)', () => {
  let fixture: ComponentFixture<TripTypeToggleComponent>;
  let component: TripTypeToggleComponent;

  const OPTIONS: Dropdown[] = [
    { id: 1, nameThai: 'เที่ยวเดียว', nameEnglish: 'One-way' },
    { id: 2, nameThai: 'ไป-กลับ', nameEnglish: 'Round-trip', isDefault: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot(), TripTypeToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TripTypeToggleComponent);
    component = fixture.componentInstance;
    component.options = OPTIONS;
  });

  function buttons(): HTMLButtonElement[] {
    return fixture.debugElement
      .queryAll(By.css('button'))
      .map((de) => de.nativeElement as HTMLButtonElement);
  }

  it('renders BOTH options in the DOM from first render — AC#1, no option hidden behind a click', () => {
    fixture.detectChanges();

    const rendered = buttons();
    expect(rendered.length).toBe(2);
    expect(rendered[0].textContent).toContain('HOME.HOME_BOOKING.ROUNDTRIP_1');
    expect(rendered[1].textContent).toContain('HOME.HOME_BOOKING.ROUNDTRIP_2');
  });

  it('writeValue(id): selects the matching option by bare id', () => {
    component.writeValue(1);
    fixture.detectChanges();

    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('writeValue(option object): selects the matching option by its .id — same shape app-dropdown-obrs wrote', () => {
    component.writeValue(OPTIONS[1]);
    fixture.detectChanges();

    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('writeValue(null): falls back to the isDefault option — the flag still works (AC#4)', () => {
    component.writeValue(null);
    fixture.detectChanges();

    expect(component.selectedId).toBe(2);
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a pill calls the registered onChange with the FULL matching option object', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);
    component.writeValue(1);
    fixture.detectChanges();

    buttons()[1].click();

    expect(onChange).toHaveBeenCalledWith(OPTIONS[1]);
    expect(component.selectedId).toBe(2);
  });

  it('clicking the already-selected pill does not re-emit onChange', () => {
    const onChange = jasmine.createSpy('onChange');
    component.registerOnChange(onChange);
    component.writeValue(2);
    fixture.detectChanges();

    buttons()[1].click();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('never fights an already-resolved value — a mid-flight options reassignment does not re-select isDefault', () => {
    // Regression for the exact risk OBRS-1185 called out: app-dropdown-obrs's
    // ngOnChanges() unconditionally re-applied isDefault on every [options]
    // change. This component must not do the same — a caller reassigning the
    // SAME options array (e.g. a language switch re-running change detection)
    // must not silently flip a user's explicit choice back to the default.
    component.writeValue(1); // user chose one-way, NOT the isDefault (id 2)
    fixture.detectChanges();

    component.options = [...OPTIONS];
    fixture.detectChanges();

    expect(component.selectedId).toBe(1);
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
  });
});
