# Health Verdict Rubric

This is the source of truth for how GroceryScan turns a scanned product's Open
Food Facts data (Nutri-Score, NOVA processing group, per-100g nutriments) into
a single app-generated health verdict shown on the product detail screen.

It is implemented exactly by `mobile/src/utils/healthVerdict.ts`
(`computeHealthVerdict`). If the scoring rules below change, update this doc
first, then update the constants in that file to match — the code comments
point back here.

## Inputs

- `nutriScoreGrade`: Open Food Facts' own A–E letter grade, or `null` if unknown.
- `novaGroup`: Open Food Facts' 1–4 processing classification, or `null` if unknown.
- Traffic-light level (`low` / `medium` / `high`) for each of **sugars**,
  **salt**, **saturated fat**, and **fat**, computed per-100g using the
  standard UK FSA front-of-pack thresholds (see `mobile/src/utils/nutritionScore.ts`):

  | Nutrient       | Low (≤)  | High (>) |
  |----------------|----------|----------|
  | Fat            | 3 g      | 17.5 g   |
  | Saturated fat  | 1.5 g    | 5 g      |
  | Sugars         | 5 g      | 22.5 g   |
  | Salt           | 0.3 g    | 1.5 g    |

## Scoring

Three components are summed into a single point total, **0–11**, where lower
is healthier:

### 1. Nutri-Score points

| Grade     | Points |
|-----------|--------|
| a         | 0      |
| b         | 1      |
| c         | 2      |
| d         | 3      |
| e         | 4      |
| unknown   | 2 (neutral) |

### 2. NOVA processing points

| NOVA group | Points |
|------------|--------|
| 1 or 2     | 0      |
| 3          | 1      |
| 4 (ultra-processed) | 3 |
| unknown    | 1 (slight caution) |

### 3. Traffic-light points

+1 for each of sugars / salt / saturated fat / fat that is rated **high**
(0 to 4 total). `low` and `medium` contribute 0 — this rubric only penalizes
nutrients that are clearly over the line, not moderate amounts.

## Verdict tiers

The three component scores are summed (0–11 total) and mapped to a tier:

| Score range | Tier                     | Color   |
|-------------|--------------------------|---------|
| 0–2         | **Great choice**         | Green (`#22c55e`) |
| 3–5         | **Good**                 | Light green (`#84cc16`) |
| 6–8         | **Consume in moderation**| Amber (`#f59e0b`) |
| 9–11        | **Limit intake**         | Red (`#ef4444`) |

## No-data case

If `nutriScoreGrade`, `novaGroup`, and all nutriments are null (i.e. Open Food
Facts has no data for this product at all), the verdict is **"Not enough
data"** (grey, `#94a3b8`) with no numeric score. The app never fabricates a
tier from nothing — a missing verdict is preferable to a misleading one.
