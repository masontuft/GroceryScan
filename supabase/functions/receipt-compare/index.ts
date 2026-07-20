import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

// Fuzzy-match threshold below which a receipt line is left for the user to
// confirm manually rather than auto-matched — mirrors the 0.3 threshold
// already used by search_products_fuzzy (see scan-resolve/index.ts).
const MATCH_THRESHOLD = 0.3;

interface BasketItemInput {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  priceSource?: string | null;
}

interface RequestBody {
  imageBase64?: string;
  storeId?: string | null;
  basketSnapshot?: BasketItemInput[];
  calculatedTotal?: { subtotal: number; tax: number; estimatedTotal: number };
}

interface ParsedReceiptLine {
  rawText: string;
  parsedName: string | null;
  price: number | null;
  quantity: number | null;
}

interface ParsedReceipt {
  storeNameGuess: string | null;
  lines: ParsedReceiptLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

// Uppercase + strip punctuation so "Org Bananas" and "ORG BANANA" compare cleanly.
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

// Dice coefficient over character bigrams — cheap, dependency-free, and tolerant
// of abbreviated store SKU names ("ORG BANANA" vs "Organic Bananas").
function nameSimilarity(a: string, b: string): number {
  const A = bigrams(normalize(a));
  const B = bigrams(normalize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const bg of A) if (B.has(bg)) intersection++;
  return (2 * intersection) / (A.size + B.size);
}

// Blends name similarity with price proximity so "Bananas" at $0.59 doesn't
// beat "Banana Bread" at $4.99 just because it's a shorter string.
function matchScore(line: ParsedReceiptLine, item: BasketItemInput): number {
  const nameScore = line.parsedName ? nameSimilarity(line.parsedName, item.name) : nameSimilarity(line.rawText, item.name);
  if (line.price === null) return nameScore;
  const calculatedLineTotal = item.unitPrice * item.quantity;
  const priceScore = calculatedLineTotal > 0
    ? Math.max(0, 1 - Math.abs(line.price - calculatedLineTotal) / calculatedLineTotal)
    : 0;
  return nameScore * 0.7 + priceScore * 0.3;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function parseReceiptWithGemini(imageBase64: string, apiKey: string): Promise<ParsedReceipt> {
  const schema = {
    type: 'OBJECT',
    properties: {
      storeNameGuess: { type: 'STRING', nullable: true },
      lines: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            rawText: { type: 'STRING' },
            parsedName: { type: 'STRING', nullable: true },
            price: { type: 'NUMBER', nullable: true },
            quantity: { type: 'NUMBER', nullable: true },
          },
          required: ['rawText'],
        },
      },
      subtotal: { type: 'NUMBER', nullable: true },
      tax: { type: 'NUMBER', nullable: true },
      total: { type: 'NUMBER', nullable: true },
    },
    required: ['lines'],
  };

  const prompt = 'This is a photo of a printed grocery store receipt. Extract every purchased line ' +
    'item (skip headers, barcodes, payment/card lines, and loyalty program text). For each line, ' +
    'give the raw printed text, your best-guess canonical product name (grocery receipts often use ' +
    'abbreviated SKU names like "ORG BANANA" or "GV 2% MILK" — expand these when you can), the line ' +
    'price, and quantity if shown. Also extract the printed subtotal, tax, and total, and a guess at ' +
    'the store name/chain. Use null for anything not legible or not present.';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');

  return JSON.parse(text) as ParsedReceipt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    return await handleRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[receipt-compare] unhandled error:', message);
    return errorResponse(`Internal error: ${message}`, 500);
  }
});

async function handleRequest(req: Request) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { imageBase64, storeId, basketSnapshot, calculatedTotal } = body;
  if (!imageBase64) return errorResponse('imageBase64 is required');
  if (!basketSnapshot?.length) return errorResponse('basketSnapshot is required');
  if (!calculatedTotal) return errorResponse('calculatedTotal is required');

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return errorResponse('GEMINI_API_KEY not configured', 500);

  const parsed = await parseReceiptWithGemini(imageBase64, apiKey);

  // Greedy match: each receipt line takes the best-scoring not-yet-matched
  // basket item above MATCH_THRESHOLD. Basket sizes here are small (typically
  // well under 30 items), so O(lines * items) is fine without an index.
  const remaining = [...basketSnapshot];
  const matched: Array<{
    line: ParsedReceiptLine;
    item: BasketItemInput;
    score: number;
  }> = [];
  const unmatched: ParsedReceiptLine[] = [];

  for (const line of parsed.lines) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < remaining.length; i++) {
      const score = matchScore(line, remaining[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= MATCH_THRESHOLD) {
      matched.push({ line, item: remaining[bestIdx], score: bestScore });
      remaining.splice(bestIdx, 1);
    } else {
      unmatched.push(line);
    }
  }

  const db = getAdminClient();

  const actualSubtotal = parsed.subtotal ?? null;
  const actualTax = parsed.tax ?? null;
  const actualTotal = parsed.total ?? null;
  const totalDelta = actualTotal !== null ? round2(actualTotal - calculatedTotal.estimatedTotal) : null;

  const { data: scanRow, error: scanErr } = await db
    .from('receipt_scans')
    .insert({
      store_id: storeId ?? null,
      basket_snapshot: basketSnapshot,
      calculated_subtotal: calculatedTotal.subtotal,
      calculated_tax: calculatedTotal.tax,
      calculated_total: calculatedTotal.estimatedTotal,
      actual_subtotal: actualSubtotal,
      actual_tax: actualTax,
      actual_total: actualTotal,
      total_delta: totalDelta,
      ocr_raw_text: parsed.lines.map((l) => l.rawText).join('\n'),
      ocr_confidence: null,
    })
    .select('id')
    .single();

  if (scanErr || !scanRow) {
    return errorResponse(`Failed to save receipt scan: ${scanErr?.message ?? 'unknown error'}`, 500);
  }

  const receiptScanId = scanRow.id as string;

  const itemRows = [
    ...matched.map(({ line, item, score }) => {
      const calculatedPrice = round2(item.unitPrice * item.quantity);
      return {
        receipt_scan_id: receiptScanId,
        product_id: item.productId,
        receipt_line_raw_text: line.rawText,
        receipt_line_price: line.price,
        calculated_price: calculatedPrice,
        price_delta: line.price !== null ? round2(line.price - calculatedPrice) : null,
        price_source: item.priceSource ?? null,
        match_confidence: round2(score),
        match_method: 'fuzzy_auto',
      };
    }),
    ...unmatched.map((line) => ({
      receipt_scan_id: receiptScanId,
      product_id: null,
      receipt_line_raw_text: line.rawText,
      receipt_line_price: line.price,
      calculated_price: null,
      price_delta: null,
      price_source: null,
      match_confidence: null,
      match_method: 'unmatched',
    })),
  ];

  const { data: insertedItems, error: itemsErr } = await db
    .from('receipt_scan_items')
    .insert(itemRows)
    .select('id, product_id, receipt_line_raw_text, receipt_line_price, calculated_price, price_delta, match_method');

  if (itemsErr) {
    return errorResponse(`Failed to save receipt scan items: ${itemsErr.message}`, 500);
  }

  return jsonResponse({
    receiptScanId,
    storeNameGuess: parsed.storeNameGuess,
    totals: {
      calculatedSubtotal: calculatedTotal.subtotal,
      calculatedTax: calculatedTotal.tax,
      calculatedTotal: calculatedTotal.estimatedTotal,
      actualSubtotal,
      actualTax,
      actualTotal,
      totalDelta,
    },
    items: (insertedItems ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      productId: row.product_id,
      rawText: row.receipt_line_raw_text,
      receiptPrice: row.receipt_line_price,
      calculatedPrice: row.calculated_price,
      priceDelta: row.price_delta,
      matchMethod: row.match_method,
    })),
  });
}
