// A shelf price above this is almost certainly a data-entry mistake (e.g. a
// missing decimal point on Android's decimal-pad keyboard, or digits from a
// barcode pasted into the wrong field) rather than a real grocery item price.
// Prices above the cap aren't rejected outright — the user can confirm and
// override, since some legitimate items (electronics, appliances sold
// through the Walmart/Target providers) really do cost this much.
export const MAX_REASONABLE_PRICE = 1000;

export function parsePriceInput(text: string): number {
  return parseFloat(text.replace(/[^0-9.]/g, ''));
}

// Positive and parseable but over the cap — needs explicit user confirmation
// before it's submitted.
export function isPriceOverCap(price: number): boolean {
  return !isNaN(price) && price > MAX_REASONABLE_PRICE;
}

// Any positive, parseable price at all (under or over the cap) — used to
// decide whether the add/save action should be tappable, since an over-cap
// price should still be tappable in order to trigger the confirmation.
export function isPriceEntered(price: number): boolean {
  return !isNaN(price) && price > 0;
}

// Weights are constrained to hundredths (0.01 lb/kg), matching typical store
// scale precision.
export function roundWeight(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isWeightEntered(weight: number): boolean {
  return !isNaN(weight) && weight > 0;
}
