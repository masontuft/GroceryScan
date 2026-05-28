import type { PricingProvider, StorePricingResult } from './types.ts';

export class KrogerProvider implements PricingProvider {
  name = 'kroger';
  supportedChains = ['kroger', 'fred_meyer', 'ralphs', 'king_soopers', 'smith', 'fry'];

  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const res = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials&scope=product.compact',
    });

    if (!res.ok) throw new Error(`Kroger auth failed: ${res.status}`);
    const json = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async fetchPrice(barcode: string, locationId: string): Promise<StorePricingResult | null> {
    try {
      const token = await this.getToken();
      const url = `https://api.kroger.com/v1/products?filter.term=${barcode}&filter.locationId=${locationId}&filter.limit=1`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      if (!res.ok) return null;
      const json = await res.json() as { data?: Array<{ items?: Array<{ price?: { regular?: number; promo?: number } }> }> };
      const product = json.data?.[0];
      const item = product?.items?.[0];
      const priceData = item?.price;

      if (!priceData) return null;

      return {
        regularPrice: priceData.regular ?? null,
        salePrice: priceData.promo ?? null,
        effectiveStart: null,
        effectiveEnd: null,
        confidenceScore: 0.95,
        source: 'kroger',
        sourceTimestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
