import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { TicketStatusLabelPipe } from './ticket-status-label.pipe';

// Mirrors COMMON.TICKET_STATUS in public/i18n/*.json — the same stub-not-import approach
// title-label.pipe.spec.ts uses. That the three real FILES agree on their key set is the
// `npm run test:i18n` parity gate's job, not this spec's.
const TH: Record<string, string> = { confirmed: 'ยืนยันแล้ว', checked_in: 'เช็คอินแล้ว', no_show: 'ไม่มาขึ้นรถ' };
const EN: Record<string, string> = { confirmed: 'Confirmed', checked_in: 'Checked in', no_show: 'No-show' };
const ZH: Record<string, string> = { confirmed: '已确认', checked_in: '已检票', no_show: '未乘车' };

/**
 * OBRS-1969. The defect is not a wrong word but a STUCK one: the server resolved the label at
 * fetch time, so the badge kept the fetch-time language while every other column followed the
 * reader. The first spec is therefore the card — one code, three languages.
 */
describe('TicketStatusLabelPipe', () => {
  let pipe: TicketStatusLabelPipe;
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
    });
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('th', { COMMON: { TICKET_STATUS: TH } });
    translate.setTranslation('en', { COMMON: { TICKET_STATUS: EN } });
    translate.setTranslation('zh', { COMMON: { TICKET_STATUS: ZH } });
    translate.use('th');
    pipe = new TicketStatusLabelPipe(translate);
  });

  it('renders one stored code as the word of whichever language is active', () => {
    expect(pipe.transform('checked_in')).toBe('เช็คอินแล้ว');

    translate.use('en');
    expect(pipe.transform('checked_in')).toBe('Checked in');

    translate.use('zh');
    expect(pipe.transform('checked_in')).toBe('已检票');
  });

  it('covers every status the boarding manifest can carry', () => {
    // TicketService.BOARDING_LIST_STATUSES on the server side — no other status reaches this table.
    expect(['confirmed', 'checked_in', 'no_show'].map((code) => pipe.transform(code))).toEqual([
      'ยืนยันแล้ว',
      'เช็คอินแล้ว',
      'ไม่มาขึ้นรถ',
    ]);
  });

  it('returns the server label verbatim for a code it does not know', () => {
    expect(pipe.transform('boarded_late', 'ขึ้นรถสาย')).toBe('ขึ้นรถสาย');
  });

  it('falls back to the code itself when an unknown code arrives with no server label', () => {
    // A blank badge tells the driver nothing; the raw code at least names the state.
    expect(pipe.transform('boarded_late')).toBe('boarded_late');
    expect(pipe.transform('boarded_late', '   ')).toBe('boarded_late');
  });

  it('renders nothing for a missing status rather than a translation key', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
