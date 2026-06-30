/**
 * Extract GS1 manufacturer prefix from a UPC-A (12 digits) or EAN-13 (13 digits).
 * Uses 7 digits — practical sweet spot between specificity and clustering breadth.
 * Returns null for non-standard barcodes (UPC-E, Code128, etc.).
 */
export function extractManufacturerPrefix(barcode: string): string | null {
  const digits = barcode.replace(/\D/g, '');
  if (digits.length === 12 || digits.length === 13) {
    return digits.slice(0, 7);
  }
  return null;
}
