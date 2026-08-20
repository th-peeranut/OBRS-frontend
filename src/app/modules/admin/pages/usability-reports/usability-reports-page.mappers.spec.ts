import { HttpErrorResponse } from '@angular/common/http';
import {
  DECISION_STATUSES,
  ALLOWED_TARGETS,
  DETAIL_STATUS_VALUES,
  FIFO_STATUSES,
  MARK_AS_DUPLICATE_STATUSES,
  OWNER_ALLOWED_TARGETS,
  OWNER_DETAIL_STATUS_VALUES,
  STATUS_FILTER_VALUES,
  StatusOption,
  buildStatusOptionList,
  canMarkAsDuplicate,
  categoryLabel,
  detailStatusValuesFor,
  displayDateTime,
  extractUsabilityReportErrorCode,
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
    it('the table filter offers "all" (OBRS-524) plus all 8 statuses (OBRS-378 dismissed + OBRS-376 duplicate + OBRS-527 owner_accepted) in order, non-terminal before terminal', () => {
      expect(STATUS_FILTER_VALUES).toEqual([
        'all',
        'new',
        'in_review',
        'owner_accepted',
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
        'duplicate',
      ]);
    });

    it('the admin detail dropdown offers the 4 decision statuses in order, including dismissed — duplicate is never dropdown-selectable', () => {
      expect(DETAIL_STATUS_VALUES).toEqual(['accepted', 'dismissed', 'resolved', 'rejected']);
      expect(DETAIL_STATUS_VALUES).not.toContain('duplicate' as UsabilityReportStatus);
    });

    // OBRS-527: 'accepted' DROPPED (PO-2 — every transition out of/into
    // 'accepted' is admin-only) and 'owner_accepted' ADDED — the owner's full
    // set, filtered per-report by detailStatusValuesFor() below.
    it('the owner detail dropdown offers in_review/owner_accepted/dismissed (owner may screen-out, never terminate, never accept onto the platform)', () => {
      expect(OWNER_DETAIL_STATUS_VALUES).toEqual(['in_review', 'owner_accepted', 'dismissed']);
    });
  });

  // OBRS-527: detailStatusValuesFor / OWNER_ALLOWED_TARGETS — the source-aware
  // detail dropdown that solves PO-2 (no legal owner move out of an
  // already-finalized report) and the owner-undo case with one mechanism.
  describe('detailStatusValuesFor / OWNER_ALLOWED_TARGETS', () => {
    it('OWNER_ALLOWED_TARGETS mirrors the backend ALLOWED_TRANSITIONS matrix, restricted to owner-legal targets, cell by cell', () => {
      expect(OWNER_ALLOWED_TARGETS.new).toEqual(['in_review', 'dismissed']);
      expect(OWNER_ALLOWED_TARGETS.in_review).toEqual(['owner_accepted', 'dismissed']);
      expect(OWNER_ALLOWED_TARGETS.owner_accepted).toEqual(['in_review', 'dismissed']);
      expect(OWNER_ALLOWED_TARGETS.accepted).toEqual([]);
      expect(OWNER_ALLOWED_TARGETS.dismissed).toEqual(['in_review']);
      expect(OWNER_ALLOWED_TARGETS.resolved).toEqual([]);
      expect(OWNER_ALLOWED_TARGETS.rejected).toEqual([]);
      expect(OWNER_ALLOWED_TARGETS.duplicate).toEqual([]);
    });

    // OBRS-1473: admin used to get the fixed DETAIL_STATUS_VALUES for EVERY
    // source — the bug. On SIT (measured 2026-08-20) 12 of 13 reports were
    // `resolved`, so 12 of 13 detail modals offered four options the backend
    // answers with 400 REPORT_INVALID_TRANSITION.
    it('admin never gets an option the backend would reject — every admin option is either a legal edge or the always-legal same-state diagonal', () => {
      const everySource: readonly UsabilityReportStatus[] = [
        'new',
        'in_review',
        'owner_accepted',
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
        'duplicate',
      ];
      for (const source of everySource) {
        for (const option of detailStatusValuesFor(true, source)) {
          expect([...ALLOWED_TARGETS[source], source])
            .withContext(`admin option "${option}" offered on a "${source}" report`)
            .toContain(option);
        }
      }
    });

    it('admin viewing a resolved report gets the reopen plus the same-state note edit — not the four impossible ones (OBRS-1473/1474)', () => {
      expect(detailStatusValuesFor(true, 'resolved')).toEqual(['in_review', 'resolved']);
    });

    it('admin viewing a rejected report gets only the same-state note edit — rejected stays terminal', () => {
      expect(detailStatusValuesFor(true, 'rejected')).toEqual(['rejected']);
    });

    it('admin viewing a dismissed or duplicate report gets exactly the pull-back option', () => {
      expect(detailStatusValuesFor(true, 'dismissed')).toEqual(['in_review']);
      expect(detailStatusValuesFor(true, 'duplicate')).toEqual(['in_review']);
    });

    it('admin viewing an in_review report is UNCHANGED by this card — still the four decision outcomes', () => {
      expect(detailStatusValuesFor(true, 'in_review')).toEqual(DETAIL_STATUS_VALUES);
    });

    it('admin viewing an accepted report is UNCHANGED by this card — the three legal edges plus its own status', () => {
      expect(detailStatusValuesFor(true, 'accepted')).toEqual([
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
      ]);
    });

    it('admin never gets owner_accepted — that tier stays the owner\'s to set', () => {
      expect(detailStatusValuesFor(true, 'in_review')).not.toContain(
        'owner_accepted' as UsabilityReportStatus
      );
    });

    it('ALLOWED_TARGETS mirrors the backend matrix, cell by cell (UsabilityReportService.ALLOWED_TRANSITIONS)', () => {
      expect(ALLOWED_TARGETS.new).toEqual(['in_review', 'accepted', 'dismissed', 'rejected']);
      expect(ALLOWED_TARGETS.in_review).toEqual([
        'owner_accepted',
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
      ]);
      expect(ALLOWED_TARGETS.owner_accepted).toEqual([
        'in_review',
        'accepted',
        'dismissed',
        'resolved',
        'rejected',
      ]);
      expect(ALLOWED_TARGETS.accepted).toEqual(['resolved', 'rejected', 'dismissed']);
      expect(ALLOWED_TARGETS.dismissed).toEqual(['in_review']);
      // OBRS-1474 — the reopen edge, and the one status it deliberately skipped.
      expect(ALLOWED_TARGETS.resolved).toEqual(['in_review']);
      expect(ALLOWED_TARGETS.rejected).toEqual([]);
      expect(ALLOWED_TARGETS.duplicate).toEqual(['in_review']);
    });

    it('owner viewing an already-finalized report (accepted/resolved/rejected/duplicate) gets [] — PO-2, no legal move exists', () => {
      expect(detailStatusValuesFor(false, 'accepted')).toEqual([]);
      expect(detailStatusValuesFor(false, 'resolved')).toEqual([]);
      expect(detailStatusValuesFor(false, 'rejected')).toEqual([]);
      expect(detailStatusValuesFor(false, 'duplicate')).toEqual([]);
    });

    it('owner viewing an owner_accepted report gets in_review/dismissed — excludes accepted and excludes itself', () => {
      const options = detailStatusValuesFor(false, 'owner_accepted');
      expect(options).toContain('in_review');
      expect(options).toContain('dismissed');
      expect(options).not.toContain('accepted' as UsabilityReportStatus);
      expect(options).not.toContain('owner_accepted' as UsabilityReportStatus);
    });

    it('owner viewing a new report gets in_review/dismissed (owner_accepted is deliberately closed from "new")', () => {
      expect(detailStatusValuesFor(false, 'new')).toEqual(['in_review', 'dismissed']);
    });

    it('owner viewing an in_review report gets owner_accepted/dismissed', () => {
      expect(detailStatusValuesFor(false, 'in_review')).toEqual(['owner_accepted', 'dismissed']);
    });

    it('owner with no report open (sourceStatus="") gets the full OWNER_DETAIL_STATUS_VALUES set', () => {
      expect(detailStatusValuesFor(false, '')).toEqual(OWNER_DETAIL_STATUS_VALUES);
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
      expect(statusClass('owner_accepted')).toBe('is-owner-accepted');
      expect(statusClass('accepted')).toBe('is-accepted');
      expect(statusClass('dismissed')).toBe('is-neutral');
      expect(statusClass('resolved')).toBe('is-success');
      expect(statusClass('rejected')).toBe('is-danger');
    });

    it('owner_accepted gets its own token, distinct from in_review and accepted (OBRS-527)', () => {
      expect(statusClass('owner_accepted')).not.toBe(statusClass('in_review'));
      expect(statusClass('owner_accepted')).not.toBe(statusClass('accepted'));
    });

    it('maps duplicate to its own is-duplicate token, distinct from dismissed (PO decision, 2026-07-16)', () => {
      expect(statusClass('duplicate')).toBe('is-duplicate');
      expect(statusClass('duplicate')).not.toBe(statusClass('dismissed'));
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

    // OBRS-527: owner_accepted is a decision (stamps triagedBy/triagedAt), so
    // a report already sitting at owner_accepted pre-seeds the dropdown to
    // it, same as the other three.
    it('preserves owner_accepted', () => {
      expect(seedDecisionStatus('owner_accepted')).toBe('owner_accepted');
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
    it('contains exactly accepted/resolved/rejected/owner_accepted', () => {
      expect([...DECISION_STATUSES].sort()).toEqual([
        'accepted',
        'owner_accepted',
        'rejected',
        'resolved',
      ]);
    });

    it('does not contain the triage statuses', () => {
      expect(DECISION_STATUSES.has('new' as UsabilityReportStatus)).toBeFalse();
      expect(DECISION_STATUSES.has('in_review' as UsabilityReportStatus)).toBeFalse();
    });
  });

  describe('MARK_AS_DUPLICATE_STATUSES / canMarkAsDuplicate', () => {
    it('contains exactly new/in_review/owner_accepted/accepted', () => {
      expect([...MARK_AS_DUPLICATE_STATUSES].sort()).toEqual([
        'accepted',
        'in_review',
        'new',
        'owner_accepted',
      ]);
    });

    it('canMarkAsDuplicate is true for new/in_review/owner_accepted/accepted', () => {
      expect(canMarkAsDuplicate('new')).toBeTrue();
      expect(canMarkAsDuplicate('in_review')).toBeTrue();
      expect(canMarkAsDuplicate('owner_accepted')).toBeTrue();
      expect(canMarkAsDuplicate('accepted')).toBeTrue();
    });

    it('canMarkAsDuplicate is false for terminal decisions and for an already-duplicate report', () => {
      expect(canMarkAsDuplicate('resolved')).toBeFalse();
      expect(canMarkAsDuplicate('rejected')).toBeFalse();
      expect(canMarkAsDuplicate('duplicate')).toBeFalse();
    });
  });

  describe('extractUsabilityReportErrorCode', () => {
    it('extracts error.error.errorCode from an HttpErrorResponse', () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: { errorCode: 'REPORT_CANONICAL_SELF_REFERENCE' },
      });
      expect(extractUsabilityReportErrorCode(error)).toBe('REPORT_CANONICAL_SELF_REFERENCE');
    });

    it('returns null when the error body has no errorCode', () => {
      const error = new HttpErrorResponse({ status: 500, error: { message: 'boom' } });
      expect(extractUsabilityReportErrorCode(error)).toBeNull();
    });

    it('returns null for a non-HttpErrorResponse error', () => {
      expect(extractUsabilityReportErrorCode(new Error('network down'))).toBeNull();
    });
  });

  describe('toUsabilityReportDetailFallback', () => {
    const summary: UsabilityReportSummary = {
      id: 1,
      category: 'bug',
      status: 'new',
      userId: 42,
      descriptionPreview: 'Preview text',
      imageCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
      duplicateOfId: null,
      duplicateCount: 0,
    };

    it('carries id/category/status/userId/imageCount/createdAt straight through', () => {
      const detail = toUsabilityReportDetailFallback(summary);
      expect(detail.id).toBe(1);
      expect(detail.category).toBe('bug');
      expect(detail.status).toBe('new');
      expect(detail.userId).toBe(42);
      expect(detail.imageCount).toBe(3);
      expect(detail.createdAt).toBe('2026-01-01T00:00:00Z');
    });

    it('carries duplicateOfId/duplicateCount straight through (OBRS-376 — already known from the summary row)', () => {
      const withDuplicateMeta: UsabilityReportSummary = { ...summary, duplicateOfId: 7, duplicateCount: 2 };
      const detail = toUsabilityReportDetailFallback(withDuplicateMeta);
      expect(detail.duplicateOfId).toBe(7);
      expect(detail.duplicateCount).toBe(2);
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
        id: 1,
        category: 'bug',
        status: 'new',
        userId: 1,
        descriptionPreview: 'a',
        imageCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        duplicateOfId: null,
        duplicateCount: 0,
      },
      {
        id: 2,
        category: 'suggestion',
        status: 'new',
        userId: 2,
        descriptionPreview: 'b',
        imageCount: 0,
        createdAt: '2026-01-02T00:00:00Z',
        duplicateOfId: null,
        duplicateCount: 0,
      },
    ];

    it('replaces only the matching row status, leaving other rows untouched', () => {
      const result = updateRowStatus(content, 1, 'in_review');
      expect(result.find((r) => r.id === 1)?.status).toBe('in_review');
      expect(result.find((r) => r.id === 2)?.status).toBe('new');
    });

    it('does not mutate the input array or its elements', () => {
      const original = content.map((r) => ({ ...r }));
      updateRowStatus(content, 1, 'resolved');
      expect(content).toEqual(original);
    });

    it('is a no-op (new array, same statuses) when the id does not match any row', () => {
      const result = updateRowStatus(content, 999, 'resolved');
      expect(result).not.toBe(content);
      expect(result.map((r) => r.status)).toEqual(['new', 'new']);
    });
  });

  // ── OBRS-378: removeRow — a row leaving the active tab is REMOVED ────────
  describe('removeRow', () => {
    const content: UsabilityReportSummary[] = [
      {
        id: 1,
        category: 'bug',
        status: 'new',
        userId: 1,
        descriptionPreview: 'a',
        imageCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        duplicateOfId: null,
        duplicateCount: 0,
      },
      {
        id: 2,
        category: 'suggestion',
        status: 'new',
        userId: 2,
        descriptionPreview: 'b',
        imageCount: 0,
        createdAt: '2026-01-02T00:00:00Z',
        duplicateOfId: null,
        duplicateCount: 0,
      },
    ];

    it('removes only the matching row, leaving other rows untouched', () => {
      const result = removeRow(content, 1);
      expect(result.map((r) => r.id)).toEqual([2]);
    });

    it('does not mutate the input array', () => {
      const original = content.map((r) => ({ ...r }));
      removeRow(content, 1);
      expect(content).toEqual(original);
    });

    it('is a no-op (new array, same rows) when the id does not match any row', () => {
      const result = removeRow(content, 999);
      expect(result).not.toBe(content);
      expect(result.map((r) => r.id)).toEqual([1, 2]);
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

    it('sorts descending for the empty (pre-init, unset) selection', () => {
      expect(sortForStatus('')).toEqual(['createdAt,desc', 'id,desc']);
    });

    it('sorts descending for the "all" (OBRS-524) selection — no single FIFO queue when every status is mixed', () => {
      expect(sortForStatus('all')).toEqual(['createdAt,desc', 'id,desc']);
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
