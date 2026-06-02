# UPCitemdb API — Coding Agent Reference
> Free tier barcode/UPC price lookup via the UPCitemdb REST API  
> API Version: 1.0.3 | Base URL: `https://api.upcitemdb.com/prod`  
> Contact: api@upcitemdb.com

---

## Overview

UPCitemdb provides a RESTful API for looking up product information and prices by UPC, EAN, or ISBN barcode. The **FREE plan requires no sign-up** and gives full database access. Just use the `/trial` endpoint path instead of `/v1`.

---

## Free Tier vs. Paid

| Feature           | Free                                              | Paid (DEV/PRO)                                     |
|-------------------|---------------------------------------------------|----------------------------------------------------|
| Sign up required  | No                                                | Yes                                                |
| Lookup endpoint   | `https://api.upcitemdb.com/prod/trial/lookup`     | `https://api.upcitemdb.com/prod/v1/lookup`         |
| Search endpoint   | `https://api.upcitemdb.com/prod/trial/search`     | `https://api.upcitemdb.com/prod/v1/search`         |
| Request headers   | `Content-Type`, `Accept`                          | `Content-Type`, `Accept`, `key_type`, `user_key`   |
| Batch query       | Up to **2** UPCs per request (comma-separated)    | Up to 10 UPCs per request                          |
| Offer links       | Redirected through upcitemdb.com                  | Most are direct merchant links                     |

> **For FREE plan:** Do NOT include `user_key` or `key_type` headers.

---

## Rate Limits

### Daily Limits

| Plan  | Lookup Requests/day | Search Requests/day | Combined/day |
|-------|---------------------|---------------------|--------------|
| FREE  | —                   | —                   | **100 total** (max 20 search) |
| DEV   | 20,000              | 2,000               | Separate      |
| PRO   | 150,000             | 20,000              | Separate      |

### Burst Limits

| Plan  | Lookup burst                   | Search burst                    |
|-------|--------------------------------|---------------------------------|
| FREE  | 6 requests/minute              | 2 requests/30 seconds           |
| DEV   | 15 requests/30 seconds         | 5 requests/30 seconds           |
| PRO   | 12 requests/second             | 2 requests/second               |

### Sustainable Rate (recommended steady-state)

| Plan  | Lookup                         | Search                          |
|-------|--------------------------------|---------------------------------|
| FREE  | 1 request/10 seconds           | 1 request/10 seconds            |
| DEV   | 1 request/2 seconds            | 1 request/6 seconds             |
| PRO   | 6 requests/second              | 1 request/second                |

### Connections

| Plan  | Max concurrent connections |
|-------|---------------------------|
| FREE  | 1                         |
| DEV   | 2                         |
| PRO   | 6                         |

---

## Endpoints

### Lookup by Barcode — HTTP GET (Free Tier)

```
GET https://api.upcitemdb.com/prod/trial/lookup?upc={BARCODE}
```

**Query Parameter:**

| Parameter | Type   | Required | Description                  |
|-----------|--------|----------|------------------------------|
| `upc`     | string | Yes      | UPC-A, EAN-13, or ISBN code. For batch, comma-separate up to 2 codes. |

**Example:**
```
GET https://api.upcitemdb.com/prod/trial/lookup?upc=4002293401102
```

---

### Lookup by Barcode — HTTP POST (Free Tier)

```
POST https://api.upcitemdb.com/prod/trial/lookup
Content-Type: application/json
Accept: application/json
```

**Request Body:**
```json
{
  "upc": "4002293401102"
}
```

For batch (up to 2 on free tier):
```json
{
  "upc": "4002293401102,0885909950805"
}
```

---

### Search — HTTP GET (Free Tier)

```
GET https://api.upcitemdb.com/prod/trial/search
```

| Parameter    | Type   | Required | Description                                              |
|--------------|--------|----------|----------------------------------------------------------|
| `s`          | string | Yes      | Search keywords, e.g. `iphone 6`                         |
| `brand`      | string | No       | Brand name filter, e.g. `apple`                          |
| `category`   | string | No       | Category keyword, e.g. `phones`                          |
| `title`      | string | No       | Product title keyword, e.g. `64gb`                       |
| `asin`       | string | No       | Model number, e.g. `MG5A2LL`                             |
| `offset`     | number | No       | Offset for paging; `0` means no more results             |
| `match_mode` | number | No       | `1` = strict (default), `0` = best match                 |
| `type`       | string | No       | `product` (default) or `book`                            |

---

## Request Headers

### Free Tier (no auth required)

```
Content-Type: application/json
Accept: application/json
Accept-Encoding: gzip, deflate   (optional, enables compression)
```

### Paid Tier (additional headers)

```
Content-Type: application/json
Accept: application/json
user_key: YOUR_API_KEY
key_type: 3scale
```

> **Note:** JSON payloads use double quotes `"`. Compression is supported — include `Accept-Encoding: gzip` and the response will include `Content-Encoding: gzip`.

---

## Code Examples (Free Tier)

### cURL

```bash
# GET request (free tier)
curl -H "Content-Type: application/json" \
     -H "Accept: application/json" \
     "https://api.upcitemdb.com/prod/trial/lookup?upc=4002293401102"

# POST request (free tier)
curl -X POST \
     -H "Content-Type: application/json" \
     -H "Accept: application/json" \
     -H "Accept-Encoding: gzip, deflate" \
     --compressed \
     -d '{"upc": "4002293401102"}' \
     "https://api.upcitemdb.com/prod/trial/lookup"
```

### Python

```python
import requests
import json

# Free tier — no API key needed
headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
}

# GET method
barcode = "4002293401102"
resp = requests.get(
    f'https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}',
    headers=headers
)
data = resp.json()

for item in data['items']:
    print(f"EAN: {item['ean']}")
    print(f"Title: {item['title']}")
    print(f"Brand: {item['brand']}")
    print(f"Lowest price: {item.get('lowest_recorded_price', 'N/A')}")
    print(f"Highest price: {item.get('highest_recorded_price', 'N/A')}")
    for offer in item.get('offers', []):
        print(f"  Store: {offer['domain']}  |  Title: {offer['title']}  |  Price: {offer['price']}")
```

### Node.js

```javascript
const request = require('request');

// Free tier — no API key needed
request.post({
    uri: 'https://api.upcitemdb.com/prod/trial/lookup',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    json: { upc: '4002293401102' }
}, function(err, response, body) {
    if (err) { console.error(err); return; }
    const items = body.items || [];
    items.forEach(item => {
        console.log(`Title: ${item.title}, Brand: ${item.brand}`);
        (item.offers || []).forEach(offer => {
            console.log(`  ${offer.domain} — $${offer.price}`);
        });
    });
});
```

---

## Response Schema

### ItemsResponse (success)

```json
{
  "code": "OK",
  "total": 1,
  "offset": 0,
  "items": [ { "...item fields..." } ]
}
```

### Item Object

| Field                    | Type    | Description                                                                                  |
|--------------------------|---------|----------------------------------------------------------------------------------------------|
| `ean`                    | string  | EAN-13 (13-digit). If it starts with `0`, the remaining 12 digits are the UPC-A.            |
| `title`                  | string  | Product title.                                                                               |
| `upc`                    | string  | *(optional)* UPC-A 12-digit code. Only present if EAN starts with `0`.                      |
| `gtin`                   | string  | *(optional)* GTIN-14 trade item identifier.                                                  |
| `elid`                   | string  | *(optional)* eBay Listing ID (9–12 digits). Access via `http://www.ebay.com/itm/[eLID]`.    |
| `description`            | string  | Product description (< 515 chars).                                                           |
| `brand`                  | string  | Brand or manufacturer name (< 64 chars).                                                     |
| `model`                  | string  | Model number (< 32 chars).                                                                   |
| `color`                  | string  | Color (< 32 chars).                                                                          |
| `size`                   | string  | Size (< 32 chars).                                                                           |
| `dimension`              | string  | Dimensions (< 32 chars).                                                                     |
| `weight`                 | string  | Weight (< 16 chars).                                                                         |
| `category`               | string  | Google product taxonomy category.                                                            |
| `currency`               | string  | Currency for price fields: `USD`, `CAD`, `EUR`, `GBP`, `SEK`. Default `""` means `USD`.     |
| `lowest_recorded_price`  | number  | *(optional)* Lowest historical price tracked. Not available for books.                       |
| `highest_recorded_price` | number  | *(optional)* Highest historical price tracked. Not available for books.                      |
| `images`                 | array   | Array of image URL strings.                                                                  |
| `offers`                 | array   | Array of offer objects (see below).                                                          |
| `user_data`              | string  | *(optional)* Echo of the `user_data` field set in the request (max 32 chars).               |

> **Note:** Amazon and eBay product/offer data are **not** included in API responses. `elid` is a reference only.

### Offer Object

| Field          | Type          | Description                                                              |
|----------------|---------------|--------------------------------------------------------------------------|
| `merchant`     | string        | Online store name.                                                       |
| `domain`       | string        | Online store domain.                                                     |
| `title`        | string        | Product name as listed by the merchant.                                  |
| `currency`     | string        | Currency: `USD`, `CAD`, `EUR`, `GBP`, `SEK`. Default `""` = `USD`.      |
| `list_price`   | number/string | Original/MSRP price, or `""` if unavailable.                            |
| `price`        | number        | Current sale price.                                                      |
| `shipping`     | string        | `"Free Shipping"` or other shipping info.                                |
| `condition`    | string        | `"New"` or `"Used"`.                                                     |
| `availability` | string        | `""` = available, `"Out of Stock"` = unavailable.                       |
| `link`         | string        | Product page URL at the merchant. On free tier, redirected via upcitemdb.|
| `updated_t`    | number        | Unix timestamp of when the offer was last updated.                       |

### Sample Full Response

```json
{
  "code": "OK",
  "total": 1,
  "offset": 0,
  "items": [
    {
      "ean": "0885909950805",
      "title": "Apple iPhone 6, Space Gray, 64 GB (T-Mobile)",
      "upc": "885909950805",
      "gtin": "string",
      "description": "iPhone 6 isn't just bigger — it's better...",
      "brand": "Apple",
      "model": "MG5A2LL/A",
      "dimension": "string",
      "weight": "string",
      "category": "Electronics > Communications > Telephony > Mobile Phones > Unlocked Mobile Phones",
      "currency": "",
      "lowest_recorded_price": 350,
      "highest_recorded_price": 8500,
      "images": [
        "http://img1.r10.io/PIC/112231913/0/1/250/112231913.jpg"
      ],
      "offers": [
        {
          "merchant": "Newegg.com",
          "domain": "newegg.com",
          "title": "Apple iPhone 6 64GB T-Mobile Space Gray MG5A2LL/A",
          "currency": "",
          "list_price": 0,
          "price": 1200,
          "shipping": "Free Shipping",
          "condition": "New",
          "availability": "Out of Stock",
          "link": "https://www.upcitemdb.com/norob/alink/?id=v2p2...",
          "updated_t": 1479243029
        }
      ]
    }
  ]
}
```

---

## Error Responses

### Error Schema

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description"
}
```

### HTTP Status Codes & Error Codes

| HTTP Status | Code                     | Description                                                                                               |
|-------------|--------------------------|-----------------------------------------------------------------------------------------------------------|
| 400         | `INVALID_QUERY`          | Required parameter missing from request.                                                                  |
| 400         | `INVALID_UPC`            | Not a valid UPC/EAN/ISBN code.                                                                            |
| 401         | `AUTH_ERR`               | *(Paid plans only)* `user_key` header could not be authenticated.                                         |
| 404         | `NOT_FOUND`              | No matching item found, or wrong endpoint path.                                                           |
| 429         | `EXCEED_LIMIT`           | Daily request limit exceeded. Check `X-RateLimit-Limit` response header for your plan's daily limit.      |
| 429         | `TOO_FAST`               | Burst rate limit exceeded. Application must **sleep** until `X-RateLimit-Reset` before next request.      |
| 429         | `HTTP_TOO_MANY_REQUESTS` | Server-side issue. Email api@upcitemdb.com with your sample request and timestamp.                        |
| 5xx         | `SERVER_ERR`             | Internal server error. If persistent, email api@upcitemdb.com.                                            |

---

## Rate Limit HTTP Response Headers

Inspect these headers on every response to track usage:

```
X-RateLimit-Limit: 100          # Your plan's ceiling for this request type
X-RateLimit-Remaining: 85       # Requests remaining in the current window
X-RateLimit-Reset: 1462696544   # Daily reset time (Unix timestamp)
X-RateLimit-Current: ...        # Current count (only appears when you've exceeded plan limits)
```

> **Important:** When burst limits are hit, these headers reflect burst window info. Otherwise, they reflect daily limits.

---

## Best Practices for Free Tier Usage

**Respect rate limits — sleep between requests.** On the free tier, keep to 1 request per 10 seconds. If you receive a `429 TOO_FAST`, stop sending immediately and wait until `X-RateLimit-Reset`.

**Batch barcodes when possible.** The free tier supports up to 2 UPCs per request as a comma-separated string:
```
upc=012345678901,098765432109
```

**Reuse HTTP connections.** Opening a new TCP connection per request is wasteful. Use a session object (e.g., `requests.Session()` in Python). Note: connections idle for more than 5 minutes will be closed by the API gateway.

**Handle errors gracefully.** Always check `response.status_code` and the `code` field in the JSON body before accessing `items`.

**Do not retry on 429 immediately.** Parse `X-RateLimit-Reset` and sleep until that Unix timestamp before retrying.

---

## Quick Reference — Free Tier Barcode Lookup

```python
import requests
import time

BASE_URL = "https://api.upcitemdb.com/prod/trial/lookup"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
}

def lookup_barcode(barcode: str) -> dict:
    """
    Look up a product by barcode (UPC-A, EAN-13, or ISBN).
    Returns the parsed JSON response dict.
    Raises ValueError on bad input, RuntimeError on API errors.
    """
    resp = requests.get(BASE_URL, params={"upc": barcode}, headers=HEADERS)

    if resp.status_code == 429:
        reset = int(resp.headers.get("X-RateLimit-Reset", time.time() + 60))
        sleep_secs = max(reset - int(time.time()), 1)
        raise RuntimeError(f"Rate limited. Retry after {sleep_secs}s (at Unix {reset}).")

    if resp.status_code == 404:
        raise ValueError(f"No product found for barcode: {barcode}")

    if resp.status_code == 400:
        raise ValueError(f"Invalid barcode or request: {resp.json().get('code')}")

    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "OK" or not data.get("items"):
        raise ValueError(f"No results returned. Code: {data.get('code')}")

    return data

def get_prices(barcode: str) -> list[dict]:
    """
    Returns a list of current offer prices for a barcode.
    Each dict has: merchant, price, currency, condition, availability, link.
    """
    data = lookup_barcode(barcode)
    item = data["items"][0]
    print(f"Product: {item['title']} | Brand: {item['brand']}")
    print(f"Lowest ever: {item.get('lowest_recorded_price', 'N/A')} | Highest ever: {item.get('highest_recorded_price', 'N/A')}")

    offers = []
    for offer in item.get("offers", []):
        offers.append({
            "merchant": offer["merchant"],
            "price": offer["price"],
            "currency": offer.get("currency") or "USD",
            "condition": offer.get("condition"),
            "availability": offer.get("availability") or "In Stock",
            "link": offer.get("link"),
        })
    return offers


# Example usage
if __name__ == "__main__":
    barcode = "4002293401102"  # Replace with scanned barcode
    prices = get_prices(barcode)
    for p in prices:
        print(f"  {p['merchant']}: {p['currency']} {p['price']} ({p['condition']}) — {p['availability']}")

    time.sleep(10)  # Respect free tier: 1 req/10 seconds
```

---

## Supported Barcode Types

| Type    | Format  | Digits | Notes                                      |
|---------|---------|--------|--------------------------------------------|
| UPC-A   | GTIN-12 | 12     | Standard US product barcode                |
| EAN-13  | GTIN-13 | 13     | International; UPC-A is EAN with leading 0 |
| ISBN    | —       | 10/13  | Books                                      |
| GTIN-14 | —       | 14     | Trade item / case-level packaging          |

Pass any of these as the `upc` parameter — the API accepts all formats.