// Tipo de cambio de referencia del BCE (EUR→USD) vía Frankfurter, proveedor
// fijado en ECB. Forma medida: [{ date, base, quote, rate }] (documentada en
// @leewinder/mcp-tcgdex 1.0.0, lib/fx). Sin respuesta válida no se inventa
// un tipo: la app usa el tipo manual de Ajustes o deja Cardmarket sin valorar.

import type { FxRate } from '../domain/types';

export const ECB_EUR_USD_URL = 'https://api.frankfurter.dev/v2/providers/ecb/rates?base=EUR&quotes=USD';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchEcbEurUsd(fetchImpl: FetchLike = fetch as FetchLike): Promise<FxRate | null> {
  try {
    const res = await fetchImpl(ECB_EUR_USD_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return null;
    const hit = body.find(
      (e) =>
        e && typeof e === 'object' &&
        String((e as Record<string, unknown>).base).toUpperCase() === 'EUR' &&
        String((e as Record<string, unknown>).quote).toUpperCase() === 'USD',
    ) as { date?: unknown; rate?: unknown } | undefined;
    if (!hit || typeof hit.rate !== 'number' || !(hit.rate > 0) || typeof hit.date !== 'string') return null;
    const rateDate = hit.date.slice(0, 10);
    return { id: `${rateDate}|EUR|USD`, rateDate, base: 'EUR', quote: 'USD', rate: hit.rate, source: 'BCE vía Frankfurter' };
  } catch {
    return null;
  }
}
