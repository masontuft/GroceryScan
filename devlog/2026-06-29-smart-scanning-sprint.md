# Dev Log — Smart Scanning + Store Expansion Sprint
**Date:** 2026-06-29

---

## What We Built

Four features added in one sprint based on the UPC Fundamentals guide and a planning session with Claude Code.

---

## Feature 1: Price Tag OCR

**Problem:** WinCo, Aldi, and other stores have no live pricing API. Users had to type prices manually.

**Solution:** Added a 📷 camera button next to the price input in `WincoQuickEntryScreen`. Tapping it captures a still frame via `expo-camera`'s `takePictureAsync()`, sends the base64 image to a new `ocr-price` Supabase edge function, which calls Google Cloud Vision `TEXT_DETECTION`, runs a regex to extract the most likely grocery price, and auto-fills the price field.

**Key files:**
- `supabase/functions/ocr-price/index.ts` ← new edge function
- `mobile/src/screens/WincoQuickEntryScreen.tsx` ← 📷 button + `handleScanPriceTag()`
- `mobile/src/services/api.ts` ← `ocrPriceTag()` function

**New secret needed:** `GOOGLE_VISION_API_KEY` via `supabase secrets set GOOGLE_VISION_API_KEY=...`

**Price extraction logic:** Regex `/\$?\s*(\d{1,3})[\s.](\d{2})\b/g` captures `$2.49`, `2.49`, `2 49` patterns. Returns the most-frequent match in the image (handles labels with multiple numbers like "16 oz · $2.49").

**UX:** Camera overlay text changes to "Aim at price label…" during capture. Shows Alert if no price detected.

---

## Feature 2: Store Expansion

### Open Food Facts (free fallback)

**Problem:** upcitemdb misses many products, especially international or store-brand items.

**Solution:** Added a second fallback in `scan-resolve/index.ts` after upcitemdb. Calls `https://world.openfoodfacts.org/api/v2/product/{barcode}.json` with a descriptive User-Agent. No API key needed. Extracts `product_name`, `brands`, `image_url`, `quantity`, and `categories_tags` (strips `en:` prefix). Upserts into `products` table.

**Fallback chain is now:** DB cache → upcitemdb → Open Food Facts → fuzzy suggestions → 404

### Walmart (completed)

The `WalmartProvider` in `_shared/pricingProviders/walmart.ts` was already implemented (HMAC-SHA256 RSA signing, Affiliate API v2 endpoint). Added error logging on non-200 responses to help debug auth issues. Just needs `WALMART_CONSUMER_ID` and `WALMART_PRIVATE_KEY` set in Supabase secrets.

### Target (new provider)

**File:** `supabase/functions/_shared/pricingProviders/target.ts`

Uses Target's Redsky API (unofficial, no auth, no SLA):
1. Search by UPC keyword → get `tcin` (Target's internal product ID)
2. Fetch pricing by `tcin` + `pricing_store_id`

Confidence score: 0.85 (lower than Kroger's 0.95 because this is an unofficial API). Gracefully returns `null` on any failure.

---

## Feature 3: Smarter Scan Fallback ("Did you mean?")

**Problem:** Unknown barcodes dead-ended at "Enter Manually" with no help.

**Solution:** 
1. Added `pg_trgm` extension and a `search_products_fuzzy` PostgreSQL function (migration `20240101000006`).
2. `scan-resolve` now runs a fuzzy query before returning 404, and includes `suggestions: Product[]` in the 404 response body.
3. `productStore.ts` parses the 404 body and throws a `ProductNotFoundError` (with `suggestions`) instead of a generic `UNKNOWN_BARCODE`.
4. `ScanScreen.tsx` catches `ProductNotFoundError` and shows an Alert with up to 3 "Did you mean?" options. Selecting one resolves the product normally. No match falls through to the existing manual entry flow.

**Key files:**
- `supabase/migrations/20240101000006_trgm_manufacturer_prefix.sql` ← migration
- `mobile/src/stores/productStore.ts` ← `ProductNotFoundError` class
- `mobile/src/screens/ScanScreen.tsx` ← "Did you mean?" alert flow

---

## Feature 4: GS1 Brand Prefix Clustering

**Problem:** No way to surface "other products from this brand."

**Solution:**
- Added `manufacturer_prefix TEXT` column to `products` table (same migration as above).
- `extractManufacturerPrefix()` in `_shared/gs1.ts` takes first 7 digits of a UPC-A/EAN-13. 7 digits was chosen as the sweet spot — 6 can collide across brands, 10 creates singleton clusters.
- All product upserts in `scan-resolve` now set `manufacturer_prefix`.
- `ProductDetailScreen` fetches up to 6 other products with the same prefix and renders a horizontal scroll "More from this brand" row.

**Key files:**
- `supabase/functions/_shared/gs1.ts` ← `extractManufacturerPrefix()`
- `mobile/src/screens/ProductDetailScreen.tsx` ← brand products row
- `mobile/src/types/product.ts` ← `manufacturerPrefix: string | null` added

---

## Files Changed Summary

| File | Change |
|---|---|
| `supabase/migrations/20240101000006_trgm_manufacturer_prefix.sql` | New — pg_trgm, fuzzy RPC, manufacturer_prefix column |
| `supabase/functions/_shared/gs1.ts` | New — GS1 prefix extraction |
| `supabase/functions/_shared/pricingProviders/target.ts` | New — Target Redsky provider |
| `supabase/functions/ocr-price/index.ts` | New — Google Vision price extraction |
| `supabase/functions/scan-resolve/index.ts` | +Target provider, +OFF fallback, +GS1 prefix on upsert, +suggestions on 404, +manufacturerPrefix in response |
| `supabase/functions/products-search/index.ts` | Replaced ILIKE with fuzzy RPC |
| `supabase/functions/_shared/pricingProviders/walmart.ts` | +error logging on non-200 |
| `mobile/src/types/product.ts` | +manufacturerPrefix field |
| `mobile/src/services/api.ts` | +ocrPriceTag(), searchProducts() → fuzzy RPC, +manufacturerPrefix mapping |
| `mobile/src/stores/productStore.ts` | +ProductNotFoundError class, parse 404 suggestions |
| `mobile/src/screens/ScanScreen.tsx` | "Did you mean?" alert flow |
| `mobile/src/screens/WincoQuickEntryScreen.tsx` | OCR price button + handler |
| `mobile/src/screens/ProductDetailScreen.tsx` | "More from this brand" section |

---

## Deployment Steps

```bash
# 1. Run the migration
supabase db push

# 2. Set new secret
supabase secrets set GOOGLE_VISION_API_KEY=your_key_here

# 3. Set Walmart secrets if not already set
supabase secrets set WALMART_CONSUMER_ID=... WALMART_PRIVATE_KEY=...

# 4. Deploy edge functions
supabase functions deploy scan-resolve
supabase functions deploy products-search
supabase functions deploy ocr-price
```

---

## Future Work (Documented, Not Built)

- **Product photo ID** — Take a photo of a product (no barcode visible) → identify via Claude Vision or Google Vision object detection. Needs `identify-product` edge function + "identify" mode in ScanScreen.
- **Receipt scan** — Photograph a grocery receipt → parse line items + prices → bulk add to basket. Needs structured LLM extraction (Claude with tool use or structured output) + `parse-receipt` edge function.
- **Cross-store embedding similarity** — `pgvector` extension + `text-embedding-3-small` embeddings on product upsert → cosine similarity for "same item cheaper at Target." High effort, high long-term value.
