# PostHog Data Warehouse Setup Report

## Summary

Connected the GroceryScan Supabase database to the PostHog data warehouse as a Postgres source using the Session Pooler.

## What Was Done

- Created a **Postgres** data warehouse source in PostHog (source ID: `019f37c1-2c16-0000-a760-2fa72473f319`)
- Connected via the Supabase Session Pooler (`aws-1-us-east-1.pooler.supabase.com:6543`)
- Configured **incremental sync** for all 4 tables in the `public` schema

## Tables Synced

| Table | Sync Type | Incremental Field |
|---|---|---|
| `products` | incremental | `updated_at` |
| `promotions` | incremental | `created_at` |
| `store_pricing` | incremental | `source_timestamp` |
| `stores` | incremental | `created_at` |

Tables will be queryable in PostHog HogQL with the prefix `supabase_` (e.g. `supabase_products`, `supabase_store_pricing`).

## Files Modified or Created

- `posthog-warehouse-report.md` — this report (new file)

No application source files were modified.

## Next Steps

1. **Wait for the first sync** — PostHog will begin syncing the tables shortly. Check progress at: [Data Warehouse Sources](https://us.posthog.com/project/500071/data-warehouse)
2. **Query your data** — once synced, use HogQL or the Query tab to join product/pricing data with PostHog events, e.g.:
   ```sql
   SELECT e.distinct_id, p.name, p.brand
   FROM events e
   JOIN supabase_products p ON e.properties.$product_id = p.id
   WHERE e.event = 'product_scanned'
   ```
3. **Allowlist PostHog egress IPs** (if sync fails) — if the sync fails with a connection error, add PostHog's egress IP addresses to your Supabase network restrictions. See [PostHog docs](https://posthog.com/docs/cdp/sources/postgres) for the current IP list.
