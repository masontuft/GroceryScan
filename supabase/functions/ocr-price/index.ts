import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

// GS1 UPC-A check digit from 11-digit string (odd positions ×3, even ×1).
function upcCheckDigit(d11: string): number {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(d11[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

// Normalize OCR'd characters that are commonly misread as digits, so a noisy
// shelf-label read still yields clean digit groups.
function normalizeOcrDigits(s: string): string {
  return s
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8');
}

// Build a 12-digit UPC-A from two 5-digit groups (company prefix + item ref).
function buildUpcFromGroups(g1: string, g2: string): string {
  const d11 = '0' + g1 + g2;               // 11 digits: leading 0 + company(5) + item(5)
  return d11 + String(upcCheckDigit(d11)); // append check digit → 12-digit UPC-A
}

// Parse shelf-label "G NNNNN-NNNNN" (Winco/grocery) into a 12-digit UPC-A.
// "G" marks a grocery item; the two 5-digit groups are company prefix + item ref.
// Tolerant of OCR noise: variable separators (-, –, space, or none), and digits
// misread as letters (O→0, l/I→1, S→5, B→8).
function extractUpcFromLabel(text: string): string | null {
  // Inspect each line; the G-code lives on its own line on grocery shelf tags.
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    // Only consider lines that carry a "G" grocery marker.
    if (!/\bG\b/i.test(line)) continue;
    const norm = normalizeOcrDigits(line);
    // After normalization, find two 5-digit groups separated by anything (or nothing).
    const m = norm.match(/(\d{5})\D{0,3}(\d{5})/);
    if (m) return buildUpcFromGroups(m[1], m[2]);
  }

  // Fallback: scan the whole (normalized) text for a 5+5 digit pair.
  const norm = normalizeOcrDigits(text);
  const m = norm.match(/(\d{5})\D{0,3}(\d{5})/);
  if (m) return buildUpcFromGroups(m[1], m[2]);

  return null;
}

// Extract the most likely grocery shelf price from a Vision API text block.
function extractPrice(text: string): number | null {
  const matches = [...text.matchAll(/\$?\s*(\d{1,3})[\s.](\d{2})\b/g)];
  if (matches.length === 0) return null;

  const candidates = matches
    .map((m) => parseFloat(`${m[1]}.${m[2]}`))
    .filter((v) => v >= 0.10 && v <= 999.99);

  if (candidates.length === 0) return null;

  const freq = new Map<number, number>();
  for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
  const maxFreq = Math.max(...freq.values());
  const mostCommon = [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v);
  return Math.min(...mostCommon);
}

// Extract a likely product name from price tag text.
// Price tags typically read: product name → size/weight → price → UPC/PLU.
// We filter out lines that look like prices, weights, barcodes, or store codes.
function extractProductName(text: string): string | null {
  const PRICE_RE = /^\$?\s*\d{1,3}[.\s]\d{2}$/;
  const WEIGHT_RE = /^\d+(\.\d+)?\s*(oz|lb|kg|g|ml|l|fl oz|ct|pk|count|pack)\b/i;
  const BARCODE_RE = /^\d{6,}$/;
  const PLU_RE = /^(PLU|UPC|SKU|#)\s*\d+/i;
  const SHORT_RE = /^.{1,2}$/; // single chars or 2-char codes

  const candidates = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) =>
      l.length > 0 &&
      !PRICE_RE.test(l) &&
      !WEIGHT_RE.test(l) &&
      !BARCODE_RE.test(l) &&
      !PLU_RE.test(l) &&
      !SHORT_RE.test(l)
    );

  if (candidates.length === 0) return null;

  // Take up to the first two non-price lines and join — covers "Brand\nProduct Name" layouts
  return candidates.slice(0, 2).join(' ').slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { imageBase64 } = body;
  if (!imageBase64) return errorResponse('imageBase64 is required');

  const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!apiKey) return errorResponse('GOOGLE_VISION_API_KEY not configured', 500);

  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );

    if (!visionRes.ok) {
      const err = await visionRes.text();
      console.error(`Vision API ${visionRes.status}: ${err}`);
      return errorResponse('Vision API error', 502);
    }

    const visionJson = await visionRes.json() as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        error?: { message?: string };
      }>;
    };

    const response = visionJson.responses?.[0];
    if (response?.error) {
      return errorResponse(response.error.message ?? 'Vision error', 502);
    }

    const rawText = response?.fullTextAnnotation?.text ?? '';
    const price = extractPrice(rawText);
    const productName = extractProductName(rawText);
    const extractedUpc = extractUpcFromLabel(rawText);

    return jsonResponse({ price, productName, rawText, extractedUpc });
  } catch (err) {
    console.error('ocr-price error:', err);
    return errorResponse('Internal error', 500);
  }
});
