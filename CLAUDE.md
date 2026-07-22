# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GroceryScan is a React Native + TypeScript mobile app that scans grocery barcodes, looks up live store pricing and promotions, and estimates checkout totals including tax. See [grocerySpec.md](grocerySpec.md) for the full product specification.

## Stack

- **Mobile**: Expo (managed workflow), TypeScript, React Navigation, Zustand
- **Backend**: Supabase — Postgres DB + Deno Edge Functions (no separate server)
- **Barcode identity**: upcitemdb.com API (set `BARCODE_LOOKUP_API_KEY`)
- **Pricing**: Kroger API, Instacart Connect API, SerpApi (Walmart), Walmart Marketplace API, and Target's Redsky API via a `PricingProvider` abstraction layer
- **Tax**: Static JSON bundled in app ([mobile/src/constants/taxRates.json](mobile/src/constants/taxRates.json))

## Running the App

```bash
cd mobile
cp .env.example .env   # fill in Supabase URL + anon key
npm start              # Expo dev server; scan QR with Expo Go or run on simulator
npm run ios
npm run android
```

TypeScript check: `cd mobile && npx tsc --noEmit`

`expo-calendar` (used for the iOS Reminders sync in [mobile/src/services/reminders.ts](mobile/src/services/reminders.ts)) isn't supported in Expo Go — testing it requires a dev client build (`eas build --profile development --platform ios` or `npx expo run:ios`), not `npm start`/`npm run ios`.

## EAS Builds (Android + iOS)

Native builds are produced via EAS Build, config in [mobile/eas.json](mobile/eas.json). Three profiles: `development` (dev-client, iOS simulator + Android APK, for local iteration), `preview` (internal-distribution APK/IPA for ad-hoc QA), `production` (store-ready AAB/IPA, auto-incremented build number).

```bash
cd mobile
eas login                      # one-time, your Expo account
eas init                       # one-time, links repo to an EAS project

# builds
npm run build:android          # or build:ios / build:all
eas build --profile development --platform ios
```

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are inlined at build time, so cloud builds need them registered as EAS environment variables (not just local `.env`), one `eas env:create` per var per environment (`development`/`preview`/`production`). EAS auto-links vars to the build profile of the same name.

iOS/Android app identifier: `com.masontuft.groceryscan` (`mobile/app.json` `ios.bundleIdentifier` / `android.package`). First iOS build will prompt for signing credentials — accept EAS-managed credentials unless reusing existing certs.

## Supabase / Backend

```bash
# Apply migrations to a local Supabase instance
supabase start
supabase db push

# Set API secrets (never commit these)
supabase secrets set BARCODE_LOOKUP_API_KEY=...
supabase secrets set KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
supabase secrets set INSTACART_API_KEY=...
supabase secrets set SERPAPI_KEY=...
supabase secrets set WALMART_CONSUMER_ID=... WALMART_PRIVATE_KEY=...
supabase secrets set GEMINI_API_KEY=...

# Deploy edge functions
supabase functions deploy scan-resolve
supabase functions deploy basket-recalculate
supabase functions deploy products-search
supabase functions deploy stores-list
supabase functions deploy resolve-nearby-store
supabase functions deploy receipt-compare
supabase functions deploy receipt-confirm

# Seed sample stores + test product
supabase db seed

# One-time (and periodic, e.g. quarterly) import of the Walmart store
# reference data that resolve-nearby-store looks up against — geocodes
# SerpApi's static walmart-stores.json via the free Census Bureau batch
# geocoder. Not deployed as a function; run manually.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run --allow-net --allow-env supabase/scripts/import-walmart-store-reference.ts
```

`SERPAPI_KEY` gates `SerpApiWalmartProvider` (Walmart pricing) — the provider code is fully implemented but returns no prices until this secret is actually set. Get a key from serpapi.com and run the `supabase secrets set SERPAPI_KEY=...` command above to activate it.

`GEMINI_API_KEY` gates `receipt-compare` (post-checkout receipt-vs-basket comparison). Get a free key from Google AI Studio (aistudio.google.com/apikey) — the free tier (1,500 requests/day on Gemini 2.5 Flash, no card required) comfortably covers this feature's volume.

## Architecture

**Mobile client** — camera barcode scanner → `productStore.resolveProduct` (cache-first) → `scan-resolve` edge fn → `ProductDetailScreen`. Basket state managed by `basketStore` (Zustand + AsyncStorage persist). Offline-first: 4h pricing TTL, 7d product identity TTL, basket persists indefinitely.

**Edge functions** (`supabase/functions/`):
- `scan-resolve` — barcode → DB lookup → barcode API fallback → pricing provider fan-out → promotions
- `basket-recalculate` — items + location → best prices + promotion engine + tax
- `products-search` — full-text search on products table
- `stores-list` — active stores
- `receipt-compare` — post-checkout receipt photo + basket snapshot → Gemini vision OCR/parse → fuzzy-match against basket items → persists `receipt_scans`/`receipt_scan_items`
- `receipt-confirm` — resolves an `'unmatched'` `receipt_scan_items` row once the user manually confirms/rejects a match

**Pricing abstraction** (`supabase/functions/_shared/pricingProviders/`): `PricingProvider` interface with `KrogerProvider`, `InstacartProvider`, `SerpApiWalmartProvider`, `WalmartProvider`, and `TargetProvider`. Multiple providers can match the same store chain (e.g. Walmart has both `SerpApiWalmartProvider` and the direct-by-UPC `WalmartProvider`) — all matching providers run in parallel per scan, and `selectBestPrice.ts` picks the winner by `confidenceScore`, so provider priority is expressed by which one is scored higher rather than by registry order. Add new chains by creating a new file + adding to the registry array in `scan-resolve/index.ts`.

## Key Files

| Purpose | Path |
|---|---|
| Navigation root | [mobile/src/app/index.tsx](mobile/src/app/index.tsx) |
| Pricing provider interface | [supabase/functions/_shared/pricingProviders/types.ts](supabase/functions/_shared/pricingProviders/types.ts) |
| scan-resolve edge fn | [supabase/functions/scan-resolve/index.ts](supabase/functions/scan-resolve/index.ts) |
| Basket store | [mobile/src/stores/basketStore.ts](mobile/src/stores/basketStore.ts) |
| Product cache store | [mobile/src/stores/productStore.ts](mobile/src/stores/productStore.ts) |
| Tax rates table | [mobile/src/constants/taxRates.json](mobile/src/constants/taxRates.json) |
| Promotion engine | [supabase/functions/_shared/promotionEngine.ts](supabase/functions/_shared/promotionEngine.ts) |
| Background sync | [mobile/src/services/sync.ts](mobile/src/services/sync.ts) |
| Reminders/share export | [mobile/src/services/reminders.ts](mobile/src/services/reminders.ts) |
| Receipt comparison edge fn | [supabase/functions/receipt-compare/index.ts](supabase/functions/receipt-compare/index.ts) |
| Receipt scan screen | [mobile/src/screens/ReceiptScanScreen.tsx](mobile/src/screens/ReceiptScanScreen.tsx) |

## Environment Variables

**Mobile** (`.env` in `mobile/`):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

**Edge functions** (via `supabase secrets set`):
```
BARCODE_LOOKUP_API_KEY=
GEMINI_API_KEY=
KROGER_CLIENT_ID=
KROGER_CLIENT_SECRET=
INSTACART_API_KEY=
```

## Core Data Models

`Product` · `StorePricing` · `Promotion` · `BasketItem` · `TaxProfile` — defined in full in [grocerySpec.md](grocerySpec.md#data-model).

Key modeling rules:
- Promotions are versioned, time-bound, and store-specific; item-level discounts apply before basket-level.
- Tax is looked up by state (+ city override) from the bundled JSON; grocery tax rates differ from general sales tax.
- Pricing rows carry `confidenceScore` and `sourceTimestamp`; `selectBestPrice.ts` picks the best row across providers.
