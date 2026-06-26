export interface Dropdown {
  id: number;
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
