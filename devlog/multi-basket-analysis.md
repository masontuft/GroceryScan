# Multi-Basket Analysis — Future Feature Spec

## What it is

Let users save and name multiple baskets (e.g. "Weekly Costco Run", "Target Essentials"), then compare them side-by-side: total cost, tax, per-item price deltas across stores, and which store wins for a given list.

---

## Core Concept

Right now the app has one active basket. Multi-basket analysis adds:

1. **Saved baskets** — named snapshots of a basket (items + quantities + store assignment)
2. **Cross-store simulation** — take one basket's items and price them at N different stores simultaneously
3. **Comparison view** — show which store is cheapest for that exact list, with per-item breakdowns

---

## Data Model Changes

### `SavedBasket`
```ts
interface SavedBasket {
  id: string;               // uuid
  name: string;             // user-assigned label
  createdAt: number;
  updatedAt: number;
  items: BasketItem[];
  storeId: string | null;
  location: { state: string | null; zip: string | null };
  lastTotal: BasketTotal | null;
}
```

### `BasketComparison`
```ts
interface BasketComparison {
  basketId: string;
  storeResults: StoreResult[];
}

interface StoreResult {
  storeId: string;
  storeName: string;
  subtotal: number;
  discounts: number;
  tax: number;
  estimatedTotal: number;
  itemBreakdown: ItemResult[];
  missingItems: string[];   // productIds with no price at this store
}

interface ItemResult {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}
```

---

## Store Layer

### `savedBasketStore.ts`
New Zustand store alongside `basketStore`:

- `savedBaskets: SavedBasket[]`
- `saveCurrentBasket(name: string)` — snapshot the active basket
- `loadBasket(id: string)` — set active basket from a saved one
- `deleteBasket(id: string)`
- `renameBasket(id: string, name: string)`

Persist via AsyncStorage key `saved-baskets-v1`.

---

## Backend Changes

### New edge function: `basket-compare`

**Input:**
```json
{
  "items": [...],
  "storeIds": ["store-a", "store-b", "store-c"],
  "location": { "state": "WA", "zip": "98101" }
}
```

**Behavior:**
- Fan out to pricing providers for each `storeId` in parallel
- For each store, price every item (fall back to `null` if unavailable)
- Run the promotion engine per store
- Apply tax by location
- Return `StoreResult[]` sorted by `estimatedTotal` ascending

This reuses the existing `PricingProvider` interface — no structural change needed, just a new fan-out loop that doesn't short-circuit on the first result.

---

## UI

### Saved Baskets screen
- Tab or modal accessible from the Basket tab header
- List of saved baskets with name, item count, last total, store
- Swipe-to-delete, tap-to-load, long-press-to-rename

### Multi-store Comparison sheet
- Triggered from a "Compare Stores" button on any saved basket
- User picks 2–4 stores to compare (from `storeStore`)
- Calls `basket-compare` edge function
- Shows a horizontal card scroll: one card per store, sorted cheapest → most expensive
- Each card: store name, total, savings vs. most expensive
- Expand any card to see full per-item breakdown
- "Switch to this store" CTA updates `basketStore.storeId`

### Winner badge
On the comparison view, the cheapest store gets a "Best Price" badge. If a store is missing prices for >20% of items, show a warning rather than declaring it the winner.

---

## Implementation Order

1. `savedBasketStore.ts` + save/load UI in the Basket footer
2. Saved Baskets list screen
3. `basket-compare` edge function
4. Comparison sheet component
5. "Switch to this store" action

---

## Open Questions

- **How many stores to compare?** Cap at 4 to keep the UI scannable and limit API fan-out.
- **Stale prices in saved baskets?** Show a staleness warning if pricing TTL has expired when loading for comparison.
- **Cross-basket diff?** Power-user feature: compare two *different* saved baskets at the same store (e.g. "what did my list cost last month vs. now?"). Defer until core comparison is shipped.
- **Shareable links?** Export a basket comparison as a shareable summary (via `Share.share()`). Low-effort add-on once the data model exists.
