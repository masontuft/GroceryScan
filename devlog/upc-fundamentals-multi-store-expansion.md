# GroceryScan: UPC Fundamentals & Multi-Store Expansion Guide

## Executive Summary

This report explains how UPC barcodes are structured at a technical level, how "similar" UPC codes relate to similar products, and provides actionable options for expanding GroceryScan's pricing coverage beyond its current Kroger and Instacart providers — including Target, Walmart expansion, Open Food Facts integration, and product-similarity matching strategies. Understanding the UPC structure is foundational to all of these expansions.

***

## How UPC Barcodes Work

### The 12-Digit Structure

A UPC-A barcode (the standard format on virtually all US grocery products) consists of exactly 12 numerical digits. Every digit has a specific role:[^1][^2]

| Segment | Digits | Description |
|---|---|---|
| Number System Character | 1st digit | Assigned by GS1; classifies the product category (e.g., 0 = general, 2 = weighted, 3 = drug/health, 5 = coupons)[^3] |
| Company Prefix | Digits 2–7 (varies 6–10 digits) | Uniquely licensed to a manufacturer by GS1; identifies the brand globally[^4][^5] |
| Item Reference | Remaining digits (after prefix) | Assigned by the manufacturer to identify the specific product variation[^6] |
| Check Digit | 12th (last) digit | Error-detection digit calculated from the preceding 11 digits[^7] |

The company prefix length is variable: small companies get a 10-digit prefix (only 10 product codes), while large companies can get a 6-digit prefix (up to 100,000 product codes). This means the split between "manufacturer" and "product" portions isn't always 6+5 — it depends on prefix length.[^4]

### Check Digit Calculation

Every time a barcode is scanned, the POS system recomputes the check digit and compares it against the 12th digit to confirm accuracy. The algorithm is:[^7]

1. Sum all digits in odd-numbered positions (1st, 3rd, 5th, … 11th) and multiply by 3
2. Add the sum of digits in even-numbered positions (2nd, 4th, 6th, … 10th)
3. Compute the result modulo 10; if not 0, subtract from 10 — that's the check digit[^7]

For example, with `03600029145_`, the check digit would be `2`, making the full code `036000291452`.

### Physical Encoding

The 12-digit number is encoded as a pattern of black bars and white spaces. Each digit is represented by exactly 2 bars and 2 spaces totaling 7 modules wide. A full UPC-A barcode is 95 modules wide total: 84 for digits + 11 for guard patterns (start, middle, end). The left-hand digits use odd parity encoding and right-hand digits use even parity, allowing scanners to detect if the barcode is being read upside-down without re-scanning.[^1]

### UPC Variants

| Variant | Digits | Use Case |
|---|---|---|
| UPC-A | 12 | Standard US/Canada retail — groceries, electronics, etc.[^8] |
| UPC-E | 8 | Compressed version that suppresses leading zeros; used when packaging space is limited[^8] |
| EAN-13 | 13 | International standard (one digit longer); compatible with UPC systems since 2005[^9] |
| GTIN-14 | 14 | Used for shipping/logistics units (cases, pallets)[^2] |

***

## Understanding "Similar" UPC Codes

### Why Similar Products Have Different UPCs

This is the most important thing to understand for GroceryScan's expansion: **the UPC does not encode any semantic information about the product itself**. Two nearly identical products (e.g., two store-brand orange juices) will have completely different UPCs if they come from different manufacturers. The number is a pointer — the database behind it carries the product info.[^10][^11]

Key scenarios where similar products have different UPCs:

- **Private-label / store brands** — Walmart's Great Value, Target's Good & Gather, and Kroger's Simple Truth all carry their own company prefixes, even if the underlying product is manufactured by the same co-packer[^10]
- **Regional brands** — The same product may be reformulated or repackaged for a regional market with a new UPC
- **Package size variations** — A 12 oz and 16 oz version of the same product have distinct UPCs[^6]
- **Color/flavor variations** — Each variation requires its own unique UPC per GS1 rules[^12]

### Reading the Company Prefix for "Brand Clustering"

Because the first 6–10 digits identify the manufacturer, you can infer brand family from the prefix. For GroceryScan, this means:

- If a user scans `036000xxxxxx`, you know it's a Nestlé product[^13]
- If a user scans `049000xxxxxx`, it's Coca-Cola
- Grouping by prefix can surface "same brand, different product" relationships in your Supabase `products` table

The GS1 Global Registry (GEPIR) is a public lookup tool at `gs1us.org` that lets you look up which company owns any prefix.[^14]

### Code Reuse and Collisions

As of January 2019, GS1 permanently banned reassigning a UPC to a new product after a previous product retires. Before this, retired UPCs from defunct companies could cause collisions in store databases. Older records in `upcitemdb` may still carry some of these legacy codes, so validating `confidenceScore` in GroceryScan's `StorePricing` model is critical.[^9]

***

## Expanding to More Stores

GroceryScan already uses a `PricingProvider` abstraction layer in `supabase/functions/_shared/pricingProviders/`, which makes adding new chains a matter of creating a new provider file and registering it in `scan-resolve/index.ts`. Here are the most viable expansion options:[^15]

### 1. Walmart (Already in README)

The README references `WALMART_CONSUMER_ID` and `WALMART_PRIVATE_KEY` secrets, indicating Walmart integration is partially planned. Walmart's official Marketplace API supports product lookup by UPC, GTIN, and keyword. However, real-time in-store pricing is not reliably available via official channels — community reports confirm Walmart's own internal systems lack real-time shelf-level accuracy.[^16][^17][^18]

**Recommendation:** Use the Walmart Item Search API for product identity enrichment (brand, category, image) but pair with Instacart's Walmart channel for pricing, since Instacart already has a fulfillment relationship with Walmart stores.

### 2. Target

Target has a developer portal at `developer.target.com` and an accessible product API (internally called "Redsky") that exposes product data including pricing, brand, ratings, and TCIN (Target's internal product ID). The search endpoint accepts keywords and returns `tcin`, `title`, `price`, `regular_price`, and `save_percent` per product.[^19][^20][^21]

**Implementation path for a `TargetProvider`:**

```typescript
// supabase/functions/_shared/pricingProviders/TargetProvider.ts
import { PricingProvider, StorePricing } from './types.ts';

export class TargetProvider implements PricingProvider {
  async getPrice(upc: string, storeId: string): Promise<StorePricing | null> {
    // 1. Search Target by UPC/product name to get TCIN
    const searchRes = await fetch(
      `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=${upc}&count=5`
    );
    const data = await searchRes.json();
    // 2. Match TCIN to UPC, return best price
    // 3. Use check_store_availability with ZIP for local pricing
    ...
  }
}
```

Note: Redsky is an unofficial consumer API — it's publicly accessible but not a formally documented partner API. It may change without notice, so add error boundaries and a fallback in `selectBestPrice.ts`.

### 3. Open Food Facts (Free, Open Data)

Open Food Facts is a free, open-source food database with over 4 million products. Unlike pricing APIs, it provides rich product metadata: ingredients, nutrition facts, Nutri-Score, NOVA processing score, allergens, and packaging info. This is ideal for GroceryScan's product identity layer (the `upcitemdb` fallback).[^22][^23]

**API endpoint:** `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`

This maps directly onto GroceryScan's existing `scan-resolve` flow — add it as a fallback after `upcitemdb` returns no result. Open Food Facts is free with no API key required (just set a descriptive `User-Agent`).[^22]

**Value add:** Populate the `Product` model's nutrition/category fields to enable future features like dietary filtering or "healthier alternative" suggestions.

### 4. Aldi / Trader Joe's / Costco

These three chains present a structural challenge: **they primarily sell private-label products with store-specific UPCs** that won't appear in national databases like upcitemdb. Additionally:

- None offer public pricing APIs[^24]
- Aldi refreshes its inventory weekly with "ALDI Finds," meaning product UPCs change frequently
- Costco has a member-gated website; pricing requires authentication

**Recommendation:** These are low-priority until a web-scraping strategy or third-party data vendor is used. Consider an "Enter Price Manually" fallback (already in the README's future work) as the primary path for these stores.[^16]

### 5. Third-Party Aggregators

Several commercial data providers aggregate pricing across chains:

| Provider | Coverage | Notes |
|---|---|---|
| Actowiz Solutions | Walmart, Kroger, Aldi, Target | Scraping-based API; subscription required[^25] |
| Veryfi | Cross-chain UPC matching via receipt OCR | B2B/CPG focused; strong for product matching[^26] |
| BlueCart / Stevesie | Walmart, Amazon | Unofficial scraping wrappers[^27] |

These are most useful once GroceryScan has a user base and revenue to justify subscription costs.

***

## Product Similarity Matching Strategies

This is the most technically interesting expansion — enabling GroceryScan to suggest "similar items" across stores even when the UPCs don't match (e.g., store-brand vs. name-brand, or the same item indexed differently on Instacart vs. Kroger).

### Strategy 1: GS1 Company Prefix Clustering

Parse the first 6–10 digits of any UPC to identify the manufacturer. Store a `manufacturer_prefix` field in your `products` table and enable cross-prefix browsing within the same product category. This is purely database logic — no ML required.

### Strategy 2: Category + Name Similarity (Full-Text Search)

GroceryScan already deploys a `products-search` edge function with full-text search. Extend this with fuzzy matching on `product_name + brand + category` to surface similar items. PostgreSQL's `pg_trgm` extension (available in Supabase) supports trigram similarity queries:[^15]

```sql
-- Add to your migration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Query for similar products
SELECT *, similarity(name, $1) AS sim
FROM products
WHERE category = $2
ORDER BY sim DESC
LIMIT 10;
```

### Strategy 3: Embedding-Based Semantic Similarity

For more sophisticated matching — especially across private-label items — store product name embeddings in Supabase using the `pgvector` extension and run cosine-similarity queries. Supabase natively supports `pgvector`:[^28]

```sql
-- Find top 5 semantically similar products
SELECT *, 1 - (embedding <=> $1::vector) AS similarity
FROM products
ORDER BY similarity DESC
LIMIT 5;
```

Generate embeddings using OpenAI's `text-embedding-3-small` model (cost-effective at ~$0.02 per 1M tokens) in your `scan-resolve` edge function.

### Strategy 4: Image Similarity via CLIP

For products where names are inconsistent (e.g., "Heinz Ketchup 32oz" vs. "Heinz Tomato Ketchup 2 lb"), image-based matching using CLIP embeddings is highly effective. Store product image URLs in your `products` table and compute CLIP embeddings server-side. This is a "Phase 2" feature — the README already lists "AI-assisted product matching for damaged or partial barcodes" as future work.[^28][^16]

***

## Implementation Priority Roadmap

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| 1 | Add Open Food Facts as product identity fallback | Low | High — free, improves product data quality |
| 2 | Implement `TargetProvider` via Redsky API | Medium | High — major US retailer, public API |
| 3 | Complete `WalmartProvider` (secrets already in README) | Medium | High — largest US retailer |
| 4 | Add `pg_trgm` similarity search to `products-search` fn | Low | Medium — enables "similar items" UX |
| 5 | Add `manufacturer_prefix` field + clustering | Low | Medium — surfaces same-brand products |
| 6 | `pgvector` embedding similarity for private-label matching | High | High (long term) — differentiating feature |

***

## Key Takeaways

- A UPC is a unique **pointer**, not a semantic description — similar products have completely unrelated codes unless they share a manufacturer[^1][^10]
- The **company prefix** (first 6–10 digits) is the only structural signal of brand family within a UPC, and it's publicly queryable via GS1's GEPIR[^14]
- GroceryScan's existing `PricingProvider` abstraction makes it straightforward to add Target and complete the Walmart integration — both APIs are accessible[^19][^15]
- **Open Food Facts** is the highest-ROI immediate addition: free, no key needed, 4M+ products, and plugs directly into the existing `scan-resolve` fallback chain[^22]
- For cross-store product similarity (the "same item, different stores" problem), a layered approach — prefix clustering → full-text trigram → embedding similarity — provides increasing accuracy at increasing complexity[^29][^28]

---

## References

1. [Universal Product Code - Wikipedia](https://en.wikipedia.org/wiki/Universal_Product_Code) - A UPC (technically, a UPC-A) consists of 12 digits that are uniquely assigned to each trade item. Th...

2. [The Basics of UPC Codes - US Barcode Authority GS1 UPC](https://www.barcode-us.info/upc-codes/) - A “UPC Code” is essentially a barcode symbol encoding a 12-digit number called a GTIN-12. As describ...

3. [Barcode 101: Information You Need to Know - Smith Corona](https://www.smithcorona.com/blog/barcode-101-information/) - The typical UPC-A barcode has 12 numerical digits, starting from left to right. The very first digit...

4. [UPC Company Prefix - gs1-us.info](https://www.gs1-us.info/upc-company-prefix/) - GS1 provides a company a UPC Company Prefix to create UPC, ITF-14, SSCC-18 and GTIN barcodes. The UP...

5. [The GS1 UPC Barcode Guide: Prefixes & What To Know](https://coastlabel.com/the-gs1-upc-barcode-guide/) - GS1 UPC barcodes are standardized barcodes that are used globally for product identification and tra...

6. [Quick Start Guide - GS1 Company Prefix - YouTube](https://www.youtube.com/watch?v=a3GpC6DSNro) - ... product identification options, understand how the GS1 Company Prefix supports their business gr...

7. [UPC Barcode & Check Digit Calculation - 101 Computing](https://www.101computing.net/upc-barcode-check-digit-calculation/) - With a UPC barcode, the last digit is called the check digit. The check digit is used to make sure a...

8. [EAN Numbers and UPCs: What is the Difference? - GS1 US](https://www.gs1us.org/upcs-barcodes-prefixes/ean-vs-upc) - It's the full 12-digit product code that includes all digits. A UPC-E is a compressed version of the...

9. [Frequently Asked Questions: UPC Barcodes & GS1 Company Prefixes](https://www.barcode.graphics/frequently-asked-questions-upc-barcodes-and-gs1-company-prefixes/) - UPC Barcodes are the most common barcode. A GS1 UPC barcode contains a GS1 Company Prefix licensed t...

10. [ELI5: How does the barcode system works? : r/explainlikeimfive](https://www.reddit.com/r/explainlikeimfive/comments/165cxi0/eli5_how_does_the_barcode_system_works/) - The first half of the code is the manufacturer code, and the second half (minus the last number) is ...

11. [ELI5:How do companies avoid using the same barcode for different ...](https://www.reddit.com/r/explainlikeimfive/comments/11t3odz/eli5how_do_companies_avoid_using_the_same_barcode/) - The company will never re-use the same product code for different products, so they will never re-us...

12. [Do I need a separate UPC for each product variation on Amazon?](https://www.facebook.com/groups/enablersbysaqibazhar/posts/4014756785517812/) - Each product variation needs a unique UPC from GS1. You cannot use one UPC for all six variations. E...

13. [The Importance of a Unique GS1 Company Prefix - GTIN.info](https://www.gtin.info/gs1-company-prefix/) - The GS1 Company Prefix is simply the UPC Company Prefix with a leading zero and is very important un...

14. [GS1 Database | Search & look up by GLN, Prefix, GTIN, UPC](https://www.gs1us.org/tools/gs1-company-database-gepir) - By licensing a GS1 Company Prefix with GS1 US®, companies are identified as the licensee of that pre...

15. CLAUDE.md — Project instructions for Claude Code (internal reference, not publicly linked)

16. README.md — GroceryScan project overview (internal reference, not publicly linked)

17. [Switch to Global APIs Before July 31, 2026 - Marketplace Learn](https://marketplacelearn.walmart.com/ca/guides/Other%20Topics/Announcements/switch-to-global-apis-now-and-unlock-new-possibilities-) - The deadline for Walmart Marketplace Canada sellers to migrate to the Global APIs integration for Ca...

18. [Does Walmart's API allows real-time access to store inventory and ...](https://www.reddit.com/r/learnprogramming/comments/1hmztg3/does_walmarts_api_allows_realtime_access_to_store/) - Walmart doesn't even have real time access to inventory and pricing. The amount of times I've went t...

19. [Target.com API — Product Search & Store Availability - Parse.bot](https://parse.bot/marketplace/4596043a-f154-4cf4-b5cd-822ec6d860ae/target-com-api) - Search Target's product catalog by keyword and check real-time in-store availability at nearby Targe...

20. [Target Developer Portal](https://developer.target.com) - Target Developer Portal You. Developer Portal Home API Platform Logo Team Member / Target Plus Login...

21. [Redsky: Target's wonderfully accessible distribution API - Gist - GitHub](https://gist.github.com/LumaDevelopment/f2a34a202fed6ab5a7f3a31282834943) - Download ZIP Redsky: Target's wonderfully accessible distribution API provides a free consumer API, ...

22. [Introduction to Open Food Facts API documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/) - The Open Food Facts API enables developers to get information like ingredients and nutritional value...

23. [Open Food Facts - Apps on Google Play](https://play.google.com/store/apps/details?id=org.openfoodfacts.scanner&hl=en_US) - Scan, Discover & Compare Over 4 Million Food Products. The app allows to scan the 4 million products...

24. [Looking for APIs that provide grocery stores + pricing by ingredient ...](https://www.reddit.com/r/webdev/comments/1ld2fv8/looking_for_apis_that_provide_grocery_stores/) - Check if giants like Walmart or Kroger have public APIs. This is often a long shot, as they rarely e...

25. [Scraping APIs for Grocery Store Price Matching - Walmart, Kroger ...](https://www.actowizsolutions.com/grocery-store-price-matching-api-almart-kroger-aldi-target.php) - Discover how Scraping APIs for Grocery Store Price Matching helps track and compare prices across Wa...

26. [The Crucial Role of UPC Product Matching for Cross-Basket Insights](https://www.veryfi.com/technology/product-matching/) - Veryfi's AI-powered product matching is benefitting CPG brands with cross-basket insights. Read this...

27. [No-Code Walmart API Data Scraping with BlueCart (Still ... - YouTube](https://www.youtube.com/watch?v=fH-hjwGj69Y) - ... Walmart Item IDs and Extract Product Details, Price & Inventory 9:41 Thoughts & Conclusions.

28. [Product matching from different stores : r/webscraping - Reddit](https://www.reddit.com/r/webscraping/comments/1fxg54g/product_matching_from_different_stores/) - The closer the match, the closer the similarity will be to 1. It's not an exact science and will lik...

29. [5 Best Use Cases For Product Matching In Ecommerce & How You ...](https://www.width.ai/post/product-matching-in-ecommerce) - Modern product matching uses many different features and machine learning algorithms to compare the ...

