import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { TitleLabelPipe } from './title-label.pipe';
import { TITLE_OPTIONS } from '../constants/title-options';

const TH_TITLES: Record<string, string> = {
  MR: 'นาย', MRS: 'นาง', MISS: 'นางสาว', MASTER: 'เด็กชาย', MISS_CHILD: 'เด็กหญิง',
  DR: 'ดร.', PROF: 'ศ.', ASSOC_PROF: 'รศ.', ASST_PROF: 'ผศ.',
};
const EN_TITLES: Record<string, string> = {
  MR: 'Mr.', MRS: 'Mrs.', MISS: 'Miss', MASTER: 'Master', MISS_CHILD: 'Miss (Child)',
  DR: 'Dr.', PROF: 'Professor', ASSOC_PROF: 'Associate Professor', ASST_PROF: 'Assistant Professor',
};
const ZH_TITLES: Record<string, string> = {
  MR: '先生', MRS: '太太', MISS: '小姐', MASTER: '小弟弟', MISS_CHILD: '小妹妹',
  DR: '博士', PROF: '教授', ASSOC_PROF: '副教授', ASST_PROF: '助理教授',
};

/**
 * OBRS-1232. The defect this pipe closes is not "the word is wrong" but "the word cannot change":
 * the stored value WAS the English label, so no reader in any language could be shown anything
 * else. The first spec below is therefore the card — one stored value, three languages — and the
 * rest pin the cases that would quietly lose data if the pipe were simplified later.
 */
describe('TitleLabelPipe', () => {
  let pipe: TitleLabelPipe;
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
    });
    translate = TestBed.inject(TranslateService);
    // Mirrors COMMON.TITLES in public/i18n/*.json, the same stub-not-import approach
    // user-management.mappers.spec.ts uses for ROLE_NAMES (OBRS-330). That the three real FILES
    // agree on their key set is the `npm run test:i18n` parity gate's job, not this spec's.
    translate.setTranslation('th', { COMMON: { TITLES: TH_TITLES } });
    translate.setTranslation('en', { COMMON: { TITLES: EN_TITLES } });
    translate.setTranslation('zh', { COMMON: { TITLES: ZH_TITLES } });
    translate.use('th');
    pipe = new TitleLabelPipe(translate);
  });

  it('renders ONE stored code as three different words as the language changes', () => {
    expect(pipe.transform('MISS', 'กุลธิดา นาใจคง')).toBe('นางสาวกุลธิดา นาใจคง');

    translate.use('en');
    expect(pipe.transform('MISS', 'กุลธิดา นาใจคง')).toBe('Miss กุลธิดา นาใจคง');

    translate.use('zh');
    // OBRS-1644: the honorific stays IN FRONT here on purpose, and this is not OBRS-1601 debt.
    // TitleLabel.withTitle — the method these screens mirror — puts every non-Thai label in front.
    // Only TitleLabel.forGreeting moves it behind the name, and that renders the e-mail salutation,
    // which none of these surfaces is.
    expect(pipe.transform('MISS', 'กุลธิดา นาใจคง')).toBe('小姐 กุลธิดา นาใจคง');
  });

  it('attaches a Thai title to a Thai name but not to a Latin one (OBRS-1644)', () => {
    // The pipe fell out of step with the server when OBRS-1609 taught TitleLabel.separator that
    // Thai joins the title to the name, and the same person was then spelled one way on screen and
    // another in the e-mail. The rule reads the SCRIPT of BOTH halves, not the reader's language,
    // so all four combinations are pinned here: the half that is not obvious is that a one-sided
    // rule would produce 'นางสาวPassenger Name'.
    expect(pipe.transform('MISS', 'กุลธิดา นาใจคง')).toBe('นางสาวกุลธิดา นาใจคง');
    expect(pipe.transform('MISS', 'Passenger Name')).toBe('นางสาว Passenger Name');
    expect(pipe.transform('Rev.', 'กุลธิดา นาใจคง')).toBe('Rev. กุลธิดา นาใจคง');

    translate.use('en');
    expect(pipe.transform('MISS', 'กุลธิดา นาใจคง')).toBe('Miss กุลธิดา นาใจคง');
  });

  it('is impure, so a language switch reaches the screen without a refetch', () => {
    // A pure pipe caches on its input; the input here is the code, which does not change when the
    // reader switches language. That cache is exactly the OBRS-1096 / OBRS-1365 defect shape, so
    // the flag is asserted rather than trusted to survive a future tidy-up.
    const meta = (TitleLabelPipe as unknown as { ɵpipe: { pure: boolean } }).ɵpipe;
    expect(meta.pure).toBe(false);
  });

  it('returns the title alone when no name is passed - the dropdown-option case', () => {
    expect(pipe.transform('MR')).toBe('นาย');
  });

  it('passes a legacy free-text value through verbatim (AC-5), never a missing-key string', () => {
    // The admin and account fields were free text for months and the migration deliberately left
    // whatever it could not map. Printing 'COMMON.TITLES.คุณ' would be worse than printing nothing.
    // OBRS-1644: the VALUE is still verbatim; only the join moved, so that a legacy free-text 'คุณ'
    // attaches exactly as the catalogue's own 'นางสาว' does.
    expect(pipe.transform('คุณ', 'กุลธิดา')).toBe('คุณกุลธิดา');
    expect(pipe.transform('Rev.')).toBe('Rev.');
  });

  it('never emits a leading or doubled space when either half is absent', () => {
    expect(pipe.transform(null, 'กุลธิดา นาใจคง')).toBe('กุลธิดา นาใจคง');
    expect(pipe.transform('', 'กุลธิดา นาใจคง')).toBe('กุลธิดา นาใจคง');
    expect(pipe.transform('   ', 'กุลธิดา นาใจคง')).toBe('กุลธิดา นาใจคง');
    expect(pipe.transform('MR', '')).toBe('นาย');
    expect(pipe.transform('MR', null)).toBe('นาย');
    expect(pipe.transform(null, null)).toBe('');
  });

  it('every TITLE_OPTIONS code resolves in all three languages', () => {
    // Guards the seam between the constant and COMMON.TITLES: a tenth option added without its
    // labels would start printing the bare code, or the key, to users.
    for (const option of TITLE_OPTIONS) {
      expect(option.code).withContext('every title option carries a code').toBeTruthy();
      for (const [language, labels] of [['th', TH_TITLES], ['en', EN_TITLES], ['zh', ZH_TITLES]] as const) {
        translate.use(language);
        expect(pipe.transform(option.code))
          .withContext(`${option.code} in ${language}`)
          .toBe(labels[option.code as string]);
      }
    }
  });
});
