# Grocery Barcode Price Scanner App Specification

## Overview
Build a React Native application using TypeScript that scans product barcodes in grocery stores, identifies items by barcode/SKU/UPC/EAN/GTIN, looks up current store pricing and promotions, and estimates the final checkout total by applying location-aware sales tax and discounts.

## Goals
- Let shoppers scan items quickly in-store.
- Resolve products from barcode, SKU, UPC, EAN, or GTIN when available.
- Show current item price, active promotions, and estimated tax.
- Estimate a basket total before checkout.
- Support multiple grocery chains and regions.

## Non-Goals
- Replacing the retailer’s POS system.
- Guaranteeing exact checkout totals for every store.
- Storing payment credentials or processing payments.
- Building a full loyalty program system.

## Core User Stories
1. As a shopper, I can scan a barcode and see the item name, price, and promotions.
2. As a shopper, I can add multiple scanned items to a basket and see an estimated total.
3. As a shopper, I can set or confirm my location so tax is calculated correctly.
4. As a shopper, I can view which store the pricing came from.
5. As a shopper, I can manually search for an item if scanning fails.

## Functional Requirements
### Barcode and SKU Lookup
- Scan barcodes using the device camera.
- Support manual entry of UPC, EAN, GTIN, and SKU.
- Resolve product identity from scanned code.
- Handle unknown or unmapped codes gracefully.
- Cache recently scanned items locally for faster repeat use.

### Price Retrieval
- Query a product-pricing service by barcode/SKU.
- Support store-specific pricing when a store is selected.
- Show unit price, size/weight, and pricing source.
- Mark stale data when pricing has not been updated recently.

### Promotions and Discounts
- Detect active promotions such as BOGO, digital coupons, member pricing, and temporary markdowns.
- Apply promotions to the basket total when rules are known.
- Indicate promotion eligibility clearly.
- Support store-specific promotion rules.

### Tax Estimation
- Determine state and optionally city/county tax from user location.
- Allow manual store or ZIP code selection when geolocation is unavailable.
- Apply grocery-specific tax rules where relevant.
- Show tax separately from subtotal and discounts.

### Basket Management
- Add, remove, and update quantities for scanned items.
- Support weighted items and variable-price produce.
- Recalculate totals instantly after every change.
- Allow basket persistence across app sessions.

### Search and Manual Entry
- Allow search by product name or brand.
- Allow manual code entry for damaged or unreadable barcodes.
- Suggest products when exact barcode matches are not available.

## Data Model
### Product
- id
- name
- brand
- barcode
- sku
- upc
- ean
- gtin
- size
- unit
- imageUrl
- categories
- nutrition — `NutritionInfo | null`; Nutri-Score, NOVA group, per-100g nutriments, ingredients, allergens/additives, plus an app-computed health verdict (see [docs/health-verdict-rubric.md](docs/health-verdict-rubric.md)); refreshed ~30d via Open Food Facts

### StorePricing
- storeId
- productId
- regularPrice
- salePrice
- effectiveStart
- effectiveEnd
- sourceTimestamp
- confidenceScore

### Promotion
- id
- storeId
- productId
- type
- description
- discountValue
- eligibilityRules
- startDate
- endDate

### BasketItem
- productId
- name
- quantity
- unitPrice
- appliedDiscount
- taxable
- notes

### TaxProfile
- state
- county
- city
- groceryTaxRate
- generalSalesTaxRate
- effectiveDate

## System Architecture
### Mobile App
- React Native with TypeScript.
- Barcode scanning via native camera library.
- Local cache for recent items and basket state.
- Offline-first fallback for previously seen products.

### Backend API
- Authenticated API for product lookup and pricing.
- Aggregation layer that normalizes multiple grocery data sources.
- Tax calculation service integration.
- Promotion rules engine.

### Data Sources
- Store APIs when partnership access exists.
- Third-party product databases for barcode resolution.
- Retail scraping or aggregation services where legally permitted.
- Tax data provider or rules engine.

## Suggested Tech Stack
### Mobile
- React Native
- TypeScript
- React Navigation
- Zustand or Redux Toolkit
- Expo or bare React Native depending on scanner needs

### Backend
- Node.js or .NET API
- PostgreSQL for normalized product/store data
- Redis for short-lived pricing cache
- Background jobs for price refresh and promotion sync

### Integrations
- Barcode lookup provider
- Grocery pricing provider or scraper platform
- Tax calculation API
- Maps/geolocation API

## API Design
### POST /scan/resolve
Input:
- barcode
- storeId
- location

Output:
- product
- pricing
- promotions
- confidence

### POST /basket/recalculate
Input:
- storeId
- items
- location

Output:
- subtotal
- discounts
- tax
- estimatedTotal

### GET /products/search
Query:
- q
- storeId

Output:
- matching products

### GET /stores
Output:
- supported stores
- supported regions

## Pricing Strategy
- Prefer store-specific live pricing over generic catalog pricing.
- Use fallback catalog prices if live price is unavailable.
- Display a freshness indicator for each price.
- Separate regular price, sale price, and applied promotion amount.

## Promotion Rules
- Promotions must be versioned and time-bound.
- Store-specific coupon rules should be configurable.
- Conflicting promotions require deterministic priority.
- Basket-level discounts should be applied after item-level discounts unless store rules say otherwise.

## Tax Rules
- Tax must be based on location and store-specific jurisdiction rules.
- Grocery exemptions should be modeled separately from general taxable goods.
- Alcohol, prepared foods, and non-food items may have different tax treatment.
- Tax rates should be updated from a reliable source on a recurring schedule.

## Privacy and Compliance
- Request location permission only when needed.
- Minimize storage of exact location data.
- Do not collect unnecessary personal information.
- Respect retailer terms of service and data licensing rules.
- Clearly label estimates as estimates, not guaranteed totals.

## Offline Behavior
- Cache last-seen products and prices locally.
- Allow basket editing offline.
- Show cached estimates when network is unavailable.
- Sync updated pricing once connectivity returns.

## Error Handling
- Unknown barcode: offer manual search.
- API timeout: show cached result if available.
- Location denied: allow manual state/ZIP selection.
- Price mismatch: flag stale or uncertain data.
- Promotion conflict: show applied rule and reason.

## MVP Scope
- Barcode scanning.
- Product lookup by barcode.
- Single-store pricing.
- Basic promotion application.
- Sales tax estimation by state/ZIP.
- Basket total calculation.
- Manual product search.

## Future Enhancements
- Loyalty card integration.
- Receipt comparison after checkout.
- Price history and deal tracking.
- Favorite stores and preferred tax profiles.
- AI-assisted product matching for broken or partial codes.
- Pantry tracking and shopping list sync.

## Implementation Milestones
1. Mobile app shell and navigation.
2. Barcode scan and manual entry flow.
3. Product lookup API integration.
4. Basket state management.
5. Tax estimation integration.
6. Promotion engine integration.
7. Cache, offline mode, and error handling.
8. QA, analytics, and store-specific validation.

## Open Questions
- Which grocery chains will be supported first?
- Will the app use partner APIs, scraping, or both?
- How fresh must pricing be before it is considered acceptable?
- How much offline functionality is required?
- Will produce-weight items be supported in MVP?
