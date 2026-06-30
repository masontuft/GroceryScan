# iOS Design Review — GroceryScan
**Date:** 2026-06-30  
**Branch:** main  
**Screens reviewed:** Scan, Basket (list + totals), Item Edit Sheet, Basket Analysis, Search (empty state)  
**Source reviewed:** ScanScreen, BasketScreen, BasketItemRow, WincoQuickEntryScreen, SearchScreen

---

## Overall Summary

GroceryScan has a clean, functional foundation with a restrained color palette and a consistent data-entry pattern. The biggest gaps are accessibility (zero VoiceOver labels anywhere), touch targets below the 44pt minimum in two places, and a handful of data-quality issues that surface in the live basket. The visual language is internally consistent — it just needs to be raised on these specific dimensions.

---

## Dimension Scores

| # | Dimension | Score | Blocker? |
|---|---|---|---|
| 1 | Typography hierarchy | 6/10 | No |
| 2 | Spacing rhythm | 6/10 | No |
| 3 | Color hierarchy | 7/10 | No |
| 4 | Touch targets | 5/10 | **Yes** |
| 5 | Loading / empty / error states | 6/10 | No |
| 6 | Accessibility | 3/10 | **Yes** |
| 7 | Animation discipline | 8/10 | No |
| 8 | iOS idiom alignment | 6/10 | No |
| 9 | Information density | 7/10 | No |
| 10 | AI-slop check | 7/10 | No |

---

## 1. Typography Hierarchy — 6/10

**What's working:** The UPPERCASE label / bold value pattern (`formLabel` at 11pt → value at 15–17pt) reads clearly in the WincoQuickEntry form and in the BasketItemRow edit panel. The 28pt price input in WincoQuickEntry correctly makes the key data field the most prominent element.

**What would make it a 10:**
- The `manualInput` in WincoQuickEntry is `fontSize: 14` while the equivalent in ScanScreen is `fontSize: 15` — pick one and use it everywhere for body inputs.
- There is no display tier. The largest "headline" on any screen is `fontSize: 18` (basket empty state). Consider a 22–24pt heading tier for the basket total (`Est. Total $19.51`) — right now it reads at the same weight as the item names.
- Basket section headers (`fontSize: 13, fontWeight: '700'`) are correct iOS list-section style.
- `v1.0.0` version label is rendering in the Basket nav bar — visible to end users, should be removed from production builds.

---

## 2. Spacing Rhythm — 6/10

**What's working:** `padding: 16` is used consistently for row and section padding, which creates a reliable reading margin. `gap: 12` in BasketItemRow controls and `gap: 10` in ScanScreen's manual bar are close to an 8pt grid.

**What would make it a 10:**
- `gap: 6` (chips), `gap: 8` (manualRow), `gap: 10` (controls), `gap: 12` (row) all appear in adjacent contexts — collapse to 8/16 only.
- `borderRadius` values are 8, 10, 16, and 20 across the same screen. Pick two (small: 8, pill: 20) and stop using 10/16.
- `marginTop: 12` and `marginTop: 14` on WincoQuickEntry form labels — should both be 12 or both 16.
- `paddingVertical: 5` on WincoQuickEntry category chips and `paddingVertical: 6` on BasketItemRow chips — use 6 everywhere.

---

## 3. Color Hierarchy — 7/10

**What's working:** Blue (#2563eb) = primary action, Green (#16a34a) = "add/complete" (Add to Basket), Red (#ef4444) = destructive (Clear Basket). This three-role palette is correct and consistent.

**What would make it a 10:**
- The `"No Store"` text in the Basket nav bar is plain blue with no button affordance — it looks like a label. Give it a pill border or chevron to communicate that it's tappable.
- The category chip in BasketItemRow uses **blue** (`#2563eb` / `#eff6ff`) while the same chip in WincoQuickEntry uses **green** (`#16a34a` / `#f0fdf4`). These are the same UI concept — standardize on one color.
- The basket analysis donut chart uses two very similar blue-gray tones for "Other" and "Beverages" — they're hard to distinguish at a glance. "Other" (gray) is fine; give Beverages a teal or warmer hue.
- Dark mode: all colors are hardcoded hex. No `useColorScheme` or system semantic colors. The app will render white backgrounds in Dark Mode on iOS, which looks broken.

---

## 4. Touch Targets — 5/10

**What would make it a 10:**
- **Category chips** in WincoQuickEntryScreen: `paddingVertical: 5` + `fontSize: 12` ≈ **22pt tall**. Apple HIG minimum is 44pt. This is the most critical fix — it's a core interaction for a just-added feature.
- **Category chips** in BasketItemRow: `paddingVertical: 6` ≈ **24pt tall**. Same problem.
- **`−` / `+` quantity buttons** in BasketItemRow: `width: 28, height: 28`. At 28pt these are too small for users who aren't hitting them precisely. Increase to 36×36 minimum, ideally 44×44.
- **`✕` remove button** in BasketItemRow has no explicit size — it's just a `Text` with `fontSize: 16`. No touch target padding at all.
- **`📷` OCR button** in WincoQuickEntry: `paddingHorizontal: 8, paddingVertical: 4` ≈ 24pt tall.
- ScanScreen manual input (`height: 44`) and WincoQuickEntry manual input (`height: 40`) — 40 is below minimum.

**Immediate fixes (3 lines each):**
```js
// chips: change paddingVertical: 5 → paddingVertical: 14 (total 40pt; 44 is tight with label)
// qtyBtn: change width: 28, height: 28 → width: 36, height: 36
// remove: wrap ✕ in a View with width: 36, height: 36 and center it
```

---

## 5. Loading / Empty / Error States — 6/10

**What's working:** Basket empty state (🛒 + text + hint) is clear and actionable. WincoQuickEntry's loading overlay (dark glass + spinner + text) is correct. ScanScreen's loading overlay with "Looking up product…" is good.

**What would make it a 10:**
- **Search initial state is blank white.** When the user opens Search and hasn't typed yet, there is nothing between the search bar and the bottom of the screen. Add a hint: "Search by product name or brand" with a magnifying glass illustration.
- **`"Item (096619204205)"`** appears as an item name in the live basket — the raw UPC leaked through when product resolution fails. The fallback name in ScanScreen is `` `Item (${barcode})` `` — this is what the user sees forever. Replace with something more human: "Unknown Item" or let the user rename it on scan failure.
- **Network error on Search** silently shows 0 results. Add a `catch` that sets an error string and renders "Couldn't reach the server — check your connection."
- **Clear Basket** calls `clearBasket()` directly with no confirmation dialog. A `Alert.alert('Clear basket?', ..., [{text: 'Cancel'}, {text: 'Clear', style: 'destructive'}])` is one line.

---

## 6. Accessibility — 3/10

This is the biggest gap in the codebase. Zero `accessibilityLabel`, `accessibilityHint`, or `accessibilityRole` props appear anywhere in the screens reviewed.

**What VoiceOver users hear today:**
- Every `TouchableOpacity` → "button" (no description)
- The `✕` remove button → "times, button"
- `📊 Basket Analysis` → "chart increasing, Basket Analysis, button"
- Category chips → "Dairy and Eggs, button" (OK by accident due to text content)
- `−` / `+` buttons → "minus sign, button" / "plus sign, button" — not horrible but "Decrease quantity" / "Increase quantity" would be much better

**Minimum viable fix (highest impact):**
```jsx
// BasketItemRow quantity buttons
<TouchableOpacity
  accessibilityLabel={`Decrease quantity of ${item.name}`}
  accessibilityRole="button"
  ...
/>
// ✕ remove button  
<TouchableOpacity
  accessibilityLabel={`Remove ${item.name} from basket`}
  accessibilityRole="button"
  ...
/>
// Scan screen search button
<TouchableOpacity accessibilityLabel="Search by barcode" accessibilityRole="button" .../>
```

Also: all font sizes are hardcoded. They won't scale with Dynamic Type. At minimum test at XXL — at 28pt the WincoQuickEntry price input is already very large; at XXL it would overflow.

---

## 7. Animation Discipline — 8/10

**What's working:** The app uses React Navigation's default transitions (slide-in for push, modal for BasketAnalysis). No gratuitous animations. ActivityIndicator is used sparingly and correctly. The `activeOpacity={0.75–0.8}` values give appropriate tap feedback.

**What would make it a 10:**
- Category chip selection has no visual feedback between states — no spring or fade. A quick `200ms` fade on the `borderColor` / `backgroundColor` would make it feel native.
- The BasketItemRow expand/collapse (collapsed → edit panel) is instantaneous — a `LayoutAnimation.easeInEaseOut()` before `setExpanded` would make the section feel intentional rather than jarring.
- Neither of these is urgent.

---

## 8. iOS Idiom Alignment — 6/10

**What's working:** SectionList with sticky headers is the correct iOS pattern for categorized lists. React Navigation's native stack is appropriate. The modal-bottom-sheet for item editing follows the iOS sheet pattern.

**What would make it a 10:**
- **No swipe-to-delete** on basket items. iOS users expect to swipe left to reveal a delete action on list rows. Right now the only delete path is tapping the row, expanding the edit panel, and not using Discard/Save. Add `renderHiddenItem` / swipe config (or use `react-native-swipeable-row`).
- **"Done — Go to Basket"** button in WincoQuickEntry is a full-width CTA button at the bottom — Android Material style. On iOS this belongs in the navigation bar's trailing button position.
- **"No Store" in Basket** is a bare tappable text label in the nav bar area. iOS convention is a `Button` item in the navigation bar's `headerRight` with a chevron or gear icon.
- The tab bar uses emoji icons (Scan=📷, Quick Add=⚡, Basket=🛒, Search=🔍) which render as color emoji. SF Symbols equivalents would integrate better with the system (and respect tint color).

---

## 9. Information Density — 7/10

**What's working:** The basket SectionList uses available space well — each row packs name, category badge, unit price, quantity controls, and total price with no clipping. Section headers with counts (e.g. "DAIRY & EGGS / 4") are scannable.

**What would make it a 10:**
- **Basket Analysis** has a large empty white area below the "Beverages / 2.7% / $0.50" row (visible in screenshots). Either add "Average per item", per-category tax-exempt percentage, or a "Biggest spend category" callout — the screen is clearly designed to have more content.
- **Search results** show name + brand + size, which is good. Missing: a price or store availability indicator on each result so the user knows whether selecting it will show real pricing.
- **WincoQuickEntry added-items list** shows name + price but no category or running subtotal. Adding a small subtotal counter at the bottom of the "Added (N)" list would reinforce that the user is building a basket.

---

## 10. AI-Slop Check — 7/10

**What's clean:** The color palette is well-chosen and project-specific (not a default Tailwind starter). The custom section headers, category badge pattern, and total breakdown are purpose-built, not copy-pasted from a template. The WincoQuickEntry flow is a genuinely original UX pattern for the no-pricing-available grocery store case.

**What needs attention:**
- **`v1.0.0` in the Basket nav bar.** This is almost certainly a `<Text>` in the header config that was put there during development and never removed. Users should not see build metadata.
- **`Item (096619204205)`** as a product name. The raw UPC as a fallback name is a data-quality artifact, not a design choice — but it's what the user sees when the barcode lookup fails. Replace the fallback label.
- **14 categories hardcoded inline in WincoQuickEntry** as an `as const` array inside JSX. This list is already defined as `STANDARD_CATEGORIES` in `normalizeCategory.ts` — WincoQuickEntry should import and use that constant instead of duplicating it.

---

## Priority Fix List

**Must fix before sharing with anyone outside the team:**

1. **Touch targets < 44pt** — category chips (22pt), quantity −/+ (28pt), ✕ remove (no target). Fix all three. *(Dimension 4)*
2. **No accessibility labels anywhere** — add labels to the 6 most-used touchables: −, +, ✕, Search, Add to Basket, Clear Basket. *(Dimension 6)*
3. **`v1.0.0` in Basket nav bar** — remove or gate on `__DEV__`. *(Dimension 10)*
4. **Clear Basket needs a confirmation Alert.** Destructive action with no safeguard. *(Dimension 5)*

**High leverage, quick wins:**

5. **Search initial empty state** — add a hint view. *(Dimension 5)*
6. **`Item (UPC)` fallback name** — change to "Unknown item — tap to rename". *(Dimension 5)*
7. **Category chip color divergence** — BasketItemRow uses blue chips; WincoQuickEntry uses green chips. Standardize. *(Dimension 3)*
8. **"No Store" button affordance** — add a chevron or border so it reads as tappable. *(Dimension 3)*
9. **Dark mode audit** — all colors are hardcoded. Will look broken in Dark Mode. *(Dimension 3)*
10. **Import `STANDARD_CATEGORIES` in WincoQuickEntry** instead of the duplicated inline array. *(Dimension 10)*

**Nice to have:**

11. Swipe-to-delete on basket rows *(Dimension 8)*
12. `LayoutAnimation` on BasketItemRow expand/collapse *(Dimension 7)*
13. `accessibilityLabel` on all touchables (beyond the 6 minimum) *(Dimension 6)*
14. Basket Analysis lower half: add content or trim the whitespace *(Dimension 9)*
