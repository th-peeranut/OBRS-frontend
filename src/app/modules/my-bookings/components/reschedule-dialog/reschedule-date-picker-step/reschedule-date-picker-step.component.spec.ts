import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { RescheduleDatePickerStepComponent } from './reschedule-date-picker-step.component';
import { LanguageService } from '../../../../../shared/services/language.service';

/**
 * OBRS-1037 group 1. This step carried a hardcoded `dateFormat="dd/mm/yy"`, so a
 * customer reading the site in English picked their new travel date out of a field in
 * Thai order -- 03/08/2026 is 3 August here and reads as 8 March there, on the screen
 * where they move a ticket they have already paid for. OBRS-1023 built
 * `LanguageService.calendarDateFormat` for exactly this and wired only the four
 * home/search pickers; this is the same defect one module over.
 */
describe('RescheduleDatePickerStepComponent - OBRS-1037 the date field follows the language', () => {
  let component: RescheduleDatePickerStepComponent;
  let fixture: ComponentFixture<RescheduleDatePickerStepComponent>;
  let languageService: LanguageService;

  /** Verbatim from public/i18n/*.json; `dayNamesShort` is what the `D` token resolves against. */
  const CALENDARS: Record<string, { dateFormat: string; dayNamesShort: string[] }> = {
    th: { dateFormat: 'dd/mm/yy', dayNamesShort: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] },
    en: { dateFormat: 'mm/dd/yy', dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  };

  /** Read off the DatePicker INSTANCE, not the template source: a source grep would go
   *  green the moment the literal moved into a constant. */
  function boundFormat(): string | undefined {
    return fixture.debugElement.query(By.css('p-datePicker')).componentInstance.dateFormat;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot(), DatePickerModule],
      declarations: [RescheduleDatePickerStepComponent],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    Object.entries(CALENDARS).forEach(([lang, calendar]) => translate.setTranslation(lang, { CALENDAR: calendar }));
    languageService = TestBed.inject(LanguageService);

    fixture = TestBed.createComponent(RescheduleDatePickerStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('runs on the language format, not a hardcoded Thai one', async () => {
    await languageService.switch('en');
    fixture.detectChanges();

    expect(boundFormat()).toBe('D, mm/dd/yy');
  });

  it('repaints when the language changes mid-page, with no reload', async () => {
    await languageService.switch('en');
    fixture.detectChanges();
    expect(boundFormat()).toBe('D, mm/dd/yy');

    await languageService.switch('th');
    fixture.detectChanges();

    expect(boundFormat()).toBe('D, dd/mm/yy');
  });

  /**
   * The cost OBRS-1036 already priced and the owner already ruled on: the `D` token is
   * not decorative -- `getDateFormat()` serves parse as well as render, `case 'D'` throws
   * on text with no day name, and `onUserInput` answers a throw by writing null into the
   * model. So a picker that gains this format must also stop accepting typed text, or a
   * customer watches the box empty itself. `readonly`, never `disabled`: the input must
   * still focus and still open the calendar it is now the only way into.
   */
  it('takes its value from the calendar only, and is not disabled', () => {
    const input: HTMLInputElement = fixture.debugElement.query(By.css('p-datePicker input')).nativeElement;

    expect(input.readOnly).withContext('typing must be closed off').toBeTrue();
    expect(input.disabled).withContext('disabled would shut the calendar too').toBeFalse();
    expect(input.tabIndex).withContext('must stay keyboard reachable').toBeGreaterThanOrEqual(0);
  });

  /** The step's own contract is unchanged by the display format: it emits the wire shape
   *  `GET .../reschedule-options?date=` expects, built from the Date, never from the text. */
  it('still emits YYYY-MM-DD after the format changes', async () => {
    await languageService.switch('en');
    fixture.detectChanges();

    const emitted: string[] = [];
    component.dateSelected.subscribe((v) => emitted.push(v));
    component.onSelect(new Date(2026, 7, 3));

    expect(emitted).toEqual(['2026-08-03']);
  });
});
