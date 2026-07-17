import {
  appendPage,
  categoryLabel,
  displayDateTime,
  statusClass,
  statusLabel,
  toDetailFallback,
  truncatePreview,
  updateSummaryRow,
} from './my-reports.mappers';
import { MyUsabilityReportPage, MyUsabilityReportSummary } from '../../shared/interfaces/usability-report.interface';

describe('my-reports.mappers', () => {
  describe('statusClass', () => {
    const cases: [string, string][] = [
      ['new', 'is-warning'],
      ['in_review', 'is-info'],
      ['accepted', 'is-accepted'],
      ['dismissed', 'is-neutral'],
      ['resolved', 'is-success'],
      ['rejected', 'is-danger'],
      ['duplicate', 'is-duplicate'],
    ];

    cases.forEach(([status, expected]) => {
      it(`maps ${status} -> ${expected}`, () => {
        expect(statusClass(status)).toBe(expected);
      });
    });

    it('maps every status to a DISTINCT token (no collisions)', () => {
      const tokens = cases.map(([status]) => statusClass(status));
      expect(new Set(tokens).size).toBe(tokens.length);
    });

    it('returns an empty string for an unknown status', () => {
      expect(statusClass('unknown')).toBe('');
    });
  });

  describe('statusLabel / categoryLabel', () => {
    it('statusLabel keys into USABILITY_REPORT.MY_REPORTS.STATUS.*', () => {
      const translateFn = (key: string) => key;
      expect(statusLabel('new', translateFn)).toBe('USABILITY_REPORT.MY_REPORTS.STATUS.new');
    });

    it('categoryLabel reuses the EXISTING USABILITY_REPORT.CATEGORY.* keys (not a MY_REPORTS duplicate)', () => {
      const translateFn = (key: string) => key;
      expect(categoryLabel('bug', translateFn)).toBe('USABILITY_REPORT.CATEGORY.BUG');
    });
  });

  describe('displayDateTime', () => {
    it('delegates to the shared Bangkok formatter', () => {
      expect(displayDateTime(null, 'en')).toBe('-');
    });
  });

  describe('truncatePreview', () => {
    it('returns the trimmed text unchanged when at or under the max length', () => {
      expect(truncatePreview('  short text  ')).toBe('short text');
    });

    it('truncates and appends an ellipsis when over the max length', () => {
      const long = 'x'.repeat(200);
      const result = truncatePreview(long);
      expect(result.length).toBe(141); // 140 chars + ellipsis
      expect(result.endsWith('…')).toBeTrue();
    });
  });

  describe('updateSummaryRow', () => {
    const rows: MyUsabilityReportSummary[] = [
      { id: 1, category: 'bug', status: 'new', descriptionPreview: 'a', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, category: 'suggestion', status: 'new', descriptionPreview: 'b', imageCount: 1, createdAt: '2026-01-02T00:00:00Z' },
    ];

    it('patches only the matching row, leaving id/status/createdAt untouched', () => {
      const result = updateSummaryRow(rows, 1, {
        category: 'ux_ui_improvement',
        descriptionPreview: 'updated',
        imageCount: 3,
      });

      expect(result[0]).toEqual({
        id: 1,
        category: 'ux_ui_improvement',
        status: 'new',
        descriptionPreview: 'updated',
        imageCount: 3,
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result[1]).toEqual(rows[1]);
    });

    it('leaves the array untouched when no row matches the id', () => {
      const result = updateSummaryRow(rows, 999, {
        category: 'bug',
        descriptionPreview: 'x',
        imageCount: 0,
      });
      expect(result).toEqual(rows);
    });
  });

  describe('toDetailFallback', () => {
    const summary: MyUsabilityReportSummary = {
      id: 1,
      category: 'bug',
      status: 'new',
      descriptionPreview: 'Preview text',
      imageCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
    };

    it('carries id/category/status/description/createdAt straight through', () => {
      const detail = toDetailFallback(summary);
      expect(detail.id).toBe(1);
      expect(detail.category).toBe('bug');
      expect(detail.status).toBe('new');
      expect(detail.description).toBe('Preview text');
      expect(detail.createdAt).toBe('2026-01-01T00:00:00Z');
    });

    it('derives editable=true when status is new', () => {
      expect(toDetailFallback(summary).editable).toBeTrue();
    });

    it('derives editable=false for a non-new status', () => {
      expect(toDetailFallback({ ...summary, status: 'resolved' }).editable).toBeFalse();
    });

    it('leaves images/followUps empty and triageNote null pending the real fetch', () => {
      const detail = toDetailFallback(summary);
      expect(detail.images).toEqual([]);
      expect(detail.followUps).toEqual([]);
      expect(detail.triageNote).toBeNull();
    });
  });

  describe('appendPage', () => {
    it('appends the next page content after the current content and adopts the next page metadata', () => {
      const current: MyUsabilityReportPage = {
        content: [
          { id: 1, category: 'bug', status: 'new', descriptionPreview: 'a', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' },
        ],
        totalElements: 21,
        totalPages: 2,
        size: 20,
        number: 0,
        numberOfElements: 1,
      };
      const next: MyUsabilityReportPage = {
        content: [
          { id: 2, category: 'suggestion', status: 'new', descriptionPreview: 'b', imageCount: 0, createdAt: '2026-01-02T00:00:00Z' },
        ],
        totalElements: 21,
        totalPages: 2,
        size: 20,
        number: 1,
        numberOfElements: 1,
      };

      const result = appendPage(current, next);

      expect(result.content.map((r) => r.id)).toEqual([1, 2]);
      expect(result.number).toBe(1);
      expect(result.totalPages).toBe(2);
    });
  });
});
