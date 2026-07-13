import { BANK_CONFIG } from "./bank";

export interface BankConfig {
  bank: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export function getBankConfig(): BankConfig {
  return {
    bank: process.env.BANK_NAME ?? BANK_CONFIG.bank,
    accountName: process.env.BANK_ACCOUNT_NAME ?? BANK_CONFIG.accountName,
    sortCode: process.env.BANK_SORT_CODE ?? BANK_CONFIG.sortCode,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER ?? BANK_CONFIG.accountNumber,
  };
}
