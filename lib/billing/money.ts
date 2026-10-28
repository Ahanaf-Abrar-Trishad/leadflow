const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

export const INVOICE_KIND_LABELS: Record<string, string> = {
  deposit: "Deposit",
  balance: "Balance",
  full: "Payment in full",
  monthly: "Monthly",
};
