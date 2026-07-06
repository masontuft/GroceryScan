<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into GroceryScan. The existing partial setup (PostHogProvider, `posthog-react-native`, and the `track()` helper) was upgraded to a production-ready configuration — adding batching, retry logic, lifecycle event capture, and proper disabled-state handling. Eight new event capture calls were added across five screens and one store, covering the full user journey from barcode scan through product discovery to basket management.

| Event name | Description | File |
|---|---|---|
| `barcode_scanned` | User scans a product barcode, recording whether the product was found. | `src/screens/ScanScreen.tsx` |
| `product_added_to_basket` | A product is added to the user's basket via any flow. | `src/stores/basketStore.ts` |
| `basket_checkout_viewed` | User views the basket screen with items (top of checkout funnel). | `src/screens/BasketScreen.tsx` |
| `basket_analysis_viewed` | User opens the basket analysis modal. | `src/screens/BasketScreen.tsx` |
| `store_selected` | User selects a store. | `src/stores/storeStore.ts` |
| `product_viewed` | User opens the product detail screen. | `src/screens/ProductDetailScreen.tsx` |
| `manual_price_submitted` | User manually enters a price for a product. | `src/screens/ManualPriceScreen.tsx` |
| `product_searched` | User submits a product search query. | `src/screens/SearchScreen.tsx` |
| `search_result_selected` | User taps a product from search results. | `src/screens/SearchScreen.tsx` |
| `basket_cleared` | User confirms clearing all items from their basket. | `src/stores/basketStore.ts` |
| `price_tag_scanned` | User triggers OCR scanning of a shelf price tag. | `src/screens/ScanScreen.tsx` |
| `quick_entry_item_added` | User adds an item via the Quick Add tab. | `src/screens/QuickEntryScreen.tsx` |
| `winco_item_added` | User completes a Winco quick-entry item. | `src/screens/WincoQuickEntryScreen.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/500071/dashboard/1805118)
- [Daily Scans](https://us.posthog.com/project/500071/insights/K3ImFGC3)
- [Items Added to Basket over Time](https://us.posthog.com/project/500071/insights/TLLLiWZF)
- [Scan Success Rate](https://us.posthog.com/project/500071/insights/MHOdpHLP)
- [Items Added by Category](https://us.posthog.com/project/500071/insights/X74iCFki)
- [Scan-to-Basket Funnel](https://us.posthog.com/project/500071/insights/peE8Z6Mc)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` to `.env.example` and register them as EAS environment variables (`eas env:create`) for the `development`, `preview`, and `production` build profiles so cloud builds include analytics.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
