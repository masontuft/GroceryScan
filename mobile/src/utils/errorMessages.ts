export const ErrorMessages = {
  UNKNOWN_BARCODE: 'Product not found. Try searching by name or enter the code manually.',
  API_TIMEOUT: 'Connection timed out. Showing cached data.',
  LOCATION_DENIED: 'Location access denied. Enter your state or ZIP code to estimate tax.',
  PRICE_STALE: 'This price may be outdated. Tap to refresh.',
  OFFLINE: 'You\'re offline. Showing last known prices.',
  NO_CACHE: 'No cached data available. Connect to look up this product.',
} as const;
