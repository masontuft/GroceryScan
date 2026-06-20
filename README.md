# GroceryScan

A React Native mobile app that scans grocery barcodes in-store, looks up live pricing from Kroger, Instacart, and Walmart, applies active promotions, and estimates your checkout total including location-aware sales tax — before you reach the register.

## Demo Video

[Watch the demo on YouTube](https://youtu.be/LPxKTpbuRt8)

## Instructions for Build and Use

Steps to build and/or run the software:

1. Clone the repo and install mobile dependencies: `cd mobile && npm install`
2. Copy the environment file and fill in your Supabase project URL and anon key: `cp mobile/.env.example mobile/.env`
3. Start a local Supabase instance and apply migrations: `supabase start && supabase db push && supabase db seed`
4. Set required API secrets: `supabase secrets set BARCODE_LOOKUP_API_KEY=... KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=... INSTACART_API_KEY=... WALMART_CONSUMER_ID=... WALMART_PRIVATE_KEY=...`
5. Deploy the edge functions: `supabase functions deploy scan-resolve basket-recalculate products-search stores-list manual-submit`
6. Start the Expo dev server: `cd mobile && npm start`

Instructions for using the software:

1. Open the app on your device (scan the QR code with Expo Go) or run on a simulator with `npm run ios` / `npm run android`
2. On the Scan tab, point your camera at a grocery barcode — the app resolves the product, fetches live pricing, and shows active promotions
3. Tap "Add to Basket" to add the item; the Basket tab recalculates your subtotal, discounts, and estimated tax in real time
4. Use the Store selector to set your current store for store-specific pricing, and the Location modal to set your state/ZIP for accurate tax
5. If a barcode won't scan, use the Search tab to find a product by name, or tap "Enter Price Manually" on the product screen

## Development Environment

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* Node.js 20+
* Expo CLI (`npm install -g expo-cli`) — Expo SDK ~54.0
* React Native 0.81.5
* React 19.1.0
* TypeScript ~5.9.2
* Zustand ^5.0.14
* Supabase CLI (latest) — for local Postgres + Deno Edge Functions
* Deno 1.x (used by Supabase edge functions runtime)
* Expo Go app on a physical device, or Xcode / Android Studio for simulators

## Useful Websites to Learn More

I found these websites useful in developing this software:

* [Expo Documentation (v56)](https://docs.expo.dev/versions/v56.0.0/)
* [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
* [UPCitemdb API Reference](https://www.upcitemdb.com/api/explorer)
* [Kroger Developer Portal](https://developer.kroger.com/)
* [Instacart Connect API](https://www.instacart.com/company/how-its-made/introducing-instacart-connect/)
* [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)
* [React Navigation Docs](https://reactnavigation.org/docs/getting-started)

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [ ] Loyalty card integration — link store accounts to auto-apply member pricing and digital coupons
* [ ] Receipt comparison after checkout — photograph a receipt and compare against estimated totals
* [ ] Price history and deal tracking — surface trends and price-drop alerts
* [ ] Favorite stores and preferred tax profiles persisted per user
* [ ] AI-assisted product matching for damaged or partial barcodes
* [ ] Pantry tracking and shopping list sync
* [ ] Additional pricing providers (Target, Whole Foods, etc.)
* [ ] Produce and weighted item support (variable-price items entered by weight)
* [ ] Supabase Auth for cross-device basket sync
* [ ] Push notifications for tracked item price drops
* [ ] Analytics instrumentation for scan events and price accuracy
* [ ] TestFlight and Play Store submission
