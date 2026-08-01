import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ConfigChangeHistoryStore } from './config-change-history.store';
import { ConfigHistoryRow } from '../../../../shared/interfaces/config-history.interface';
import {
  ActorDisplayKind,
  actorDisplayKind,
  configKeyLabel,
  ConfigValueSlot,
  displayChangedAt,
  formatConfigValue,
  roleLabel as roleLabelPure,
  ScopeDisplayKind,
  scopeDisplayKind,
} from './config-change-history-page.mappers';

type ConfigHistoryContentState = 'loading' | 'invalid' | 'error' | 'empty' | 'data';

/**
 * OBRS-576 — the ONE general config change history page, under the ระบบ
 * menu, covering every config key (UX §0/§2). One smart component + reused
 * shared primitives inline in its own template — no sub-component split, same
 * shape as ReportsPageComponent/UsabilityReportsPageComponent (UX §2).
 */
@Component({
    selector: 'app-config-change-history-page',
    templateUrl: './config-change-history-page.component.html',
    styleUrl: './config-change-history-page.component.scss',
    standalone: false
})
export class ConfigChangeHistoryPageComponent implements OnInit, OnDestroy {
  protected rows: ConfigHistoryRow[] = [];
  protected totalElements = 0;
  protected currentPage = 1;
  protected totalPages = 1;
  protected readonly pageSize = 20;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  // Date-range filter — both start empty (no default: an empty date means "no
  // bound", the correct resting state for a form-shaped input, UX §4.2).
  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;
  protected rangeError = '';

  // Config-key filter — deliberately NOT the §3.1 placeholder-no-default
  // shape: a concrete, pre-selected "all" OPTION (UX §4.1, the
  // UsabilityReportsPageComponent status-filter precedent, OBRS-524).
  protected selectedConfigKey = '';
  protected configKeyFilterOptions: { value: string; label: string }[] = [];
  // Distinct configKey values accumulated from every page this browser
  // session has successfully fetched — NEVER reset by a filter/page change
  // (UX §4.1), only by a fresh page load. There is no endpoint listing every
  // config key (SA Hard constraint #3), so this is the only source available.
  private readonly seenConfigKeys = new Set<string>();

  // Precomputed config-key -> label map for the CONFIG_KEY column, rebuilt
  // whenever `rows` changes or the language changes — never a template
  // getter/pipe that re-scans on every CD cycle (OBRS-562).
  protected readonly configKeyLabels = new Map<string, string>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: ConfigChangeHistoryStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // The store is root-scoped and OUTLIVES this component: re-entering the
    // page replays and revalidates the LAST-FETCHED filter, not a reset one.
    // Seed this component's own controls from it FIRST — otherwise the
    // dropdown reads "ทุกการตั้งค่า" and both date fields read empty above a
    // table still showing the previous visit's filtered subset, which reads as
    // "there is no other config history" (the exact silent-omission this page
    // exists to prevent). Mirrors ReportsPageComponent.ngOnInit.
    const filters = this.store.filters;
    this.selectedConfigKey = filters.configKey ?? '';
    this.fromDate = ConfigChangeHistoryPageComponent.parseDateInputValue(filters.from);
    this.toDate = ConfigChangeHistoryPageComponent.parseDateInputValue(filters.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rows = data?.content ?? [];
      this.totalElements = data?.totalElements ?? 0;
      this.currentPage = (data?.number ?? 0) + 1;
      this.totalPages = data?.totalPages ?? 0;
      this.rememberConfigKeys(this.rows);
      this.rebuildConfigKeyLabels();
      this.rebuildConfigKeyFilterOptions();
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage = failed && !this.store.hasValue ? this.resolveLoadErrorMessage() : '';
    });

    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.rebuildConfigKeyLabels();
      this.rebuildConfigKeyFilterOptions();
    });

    // Resting default (UX §13 flow 1): no filter, no range, page 1 — the
    // store's own initial state already matches this, so a plain refresh()
    // is enough (mirrors ReportsPageComponent.ngOnInit, no setRange/setConfigKey
    // call needed for the very first load).
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /**
   * Single source of truth for what the body renders (mirrors reports-page's
   * contentState) — an invalid client-checked range or a fetch error with no
   * cache REPLACES the table entirely; a valid-but-empty result keeps the
   * table chrome but swaps its body for the empty-row message (UX §8, Hard
   * constraint #4: empty and error read as different sentences, never both).
   */
  protected get contentState(): ConfigHistoryContentState {
    if (this.rangeError) {
      return 'invalid';
    }
    if (this.isLoading) {
      return 'loading';
    }
    if (this.errorMessage) {
      return 'error';
    }
    if (this.totalElements === 0) {
      return 'empty';
    }
    return 'data';
  }

  protected get rangeStart(): number {
    return this.totalElements === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  protected get rangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalElements);
  }

  protected onConfigKeyFilterChange(value: string): void {
    this.selectedConfigKey = value;
    void this.store.setConfigKey(value || undefined);
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  protected onPageChange(page: number): void {
    void this.store.setPage(page - 1);
  }

  protected configKeyLabelFor(configKey: string): string {
    return this.configKeyLabels.get(configKey) ?? configKey;
  }

  // OBRS-742: the template passes the ROW and names the slot, so the mapper can
  // tell an INSERT row's absent oldValue ("ยังไม่ได้ตั้งค่า") from a DELETE
  // row's removed newValue ("ถูกลบ"). A `formatValue(value)` overload is
  // deliberately not kept: it is the exact call shape that produced the bug.
  protected formatValue(row: ConfigHistoryRow, slot: ConfigValueSlot): string {
    return formatConfigValue(row, slot, (key, params) => this.translate.instant(key, params));
  }

  protected actorKind(row: ConfigHistoryRow): ActorDisplayKind {
    return actorDisplayKind(row);
  }

  // OBRS-722 — the "ขอบเขต" column. A separate column from ผู้แก้ไข on
  // purpose: WHO changed it and WHOSE config changed are independent, and an
  // admin editing one owner's override is a real combination.
  protected scopeKind(row: ConfigHistoryRow): ScopeDisplayKind {
    return scopeDisplayKind(row);
  }

  protected roleLabel(role: string | null): string {
    return roleLabelPure(role, (key) => this.translate.instant(key));
  }

  protected displayChangedAt(value: string): string {
    return displayChangedAt(value, this.translate.currentLang);
  }

  // Arrow-function field: *ngFor invokes trackBy as a free function, so a
  // regular method loses `this` (DEV-GOTCHAS: a component method passed as a
  // bare trackBy is invoked detached).
  protected trackById = (_index: number, row: ConfigHistoryRow): number => row.id;

  // Client guard first, mirrors reports-page.component.ts:163-167 exactly —
  // only a range that passes is dispatched to the store; an invalid one shows
  // an inline warning and fires no request. Unlike reports-page, only ONE
  // bound may be set at a time here (from-only / to-only are both valid — UX
  // §4.2), so the comparison only applies once BOTH are present.
  private applyRange(): void {
    this.rangeError = '';

    const from = this.fromDate ? ConfigChangeHistoryPageComponent.toDateInputValue(this.fromDate) : undefined;
    const to = this.toDate ? ConfigChangeHistoryPageComponent.toDateInputValue(this.toDate) : undefined;

    if (from && to && from > to) {
      this.rangeError = this.translate.instant('ADMIN.CONFIG_CHANGE_HISTORY.ERROR.RANGE_INVALID');
      return;
    }

    void this.store.setRange(from, to);
  }

  // Server 400 backstop (race / defense-in-depth, UX §4.2) — branches on the
  // stable errorCode, never the localized message (design-system §9). Only
  // meaningful when there's no cache to fall back on.
  private resolveLoadErrorMessage(): string {
    const code = this.store.lastErrorCode;
    if (code === 'CONFIG_HISTORY_RANGE_INVALID') {
      return this.translate.instant('ADMIN.CONFIG_CHANGE_HISTORY.ERROR.RANGE_INVALID');
    }
    return this.translate.instant('ADMIN.CONFIG_CHANGE_HISTORY.LOAD_FAILED');
  }

  private rememberConfigKeys(rows: ConfigHistoryRow[]): void {
    for (const row of rows) {
      this.seenConfigKeys.add(row.configKey);
    }
  }

  private rebuildConfigKeyLabels(): void {
    this.configKeyLabels.clear();
    for (const row of this.rows) {
      this.configKeyLabels.set(
        row.configKey,
        configKeyLabel(row.configKey, (key) => this.translate.instant(key))
      );
    }
  }

  private rebuildConfigKeyFilterOptions(): void {
    const allLabel = this.translate.instant('ADMIN.CONFIG_CHANGE_HISTORY.FILTER.ALL_KEYS');
    const sortedKeys = Array.from(this.seenConfigKeys).sort((a, b) => a.localeCompare(b));
    this.configKeyFilterOptions = [
      { value: '', label: allLabel },
      ...sortedKeys.map((key) => ({
        value: key,
        label: configKeyLabel(key, (k) => this.translate.instant(k)),
      })),
    ];
  }

  // Inverse of toDateInputValue, for seeding the p-datePicker controls from the
  // store's retained `yyyy-MM-dd` filter on mount (same helper shape as
  // reports-page.component.ts:204).
  private static parseDateInputValue(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
