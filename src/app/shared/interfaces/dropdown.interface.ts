export interface Dropdown {
  id: number;
  /**
   * OBRS-1232: language-neutral code PERSISTED for this option (e.g. 'MISS'), as opposed to the
   * three name* labels below, which exist only to render it. Present on TITLE_OPTIONS; every other
   * list still identifies itself by `id` alone and leaves this undefined.
   */
  code?: string;
  nameThai: string;
  nameEnglish: string;
  /** Optional Chinese label; falls back to nameEnglish when absent. */
  nameChinese?: string;
  isDefault?: boolean;
}

export interface DropdownPassenger {
  type: string;
  count: number;
}
