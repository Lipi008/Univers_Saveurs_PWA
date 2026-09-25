export function compactReceiptNumber(receiptNumber: string): string {
  const legacy = /^REC-(\d{4})(\d{2})(\d{2})-([A-Z0-9]{5})/i.exec(receiptNumber);
  if (!legacy) return receiptNumber;
  return `REC-${legacy[1].slice(2)}${legacy[2]}${legacy[3]}-${legacy[4].toUpperCase()}`;
}