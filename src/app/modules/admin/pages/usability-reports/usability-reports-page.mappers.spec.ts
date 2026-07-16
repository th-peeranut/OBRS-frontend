import {
  DECISION_STATUSES,
  DETAIL_STATUS_VALUES,
  FIFO_STATUSES,
  OWNER_DETAIL_STATUS_VALUES,
  STATUS_FILTER_VALUES,
  StatusOption,
  buildStatusOptionList,
  categoryLabel,
  displayDateTime,
  formatBytes,
  removeRow,
  seedDecisionStatus,
  sortForStatus,
  statusClass,
  statusLabel,
  toUsabilityReportDetailFallback,
  updateRowStatus,
} from './usability-reports-page.mappers';
import {
  UsabilityReportDetail,
  UsabilityReportStatus,
  UsabilityReportSummary,
} from '../../../../shared/interfaces/usability-report.interface';

describe('usability-reports-page.mappers', () => {
  describe('STATUS_FILTER_VALUES / DETAIL_STATUS_VALUES', () => {
    it('the table filter offers all 6 statuses in order (non-terminal before terminal)', () => {
      expect(STATUS_FILTER_VALUES).toEqual([
        'new',
        'in_review',
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
      ]);
    });

    it('the admin detail dropdown offers the 4 decision statuses in order, including dismissed', () => {
      expect(DETAIL_STATUS_VALUES).toEqual(['accepted', 'dismissed', 'resolved', 'rejected']);
    });

    it('the owner detail dropdown offers in_review/accepted/dismissed (owner may screen-out, never terminate)', () => {
      expect(OWNER_DETAIL_STATUS_VALUES).toEqual(['in_review', 'accepted', 'dismissed']);
    });
  });

  describe('buildStatusOptionList', () => {
    it('maps each status value through translateFn using the ADMIN.USABILITY_REPORTS.STATUS.<value> key', () => {
      const translateFn = (key: string) => `T:${key}`;
      const options: StatusOption[] = buildStatusOptionList(['new', 'accepted'], translateFn);
      expect(options).toEqual([
        { value: 'new', label: 'T:ADMIN.USABILITY_REPORTS.STATUS.new' },
        { value: 'accepted', label: 'T:ADMIN.USABILITY_REPORTS.STATUS.accepted' },
      ]);
    });

    it('returns [] for an empty status list', () => {
      expect(buildStatusOptionList([], (key) => key)).toEqual([]);
    });

    it('preserves the input order', () => {
      const options = buildStatusOptionList(DETAIL_STATUS_VALUES, (key) => key);
      expect(options.map((o) => o.value)).toEqual(['accepted', 'dismissed', 'resolved', 'rejected']);
    });
  });

  describe('categoryLabel', () => {
    it('builds the USABILITY_REPORT.CATEGORY.<UPPERCASE> key and delegates to translateFn', () => {
      const translateFn = jasmine.createSpy('translateFn').and.returnValue('Bug Report');
      const label = categoryLabel('bug', translateFn);
      expect(translateFn).toHaveBeenCalledOnceWith('USABILITY_REPORT.CATEGORY.BUG');
      expect(label).toBe('Bug Report');
    });

    it('uppercases a mixed-case category', () => {
      const translateFn = jasmine.createSpy('translateFn').and.returnValue('x');
      categoryLabel('ux_ui_improvement', translateFn);
      expect(translateFn).toHaveBeenCalledOnceWith('USABILITY_REPORT.CATEGORY.UX_UI_IMPROVEMENT');
    });
  });

  describe('statusLabel', () => {
    it('builds the ADMIN.USABILITY_REPORTS.STATUS.<value> key and delegates to translateFn', () => {
      const translateFn = jasmine.createSpy('translateFn').and.returnValue('Resolved');
      const label = statusLabel('resolved', translateFn);
      expect(translateFn).toHaveBeenCalledOnceWith('ADMIN.USABILITY_REPORTS.STATUS.resolved');
      expect(label).toBe('Resolved');
    });

    it('does not uppercase the status (unlike categoryLabel)', () => {
      const translateFn = jasmine.createSpy('translateFn').and.returnValue('x');
      statusLabel('in_review', translateFn);
      expect(translateFn).toHaveBeenCalledOnceWith('ADMIN.USABILITY_REPORTS.STATUS.in_review');
    });
  });

  describe('statusClass', () => {
    it('maps each known status to its pill class', () => {
      expect(statusClass('new')).toBe('is-warning');
      expect(statusClass('in_review')).toBe('is-info');
      expect(statusClass('accepted')).toBe('is-accepted');
      expect(statusClass('dismissed')).toBe('is-neutral');
      expect(statusClass('resolved')).toBe('is-success');
      expect(statusClass('rejected')).toBe('is-danger');
    });

    it('returns an empty string for an unknown status', () => {
      expect(statusClass('unknown')).toBe('');
      expect(statusClass('')).toBe('');
    });
  });

  describe('formatBytes', () => {
    it('renders bytes under 1024 as B', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('renders 1024..under-1MB as KB with one decimal', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB');
    });

    it('renders 1MB and above as MB with one decimal', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('seedDecisionStatus', () => {
    it('preserves a terminal decision status (accepted/resolved/rejected)', () => {
      expect(seedDecisionStatus('accepted')).toBe('accepted');
      expect(seedDecisionStatus('resolved')).toBe('resolved');
      expect(seedDecisionStatus('rejected')).toBe('rejected');
    });

    it('clears a triage-only status (new/in_review) to empty', () => {
      expect(seedDecisionStatus('new')).toBe('');
      expect(seedDecisionStatus('in_review')).toBe('');
    });

    it('clears an already-empty status to empty', () => {
      expect(seedDecisionStatus('')).toBe('');
    });
  });

  describe('DECISION_STATUSES', () => {
    it('contains exactly accepted/resolved/rejected', () => {
      expect([...DECISION_STATUSES].sort()).toEqual(['accepted', 'rejected', 'resolved']);
    });

    it('does not contain the triage statuses', () => {
      expect(DECISION_STATUSES.has('new' as UsabilityReportStatus)).toBeFalse();
      expect(DECISION_STATUSES.has('in_review' as UsabilityReportStatus)).toBeFalse();
    });
  });

  describe('toUsabilityReportDetailFallback', () => {
    const summary: UsabilityReportSummary = {
      id: 'rep-1',
      category: 'bug',
      status: 'new',
      userId: 42,
      descriptionPreview: 'Preview text',
      imageCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
    };

    it('carries id/category/status/userId/imageCount/createdAt straight through', () => {
      const detail = toUsabilityReportDetailFallback(summary);
      expect(detail.id).toBe('rep-1');
      expect(detail.category).toBe('bug');
      expect(detail.status).toBe('new');
      expect(detail.userId).toBe(42);
      expect(detail.imageCount).toBe(3);
      expect(detail.createdAt).toBe('2026-01-01T00:00:00Z');
    });

    it('mirrors descriptionPreview into both description and descriptionPreview', () => {
      const detail = toUsabilityReportDetailFallback(summary);
      expect(detail.description).toBe('Preview text');
      expect(detail.descriptionPreview).toBe('Preview text');
    });

    it('leaves routeUrl/userAgent blank and images empty (not yet fetched)', () => {
      const detail = toUsabilityReportDetailFallback(summary);
      expect(detail.routeUrl).toBe('');
      expect(detail.userAgent).toBe('');
      expect(detail.images).toEqual([]);
    });

    it('nulls every triage/notify field (reporterEmail/triageNote/triagedBy/triagedByName/triagedAt/jiraIssueKey/reporterNotifiedAt)', () => {
      const detail = toUsabilityReportDetailFallback(summary);
      expect(detail.reporterEmail).toBeNull();
      expect(detail.triageNote).toBeNull();
      expect(detail.triagedBy).toBeNull();
      expect(detail.triagedByName).toBeNull();
      expect(detail.triagedAt).toBeNull();
      expect(detail.jiraIssueKey).toBeNull();
      expect(detail.reporterNotifiedAt).toBeNull();
    });

    it('handles a null userId (anonymous reporter)', () => {
      const anon: UsabilityReportSummary = { ...summary, userId: null };
      expect(toUsabilityReportDetailFallback(anon).userId).toBeNull();
    });
  });

  describe('updateRowStatus', () => {
    const content: UsabilityReportSummary[] = [
      {
        id: 'rep-1',
        category: 'bug',
        status: 'new',
        userId: 1,
        descriptionPreview: 'a',
        imageCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'rep-2',
        category: 'suggestion',
        status: 'new',
        userId: 2,
        descriptionPreview: 'b',
        imageCount: 0,
        createdAt: '2026-01-02T00:00:00Z',
      },
    ];

    it('replaces only the matching row status, leaving other rows untouched', () => {
      const result = updateRowStatus(content, 'rep-1', 'in_review');
      expect(result.find((r) => r.id === 'rep-1')?.status).toBe('in_review');
      expect(result.find((r) => r.id === 'rep-2')?.status).toBe('new');
    });

    it('does not mutate the input array or its elements', () => {
      const original = content.map((r) => ({ ...r }));
      updateRowStatus(content, 'rep-1', 'resolved');
      expect(content).toEqual(original);
    });

    it('is a no-op (new array, same statuses) when the id does not match any row', () => {
      const result = updateRowStatus(content, 'does-not-exist', 'resolved');
      expect(result).not.toBe(content);
      expect(result.map((r) => r.status)).toEqual(['new', 'new']);
    });
  });

  // ── OBRS-378: removeRow — a row leaving the active tab is REMOVED ────────
  describe('removeRow', () => {
    const content: UsabilityReportSummary[] = [
      {
        id: 'rep-1',
        category: 'bug',
        status: 'new',
        userId: 1,
        descriptionPreview: 'a',
        imageCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'rep-2',
        category: 'suggestion',
        status: 'new',
        userId: 2,
        descriptionPreview: 'b',
        imageCount: 0,
        createdAt: '2026-01-02T00:00:00Z',
      },
    ];

    it('removes only the matching row, leaving other rows untouched', () => {
      const result = removeRow(content, 'rep-1');
      expect(result.map((r) => r.id)).toEqual(['rep-2']);
    });

    it('does not mutate the input array', () => {
      const original = content.map((r) => ({ ...r }));
      removeRow(content, 'rep-1');
      expect(content).toEqual(original);
    });

    it('is a no-op (new array, same rows) when the id does not match any row', () => {
      const result = removeRow(content, 'does-not-exist');
      expect(result).not.toBe(content);
      expect(result.map((r) => r.id)).toEqual(['rep-1', 'rep-2']);
    });
  });

  // ── OBRS-378: sortForStatus — FIFO for actively-worked tabs ───────────────
  describe('sortForStatus / FIFO_STATUSES', () => {
    it('FIFO_STATUSES contains exactly accepted/in_review', () => {
      expect([...FIFO_STATUSES].sort()).toEqual(['accepted', 'in_review']);
    });

    it('sorts ascending (oldest first) for accepted and in_review', () => {
      expect(sortForStatus('accepted')).toEqual(['createdAt,asc', 'id,asc']);
      expect(sortForStatus('in_review')).toEqual(['createdAt,asc', 'id,asc']);
    });

    it('sorts descending (newest first) for every other status, including dismissed', () => {
      expect(sortForStatus('new')).toEqual(['createdAt,desc', 'id,desc']);
      expect(sortForStatus('dismissed')).toEqual(['createdAt,desc', 'id,desc']);
      expect(sortForStatus('resolved')).toEqual(['createdAt,desc', 'id,desc']);
      expect(sortForStatus('rejected')).toEqual(['createdAt,desc', 'id,desc']);
    });

    it('sorts descending for the empty (all-statuses) selection', () => {
      expect(sortForStatus('')).toEqual(['createdAt,desc', 'id,desc']);
    });
  });

  // ── displayDateTime: the dateLang trap ──────────────────────────────────
  //
  // CRITICAL: this page has no locale-normalization step of its own —
  // categoryLabel/statusLabel resolve entirely through translateFn (i.e.
  // TranslateService.instant, which keys off currentLang internally). The
  // ONE place this page reads translate.currentLang directly is the date
  // formatter, and it must always receive the RAW currentLang (e.g.
  // 'en-US'), never a normalized 'en'/'th' value collapsed from elsewhere —
  // that would silently change the displayed date format under en-US (same
  // trap as toRouteRow/toUserRow/toRoleRow/toVehicleRow's dateLang param).
  describe('displayDateTime', () => {
    it('formats using the given dateLang', () => {
      const result = displayDateTime('2026-07-08T10:15:00Z', 'th');
      expect(result).not.toBe('-');
      expect(result).toContain('17:15');
    });

    it('returns "-" for a null/undefined/empty value regardless of dateLang', () => {
      expect(displayDateTime(null, 'th')).toBe('-');
      expect(displayDateTime(undefined, 'en-US')).toBe('-');
      expect(displayDateTime('', 'en-US')).toBe('-');
    });

    it('CRITICAL: a th dateLang and an en-US dateLang produce different month formatting for the same value', () => {
      const thResult = displayDateTime('2026-07-08T10:15:00Z', 'th');
      const enUsResult = displayDateTime('2026-07-08T10:15:00Z', 'en-US');
      expect(thResult).not.toBe(enUsResult);
      expect(thResult).toContain('ก.ค.');
      expect(enUsResult).toContain('Jul');
    });

    it('CRITICAL: passes the raw currentLang-shaped value (e.g. "en-US") straight through as dateLang, not a normalized "en"', () => {
      // formatDisplayDateTime only distinguishes th- vs non-th- prefixed lang
      // codes, so an unnormalized 'en-US' must format identically to a bare
      // 'en' — proving displayDateTime does not need (and must not perform)
      // any locale normalization of its own before calling the formatter.
      const rawEnUs = displayDateTime('2026-07-08T10:15:00Z', 'en-US');
      const bareEn = displayDateTime('2026-07-08T10:15:00Z', 'en');
      expect(rawEnUs).toBe(bareEn);
    });
  });
});
