// src/services/stockImageService.ts
// ═══════════════════════════════════════════════════════════
// Servicio de imágenes stock gratuitas vía Pexels API
// Se usa para hero images e image blocks en mailings generados con AI
// ═══════════════════════════════════════════════════════════

const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;
const PEXELS_BASE = 'https://api.pexels.com/v1';

export interface StockPhoto {
  id: number;
  url: string;        // link a la foto en Pexels
  photographer: string;
  src: {
    original: string;
    large2x: string;  // 940px wide
    large: string;    // 940px wide
    medium: string;   // 350px wide
    small: string;    // 130px wide
    landscape: string; // 627x400 crop
  };
  alt: string;
}

/**
 * Busca fotos stock relevantes en Pexels.
 * Retorna la URL de la primera imagen encontrada (landscape, 627x400).
 * Si falla, retorna undefined (degradación suave).
 */
export async function searchStockImage(
  query: string,
  options?: { orientation?: 'landscape' | 'portrait' | 'square'; perPage?: number },
): Promise<string | undefined> {
  if (!PEXELS_API_KEY) {
    console.warn('[StockImage] VITE_PEXELS_API_KEY no configurada');
    return undefined;
  }

  try {
    const params = new URLSearchParams({
      query,
      per_page: String(options?.perPage ?? 5),
      orientation: options?.orientation ?? 'landscape',
    });

    const res = await fetch(`${PEXELS_BASE}/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!res.ok) {
      console.warn(`[StockImage] Pexels API error ${res.status}`);
      return undefined;
    }

    const data = await res.json();
    const photos = data.photos as StockPhoto[] | undefined;

    if (!photos || photos.length === 0) return undefined;

    // Elegir una foto aleatoria de las primeras 5 para variedad
    const pick = photos[Math.floor(Math.random() * photos.length)];
    return pick.src.landscape; // 627x400 — ideal para emails
  } catch (err) {
    console.warn('[StockImage] Error fetching:', err);
    return undefined;
  }
}

/**
 * Busca múltiples fotos stock para llenar varios bloques de imagen.
 * Retorna un array de URLs.
 */
export async function searchStockImages(
  query: string,
  count: number = 3,
): Promise<string[]> {
  if (!PEXELS_API_KEY) return [];

  try {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count * 2, 15)), // pedir más para variedad
      orientation: 'landscape',
    });

    const res = await fetch(`${PEXELS_BASE}/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const photos = data.photos as StockPhoto[] | undefined;
    if (!photos) return [];

    // Shuffle y tomar las primeras `count`
    const shuffled = photos.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((p) => p.src.landscape);
  } catch {
    return [];
  }
}

/**
 * Construye un query de búsqueda para Pexels basándose en el contexto del email.
 * Traduce el contexto farmacéutico a términos de búsqueda de fotos stock.
 */
export function buildStockImageQuery(
  context: {
    userPrompt: string;
    moleculeName?: string;
    indicationNames?: string[];
    emailType?: string;
  },
): string {
  // Mapeo de indicaciones médicas a términos visuales de stock
  const indicationKeywords: Record<string, string> = {
    'dolor': 'pain relief health',
    'diabetes': 'diabetes healthcare',
    'hipertensión': 'heart health medical',
    'cardiovascular': 'heart cardiology',
    'oncología': 'medical research laboratory',
    'gastro': 'digestive health medical',
    'dermatología': 'skin care dermatology',
    'neurología': 'brain neuroscience',
    'respiratorio': 'lungs respiratory health',
    'inmunología': 'immune system medical',
    'pediatría': 'pediatric children healthcare',
    'oftalmología': 'eye care ophthalmology',
    'reumatología': 'joints rheumatology',
    'endocrinología': 'endocrine hormones medical',
  };

  const parts: string[] = ['medical pharmaceutical'];

  // Buscar keywords de indicaciones
  if (context.indicationNames) {
    for (const ind of context.indicationNames) {
      const lower = ind.toLowerCase();
      for (const [key, value] of Object.entries(indicationKeywords)) {
        if (lower.includes(key)) {
          parts.push(value);
          break;
        }
      }
    }
  }

  // Palabras comunes a filtrar (español + inglés)
  const stopWords = new Set([
    'para', 'sobre', 'este', 'esta', 'como', 'email', 'mailing', 'crear', 'generar',
    'con', 'del', 'los', 'las', 'una', 'que', 'por', 'más', 'ser', 'sus', 'han',
    'tiene', 'puede', 'son', 'desde', 'entre', 'pero', 'cada', 'también', 'hacia',
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'has', 'been',
  ]);

  // Agregar contexto del prompt del usuario (primeras 5 palabras relevantes)
  const promptWords = context.userPrompt
    .toLowerCase()
    .replace(/[^\w\sáéíóúñ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
  if (promptWords.length > 0) {
    parts.push(promptWords.join(' '));
  }

  // Tipo de email → contexto visual
  const typeKeywords: Record<string, string> = {
    'promocional': 'healthcare professional',
    'informativo': 'medical research',
    'newsletter': 'health news',
    'invitación': 'medical conference event',
    'científico': 'laboratory science research',
    'aviso_breve': 'medical alert',
  };
  if (context.emailType && typeKeywords[context.emailType]) {
    parts.push(typeKeywords[context.emailType]);
  }

  // Limitar largo total del query
  return parts.join(' ').slice(0, 100);
}

/**
 * Verifica si Pexels está disponible
 */
export function isPexelsAvailable(): boolean {
  return !!PEXELS_API_KEY;
}
