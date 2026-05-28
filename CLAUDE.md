# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GroceryScan is a React Native + TypeScript mobile app that scans grocery barcodes, looks up live store pricing and promotions, and estimates checkout totals including tax. See [grocerySpec.md](grocerySpec.md) for the full product specification.

## Stack

- **Mobile**: Expo (managed workflow), TypeScript, React Navigation, Zustand
- **Backend**: Supabase — Postgres DB + Deno Edge Functions (no separate server)
- **Barcode identity**: upcitemdb.com API (set `BARCODE_LOOKUP_API_KEY`)
- **Pricing**: Kroger API + Instacart Connect API via a `PricingProvider` abstraction layer
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

## Supabase / Backend

```bash
# Apply migrations to a local Supabase instance
supabase start
supabase db push

# Set API secrets (never commit these)
supabase secrets set BARCODE_LOOKUP_API_KEY=...
supabase secrets set KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
supabase secrets set INSTACART_API_KEY=...

# Deploy edge functions
supabase functions deploy scan-resolve
supabase functions deploy basket-recalculate
supabase functions deploy products-search
supabase functions deploy stores-list

# Seed sample stores + test product
supabase db seed
```

## Architecture

**Mobile client** — camera barcode scanner → `productStore.resolveProduct` (cache-first) → `scan-resolve` edge fn → `ProductDetailScreen`. Basket state managed by `basketStore` (Zustand + AsyncStorage persist). Offline-first: 4h pricing TTL, 7d product identity TTL, basket persists indefinitely.

**Edge functions** (`supabase/functions/`):
- `scan-resolve` — barcode → DB lookup → barcode API fallback → pricing provider fan-out → promotions
- `basket-recalculate` — items + location → best prices + promotion engine + tax
- `products-search` — full-text search on products table
- `stores-list` — active stores

**Pricing abstraction** (`supabase/functions/_shared/pricingProviders/`): `PricingProvider` interface with `KrogerProvider` and `InstacartProvider`. Add new chains by creating a new file + adding to the registry array in `scan-resolve/index.ts`.

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

## Environment Variables

**Mobile** (`.env` in `mobile/`):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

**Edge functions** (via `supabase secrets set`):
```
BARCODE_LOOKUP_API_KEY=
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
