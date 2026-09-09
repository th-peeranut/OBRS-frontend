import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PartUnitPriceReportPageComponent } from './part-unit-price-report-page.component';
import { PartUnitPriceReportStore } from './part-unit-price-report.store';
import {
  PartUnitPriceLineDto,
  PartUnitPriceReportDto,
} from '../../../../shared/interfaces/part-unit-price-report.interface';
import { AdminSharedModule } from '../../admin-shared.module';
import { AdminDropdownComponent } from '../../components/admin-dropdown/admin-dropdown.component';

/**
 * OBRS-1613 AC3/AC4/AC5. The fixtures are the owner's own bills (2026-08-25).
 */
describe('PartUnitPriceReportPageComponent', () => {
  function line(overrides: Partial<PartUnitPriceLineDto> = {}): PartUnitPriceLineDto {
    return {
      expenseId: 1,
      expenseDate: '2026-07-28',
      payeeName: 'อู่ช่างปุ้น',
      unit: 'กระป๋อง',
      unitPrice: '400.00',
      status: 'COMPARABLE',
      ...overrides,
    };
  }

  function makeReport(overrides: Partial<PartUnitPriceReportDto> = {}): PartUnitPriceReportDto {
    return {
      partId: 501,
      partOptions: [
        { partId: 501, partName: 'จาระบี', partCode: null, lineCount: 2, comparableLineCount: 2 },
        {
          partId: 504,
          partName: 'น้ำมันเครื่อง',
          partCode: 'ENGINE_OIL',
          lineCount: 1,
          comparableLineCount: 1,
        },
      ],
      lines: [
        line({ expenseId: 2, expenseDate: '2025-01-16', payeeName: 'เอนกเซอร์วิส', unitPrice: '480.00' }),
        line(),
      ],
      coverage: {
        totalAmount: '6590.00',
        totalLineCount: 9,
        comparableAmount: '4560.00',
        comparableLineCount: 6,
        unnamedAmount: '1730.00',
        unnamedLineCount: 1,
        excludedPriceAmount: '300.00',
        excludedPriceLineCount: 2,
      },
      ...overrides,
    };
  }

  function makeStoreStub(
    data: PartUnitPriceReportDto | null,
    filter: { partId: number | null } = { partId: 501 }
  ) {
    return {
      data$: new BehaviorSubject<PartUnitPriceReportDto | null>(data),
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      filter,
      hasValue: data !== null,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setPart: jasmine.createSpy('setPart'),
    };
  }

  let fixture: ComponentFixture<PartUnitPriceReportPageComponent>;
  let storeStub: ReturnType<typeof makeStoreStub>;

  async function mount(filter: { partId: number | null } = { partId: 501 }): Promise<void> {
    TestBed.resetTestingModule();
    storeStub = makeStoreStub(null, filter);

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [PartUnitPriceReportPageComponent],
      providers: [{ provide: PartUnitPriceReportStore, useValue: storeStub }],
    }).compileComponents();

    // Only the coverage sentences, and only so the interpolated FIGURES reach the DOM. With no
    // bundle at all `| translate` echoes the key, and an assertion on "6,590" would then be
    // passing against a template that interpolated nothing - the exact shape of test that made
    // this card's earlier picker spec assert the generic fallback for three rounds.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: {
        PART_UNIT_PRICE_REPORT: {
          COVERAGE_TEXT: 'total {{total}} comparable {{comparable}} {{comparableLines}}/{{totalLines}}',
          COVERAGE_EXCLUDED: 'unnamed {{unnamed}} noPrice {{noPrice}}',
          PART_OPTION: '{{name}} [{{comparable}}/{{lines}}]',
          PAYEE_UNKNOWN: 'ไม่ได้ระบุผู้รับเงิน',
        },
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(PartUnitPriceReportPageComponent);
  }

  function renderReport(report: PartUnitPriceReportDto): void {
    storeStub.hasValue = true;
    storeStub.data$.next(report);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await mount();
  });

  it('draws one bar per comparable bill, oldest first', () => {
    renderReport(makeReport());

    const amounts = Array.from(
      fixture.nativeElement.querySelectorAll('.part-price-bar-amount')
    ).map((element) => (element as HTMLElement).textContent?.trim());
    expect(amounts.length).toBe(2);
    // The 2025 bill is the dearer one, so it is the full-width bar - and it is also first.
    expect(amounts[0]).toContain('480');
    const fills = fixture.nativeElement.querySelectorAll('.part-price-bar-fill');
    expect((fills[0] as HTMLElement).style.width).toBe('100%');
  });

  // AC4. Found the same way the retired-part bug was: the rule was written down before it was
  // wired, so it is asserted rather than described.
  it('lists a ฿0 line and a no-price line as DIFFERENT exclusions, and charts neither', () => {
    renderReport(
      makeReport({
        lines: [
          line({ expenseId: 1, unit: 'ต้น', unitPrice: '2950.00' }),
          line({ expenseId: 4, unit: 'ต้น', unitPrice: '2600.00' }),
          line({
            expenseId: 3,
            unit: 'ต้น',
            unitPrice: '0.00',
            status: 'EXCLUDED_ZERO_PRICE',
          }),
          line({
            expenseId: 3,
            unit: 'ต้น',
            unitPrice: null,
            status: 'EXCLUDED_NO_UNIT_PRICE',
          }),
        ],
      })
    );

    // Four lines in the table, two bars in the chart. Two comparable lines and not one, because a
    // single price renders the no-comparison state instead of a chart - and then there would be no
    // chart for the exclusions to have been left out of.
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.part-price-excluded').length).toBe(2);

    // Two DIFFERENT sentences, not one "ไม่นับ" twice - the ฿0 was the owner's own part, the blank
    // one is a bill that never wrote a per-unit price.
    const statuses = Array.from(
      fixture.nativeElement.querySelectorAll('.part-price-status')
    ).map((element) => (element as HTMLElement).textContent?.trim());
    expect(statuses[2]).not.toBe(statuses[3]);
  });

  // AC5. The report saying what it cannot speak for, unconditionally - not a footnote that only
  // appears when somebody decided the gap was big enough to mention.
  it('always states its own coverage, including the lines that name no part at all', () => {
    renderReport(makeReport());

    const coverage = fixture.nativeElement.querySelector('.part-price-coverage');
    expect(coverage).not.toBeNull();
    expect(coverage.textContent).toContain('6,590');
    expect(coverage.textContent).toContain('4,560');
    expect(coverage.textContent).toContain('1,730');
  });

  it('says there is nothing to compare rather than drawing a chart of one bar', () => {
    renderReport(makeReport({ lines: [line()] }));

    expect(fixture.nativeElement.querySelector('.part-price-no-comparison')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(0);
    // The line itself is still listed - the bill exists, it just has nothing to be compared with.
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('refuses to compare two prices written in two different units', () => {
    // Two prices, no comparison. Scaling ฿400 per กระป๋อง against ฿480 per ลิตร would print a 20%
    // price rise between two measurements that are not the same measurement.
    renderReport(
      makeReport({
        lines: [
          line({ expenseId: 1, unit: 'กระป๋อง', unitPrice: '400.00' }),
          line({ expenseId: 2, unit: 'ลิตร', unitPrice: '480.00' }),
        ],
      })
    );

    expect(fixture.nativeElement.querySelector('.part-price-no-comparison')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(0);
  });

  it('offers the registry entries as the one filter, through the shared dropdown', async () => {
    // design-system.md 3.1. And exactly ONE dropdown: the year/month/category row its sibling
    // carries would be a period filter this report deliberately does not have.
    renderReport(makeReport());

    const dropdowns = fixture.debugElement
      .queryAll(By.directive(AdminDropdownComponent))
      .map((element) => element.componentInstance as AdminDropdownComponent);
    expect(dropdowns.length).toBe(1);
    expect(dropdowns[0].options.length).toBe(2);
  });

  it('translates a seeded entry and leaves an owner-typed one in Thai', () => {
    // The owner's ruling of 2026-08-25: translated iff the row carries a code. TranslateModule has
    // no bundle loaded here, so `instant` echoes the key - which is what a MISSING translation
    // looks like, and the label falls back to the stored name either way. What is asserted is that
    // the coded row went through the key path at all.
    renderReport(makeReport());

    const dropdown = fixture.debugElement.query(By.directive(AdminDropdownComponent))
      .componentInstance as AdminDropdownComponent;
    const labels = (dropdown.options as { label: string }[]).map((option) => option.label);
    expect(labels[0]).toContain('จาระบี');
    expect(labels[1]).toContain('น้ำมันเครื่อง');
    // And the counts ride along, so an entry with nothing to compare says so BEFORE the click.
    expect(labels[1]).toContain('[1/1]');
  });

  it('draws a bill that has no garage on record rather than dropping it', () => {
    // `expenses.payee_id` has been nullable and unbackfilled since V121, so the oldest bills have
    // no payee. A price with no garage against it is still a price - dropping the bar would
    // quietly shrink the history the chart is there to show.
    renderReport(
      makeReport({
        lines: [
          line({ expenseId: 1, payeeName: null, unitPrice: '400.00' }),
          line({ expenseId: 2, unitPrice: '480.00' }),
        ],
      })
    );

    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(2);
    const who = fixture.nativeElement.querySelector('.part-price-bar-who').textContent;
    expect(who).toContain('ไม่ได้ระบุผู้รับเงิน');
  });

  it('asks for a part instead of rendering an empty chart before one is chosen', () => {
    renderReport(makeReport({ partId: null, lines: [] }));

    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(0);
    expect(fixture.nativeElement.querySelector('tbody')).toBeNull();
    // The coverage still renders: it describes the whole of the spend, not the selection.
    expect(fixture.nativeElement.querySelector('.part-price-coverage')).not.toBeNull();
  });

  it('renders the part the RESPONSE is about, not the one that was just clicked', () => {
    // Found by obrs-scrutinize 2026-08-29: `PartUnitPriceReportRespDto#partId` is an echo whose
    // javadoc claimed it stopped a late response rendering under the wrong part, and nothing read
    // it. The store here says 501 was clicked; the response in hand is still the one for nothing
    // selected. Branching the content on the CLICK would draw that empty response beneath the new
    // part's name for a round trip.
    expect(storeStub.filter.partId).toBe(501);

    renderReport(makeReport({ partId: null, lines: [line()] }));

    expect(fixture.nativeElement.querySelector('tbody')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.part-price-bar-fill').length).toBe(0);
  });

  it('keeps stating the coverage even when no bill has ever named a registry entry', () => {
    // The emptiest report is the one where the coverage figure matters most: every baht on record
    // is uncomparable, and a screen that hid the number there would be saying least exactly where
    // it had most to explain.
    renderReport(makeReport({ partOptions: [], lines: [] }));

    expect(fixture.nativeElement.querySelector('.part-price-chart')).toBeNull();
    const coverage = fixture.nativeElement.querySelector('.part-price-coverage');
    expect(coverage).not.toBeNull();
    expect(coverage.textContent).toContain('6,590');
  });
});
