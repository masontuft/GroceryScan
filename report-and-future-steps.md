# GroceryScan — Build Report & Future Steps

## What was built

### Mobile app (`mobile/`)
- **Expo TypeScript app** with all dependencies installed
- **3-tab navigation**: Scan → ProductDetail, Basket, Search, plus StoreSelect and Location modals
- **Screens**: ScanScreen (live barcode camera + manual entry), ProductDetailScreen, BasketScreen, SearchScreen, StoreSelectScreen, LocationScreen
- **4 Zustand stores** (all persisted to AsyncStorage): `basketStore`, `productStore` (cache-first with TTLs), `storeStore`, `locationStore`
- **Components**: PriceTag (with freshness badge), PromotionBadge, BasketItemRow (quantity stepper), TotalBreakdown
- **Offline support**: `useNetworkStatus` hook, offline banners, `sync.ts` background reconnect handler
- **Tax rates**: Bundled JSON for all 50 states + DC + 8 city overrides

### Backend (`supabase/`)
- **5 SQL migrations**: products, stores, store_pricing, promotions, RLS (read-only for anon key)
- **4 Deno edge functions**: `scan-resolve`, `basket-recalculate`, `products-search`, `stores-list`
- **Pricing abstraction layer**: `PricingProvider` interface + `KrogerProvider` (OAuth2 + Product Locator API) + `InstacartProvider`
- **Promotion engine**: handles markdown, BOGO, digital coupons, member pricing with deterministic priority
- **Seed data**: sample stores + test product + sample promotion

## To start using it

1. Copy `mobile/.env.example` → `mobile/.env` and fill in your Supabase project URL and anon key
2. Run `supabase secrets set` for the 4 API keys (see `supabase/.env.example`)
3. `supabase db push && supabase db seed` to set up the database
4. `cd mobile && npm start` to launch the app

## Future Steps

The following items are out of scope for MVP but listed in the spec as future enhancements:

- **Loyalty card integration** — link store loyalty accounts to automatically apply member pricing and digital coupons
- **Receipt comparison after checkout** — let users photograph a receipt and compare against estimated totals
- **Price history and deal tracking** — store historical `store_pricing` rows and surface trends or alerts
- **Favorite stores and preferred tax profiles** — persist user preferences across sessions
- **AI-assisted product matching** — use a model to fuzzy-match partial or damaged barcodes to known products
- **Pantry tracking and shopping list sync** — track what's at home and generate optimized shopping lists
- **Additional grocery chains** — add new `PricingProvider` implementations (Walmart, Target, Whole Foods, etc.)
- **Produce and weighted items** — support variable-price items entered by weight at the scale
- **User accounts** — add Supabase Auth so baskets and preferences sync across devices
- **Push notifications** — alert users when a tracked item goes on sale
- **Analytics** — instrument scan events, basket completions, and price accuracy for ongoing improvement
- **TestFlight / Play Store submission** — configure `app.json` bundle IDs, icons, splash screens, and submit for review
