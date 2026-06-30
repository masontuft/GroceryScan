import type { PricingProvider, StorePricingResult } from './types.ts';

// Walmart Affiliate API: https://developer.walmart.com/doc/us/mp/us-mp-items/
// Auth: WM_SEC.AUTH_SIGNATURE header — HMAC-SHA256 of "{consumerId}\n{timestamp}\n{version}"
// Returns salePrice (current shelf price) and msrp (regular price).
export class WalmartProvider implements PricingProvider {
  name = 'walmart';
  supportedChains = ['walmart'];

  private consumerId: string;
  private privateKey: string;

  constructor(consumerId: string, privateKey: string) {
    this.consumerId = consumerId;
    this.privateKey = privateKey;
  }

  private async sign(timestamp: string): Promise<string> {
    const message = `${this.consumerId}\n${timestamp}\n1\n`;
    const keyData = atob(this.privateKey.replace(/-----.*?-----/g, '').replace(/\s/g, ''));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      Uint8Array.from(keyData, (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  async fetchPrice(barcode: string, _locationId: string): Promise<StorePricingResult | null> {
    if (!this.consumerId || !this.privateKey) return null;
    try {
      const timestamp = Date.now().toString();
      const signature = await this.sign(timestamp);

      const url = `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/items?upc=${barcode}`;
      const res = await fetch(url, {
        headers: {
          'WM_SEC.KEY_VERSION': '1',
          'WM_CONSUMER.ID': this.consumerId,
          'WM_CONSUMER.INTIMESTAMP': timestamp,
          'WM_SEC.AUTH_SIGNATURE': signature,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        console.error(`Walmart API ${res.status}: ${await res.text()}`);
        return null;
      }
      const json = await res.json() as {
        items?: Array<{ salePrice?: number; msrp?: number }>;
      };

      const item = json.items?.[0];
      if (!item?.salePrice) return null;

      const regularPrice = item.msrp ?? item.salePrice;
      const salePrice = item.salePrice < regularPrice ? item.salePrice : null;

      return {
        regularPrice,
        salePrice,
        effectiveStart: null,
        effectiveEnd: null,
        confidenceScore: 0.90,
        source: 'walmart',
        sourceTimestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
