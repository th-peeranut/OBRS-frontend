// OBRS-1463 — one row of `GET /api/private/banks`, verbatim from `BankRespDto`.
// `code` is the Bank of Thailand 3-digit code and is the ONLY value that ever
// goes on the wire in `refundDestination.bank`; the three names are display
// only. The frontend keeps no bank list of its own on purpose (AC-1) — a second
// copy is a copy that drifts from the one the backend validates against.

export interface BankDto {
  code: string;
  nameTh: string;
  nameEn: string;
  nameZh: string;
}

/** The name to show for `bank` in the language currently rendered. */
export function bankNameFor(bank: BankDto, lang: string | undefined): string {
  if (lang === 'en') {
    return bank.nameEn;
  }
  if (lang === 'zh') {
    return bank.nameZh;
  }
  return bank.nameTh;
}
