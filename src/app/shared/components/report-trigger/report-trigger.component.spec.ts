import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ReportTriggerComponent } from './report-trigger.component';
import { ReportUsabilityModalService } from '../../services/report-usability-modal.service';

describe('ReportTriggerComponent', () => {
  let fixture: ComponentFixture<ReportTriggerComponent>;
  let component: ReportTriggerComponent;
  let service: ReportUsabilityModalService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [ReportTriggerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportTriggerComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(ReportUsabilityModalService);
    fixture.detectChanges();
  });

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  it('is a plain in-flow button — nothing here may float over the page', () => {
    // The whole reason this component exists. `position: fixed` on the trigger
    // would reproduce OBRS-1207/OBRS-1828 in a new file with a new name.
    expect(getComputedStyle(button()).position).not.toBe('fixed');
    expect(getComputedStyle(fixture.nativeElement).position).not.toBe('fixed');
  });

  it('asks the one modal to open, and tells its host it did', () => {
    const opened = spyOn(service, 'open');
    const emitted = spyOn(component.triggered, 'emit');

    button().click();

    expect(opened).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('labels itself for screen readers in BOTH variants, and shows text only in the row', () => {
    // The icon variant carries no visible text, so the aria-label is the only
    // thing naming it — an icon-only control without one is unusable by name.
    expect(button().getAttribute('aria-label')).toBe('USABILITY_REPORT.TRIGGER.ARIA_LABEL');
    expect(button().getAttribute('title'))
      .withContext('the icon needs a hover name too')
      .toBe('USABILITY_REPORT.TRIGGER.ARIA_LABEL');
    expect(button().textContent).not.toContain('USABILITY_REPORT.TRIGGER.LABEL');

    component.variant = 'row';
    fixture.detectChanges();

    expect(button().getAttribute('aria-label')).toBe('USABILITY_REPORT.TRIGGER.ARIA_LABEL');
    expect(button().textContent).toContain('USABILITY_REPORT.TRIGGER.LABEL');
    expect(button().getAttribute('title'))
      .withContext('a row already says what it is; a tooltip repeating it is noise')
      .toBeNull();
  });

  it('stands its own skin down when the shell lends one', () => {
    // `admin-icon-btn` and `admin-nav-link` are global; the component's own
    // `--icon`/`--row` rules are encapsulated and would out-specify them, so the
    // template drops them when a class is supplied. Both applied at once is the
    // bug this pins: the trigger would stop matching its neighbours.
    expect(button().classList).toContain('report-trigger--icon');

    component.buttonClass = 'admin-icon-btn';
    fixture.detectChanges();

    expect(button().classList).toContain('admin-icon-btn');
    expect(button().classList).not.toContain('report-trigger--icon');
  });
});
