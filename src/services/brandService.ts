import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../firebase/config';
import type { Brand, BrandParams } from '../types';

const BRANDS = 'brands';
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export async function getBrands(tenantId: string): Promise<Brand[]> {
  const q = query(
    collection(db, BRANDS),
    where('tenantId', '==', tenantId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Brand)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getBrand(id: string): Promise<Brand | null> {
  const snap = await getDoc(doc(db, BRANDS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Brand;
}

export async function createBrand(
  data: Pick<Brand, 'name' | 'moleculeId' | 'tenantId' | 'createdBy'> & {
    params: BrandParams;
  }
): Promise<string> {
  const ref = await addDoc(collection(db, BRANDS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBrand(
  id: string,
  data: Partial<Pick<Brand, 'name' | 'moleculeId'> & { params: Partial<BrandParams> }>
): Promise<void> {
  await updateDoc(doc(db, BRANDS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBrand(id: string): Promise<void> {
  await deleteDoc(doc(db, BRANDS, id));
}

// ── Auto Brand DNA from URL ─────────────────────────────

export interface BrandDNAResult {
  colorPrimary: string;
  colorSecondary: string;
  fontTitle: string;
  fontBody: string;
  tone: string;
  disclaimerBadge: string;
}

/**
 * Extrae identidad de marca (colores, tipografías, tono) desde una URL
 * usando un proxy CORS y análisis con Gemini.
 */
export async function extractBrandDNA(url: string): Promise<BrandDNAResult> {
  // Fetch HTML via proxy CORS público
  let html = '';
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    throw new Error(
      'No se pudo acceder al sitio web. Verifica la URL o intenta con otra página del producto.'
    );
  }

  // Limpiar HTML — remover scripts, styles inline largos y mantener solo estructura + estilos relevantes
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[SVG]')
    .substring(0, 30000); // Limitar tamaño para Gemini

  const prompt = `Eres un experto en diseño de marca y branding farmacéutico.
Analiza el siguiente HTML de un sitio web de producto farmacéutico y extrae la identidad visual de la marca.

HTML del sitio:
\`\`\`html
${cleanHtml}
\`\`\`

Extrae la siguiente información y responde SOLO con un JSON:
{
  "colorPrimary": "#XXXXXX",     // Color primario dominante (hex)
  "colorSecondary": "#XXXXXX",   // Color secundario/acento (hex)
  "fontTitle": "Font Name",       // Tipografía para títulos (nombre de Google Font más cercana)
  "fontBody": "Font Name",        // Tipografía para cuerpo (nombre de Google Font más cercana)
  "tone": "Descripción breve del tono de comunicación",
  "disclaimerBadge": "Texto del disclaimer farmacéutico si existe"
}

REGLAS:
- Los colores deben ser códigos hex válidos de 6 dígitos
- Las tipografías deben ser nombres de Google Fonts reales (ej: "Roboto", "Open Sans", "Montserrat")
- Si no detectas una tipografía específica, sugiere la Google Font más similar al estilo visual
- El tono debe ser conciso (ej: "Profesional, cálido y empático")
- Si no hay disclaimer, usa "Material exclusivo para profesionales de la salud"
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No se pudo interpretar la respuesta de la IA.');

  const parsed = JSON.parse(jsonMatch[0]) as BrandDNAResult;

  // Validar que los colores sean hex válidos
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  if (!hexPattern.test(parsed.colorPrimary)) parsed.colorPrimary = '#1a56db';
  if (!hexPattern.test(parsed.colorSecondary)) parsed.colorSecondary = '#6b7280';

  return parsed;
}
