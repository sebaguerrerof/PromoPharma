import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Insight, InsightStatus, InsightCategory, InsightReference, ScientificDocument } from '../types';

const INSIGHTS = 'insights';

// ── Queries ─────────────────────────────────────────────

export async function getInsights(indicationId: string): Promise<Insight[]> {
  const q = query(
    collection(db, INSIGHTS),
    where('indicationId', '==', indicationId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Insight)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getInsightsByStatus(
  indicationId: string,
  status: InsightStatus
): Promise<Insight[]> {
  const q = query(
    collection(db, INSIGHTS),
    where('indicationId', '==', indicationId),
    where('status', '==', status)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Insight)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

// ── Create (manual o por IA) ────────────────────────────

export async function createInsight(data: {
  indicationId: string;
  moleculeId: string;
  tenantId: string;
  text: string;
  category: InsightCategory;
  references: InsightReference[];
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, INSIGHTS), {
    ...data,
    status: 'pending' as InsightStatus,
    validatedBy: null,
    validatedAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Validación (V1) ─────────────────────────────────────

export async function approveInsight(
  id: string,
  validatedBy: string
): Promise<void> {
  await updateDoc(doc(db, INSIGHTS, id), {
    status: 'approved' as InsightStatus,
    validatedBy,
    validatedAt: serverTimestamp(),
  });
}

export async function rejectInsight(
  id: string,
  validatedBy: string
): Promise<void> {
  await updateDoc(doc(db, INSIGHTS, id), {
    status: 'rejected' as InsightStatus,
    validatedBy,
    validatedAt: serverTimestamp(),
  });
}

export async function updateInsightText(
  id: string,
  text: string
): Promise<void> {
  await updateDoc(doc(db, INSIGHTS, id), { text });
}

export async function updateInsightCategory(
  id: string,
  category: InsightCategory
): Promise<void> {
  await updateDoc(doc(db, INSIGHTS, id), { category });
}

// ── Delete ──────────────────────────────────────────────

export async function deleteInsight(id: string): Promise<void> {
  await deleteDoc(doc(db, INSIGHTS, id));
}

// ── Extracción automática de insights de PDFs con IA ────

export interface ExtractedInsight {
  text: string;
  category: InsightCategory;
  page?: number;
  section?: string;
  quote?: string;
}

/**
 * Usa Gemini 2.5 Flash para analizar un PDF y extraer insights automáticamente.
 * Descarga el PDF, lo envía como inlineData a Gemini, y parsea la respuesta.
 * Retorna los insights extraídos SIN guardarlos en Firestore (para revisión previa).
 */
export async function extractInsightsFromPDF(
  document: ScientificDocument,
): Promise<ExtractedInsight[]> {
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Descargar el PDF como base64
  const response = await fetch(document.downloadUrl);
  if (!response.ok) throw new Error(`Error descargando PDF: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const prompt = `Eres un experto en análisis de documentos científicos farmacéuticos. Analiza el documento PDF adjunto y extrae TODOS los datos relevantes que puedan usarse como claims o insights de marketing farmacéutico.

CATEGORÍAS DISPONIBLES:
- "benefit" — Beneficios terapéuticos, eficacia, resultados positivos
- "primary_use" — Indicaciones aprobadas, uso principal del fármaco
- "key_message" — Mensajes clave, datos de seguridad, perfiles farmacocinéticos
- "contraindication" — Contraindicaciones, advertencias, efectos adversos relevantes
- "other" — Otros datos relevantes (dosificación, posología, interacciones)

INSTRUCCIONES:
- Extrae datos CONCRETOS con números, porcentajes y valores p cuando estén disponibles
- Incluye la página donde se encuentra el dato
- Incluye la sección del documento (ej: "Resultados", "Conclusiones", "Seguridad")
- Incluye una cita textual breve del documento que respalde el dato
- NO inventes datos. Solo extrae lo que está explícitamente en el documento
- Extrae entre 5 y 20 insights relevantes
- Escribe cada insight en español, de forma clara y concisa

RESPONDE SOLO con un bloque JSON con este formato exacto:
\`\`\`json
[
  {
    "text": "Texto del insight en español (máx 200 chars)",
    "category": "benefit|primary_use|key_message|contraindication|other",
    "page": 5,
    "section": "Resultados",
    "quote": "Cita textual breve del documento original"
  }
]
\`\`\``;

  const timeoutMs = 120_000; // PDFs grandes pueden tardar
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: la extracción tardó demasiado.')), timeoutMs)
  );

  const result = await Promise.race([
    model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: document.mimeType || 'application/pdf',
              data: base64,
            },
          },
          { text: prompt },
        ],
      }],
    }),
    timeoutPromise,
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no devolvió resultados.');

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No se pudo interpretar la respuesta de la IA.');

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedInsight[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('No se encontraron insights en el documento.');
  }

  // Validar categorías
  const validCategories: InsightCategory[] = ['benefit', 'primary_use', 'key_message', 'contraindication', 'other'];
  return parsed
    .filter(i => i.text && validCategories.includes(i.category))
    .map(i => ({
      text: i.text.slice(0, 500),
      category: i.category,
      page: i.page ?? undefined,
      section: i.section ?? undefined,
      quote: i.quote ?? undefined,
    }));
}

/**
 * Guarda múltiples insights extraídos en Firestore (batch).
 * Todos se crean con status 'pending'.
 */
export async function saveExtractedInsights(
  insightsData: ExtractedInsight[],
  document: ScientificDocument,
  createdBy: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const insight of insightsData) {
    const references: InsightReference[] = [{
      documentId: document.id,
      documentName: document.fileName,
      page: insight.page ?? null,
      section: insight.section ?? '',
      quote: insight.quote ?? '',
    }];

    const ref = await addDoc(collection(db, INSIGHTS), {
      indicationId: document.indicationId,
      moleculeId: document.moleculeId,
      tenantId: document.tenantId,
      text: insight.text,
      category: insight.category,
      references,
      status: 'pending' as InsightStatus,
      validatedBy: null,
      validatedAt: null,
      createdBy,
      createdAt: serverTimestamp(),
    });
    ids.push(ref.id);
  }
  return ids;
}

/**
 * Aprueba o rechaza múltiples insights de una vez.
 */
export async function batchUpdateInsightStatus(
  insightIds: string[],
  status: 'approved' | 'rejected',
  validatedBy: string,
): Promise<void> {
  await Promise.all(
    insightIds.map(id =>
      updateDoc(doc(db, INSIGHTS, id), {
        status: status as InsightStatus,
        validatedBy,
        validatedAt: serverTimestamp(),
      })
    )
  );
}
