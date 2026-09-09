/**
 * OBRS-1578 — `GET /admin/reports/expense-by-payee`: how much went to each garage, fuel station or
 * other payee.
 *
 * It answers the first half of the owner's 2026-08-23 question. The second half ("อู่ขึ้นราคาไหม")
 * is NOT answerable from these figures — two bills from one garage differ because the work
 * differed — and lives on OBRS-1613.
 */

/** One selectable year, carrying what choosing it would cost. */
export interface PayeeSpendYearOptionDto {
  year: number;
  billCount: number;
  /** Scale-2 decimal string, e.g. `"16559.00"`. */
  totalAmount: string;
}

/**
 * One payee's line. `payeeId === null` is the "ยังไม่ระบุผู้รับเงิน" row — bills recorded before
 * the payee column existed. It is a row, never a silent omission.
 */
export interface PayeeSpendRowDto {
  payeeId: number | null;
  payeeName: string | null;
  payeeType: string | null;
  /** The distinct line texts off this payee's bills, in the order they first appear. */
  workDone: string[];
  billCount: number;
  totalAmount: string;
}

export interface PayeeSpendReportDto {
  /** `null` means every year — the default, and the reason the report can be trusted at a glance. */
  year: number | null;
  month: number | null;
  category: string | null;
  yearOptions: PayeeSpendYearOptionDto[];
  rows: PayeeSpendRowDto[];
  /** `null` when every bill in the window has a payee on record. */
  unassigned: PayeeSpendRowDto | null;
  assignedBillCount: number;
  assignedTotalAmount: string;
  totalBillCount: number;
  totalAmount: string;
}
