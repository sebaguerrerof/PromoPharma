// src/services/brandTextBankService.ts
// ═══════════════════════════════════════════════════════════
// Responsabilidad única: CRUD de brandTextBank + extracción de textos
// + análisis de patrones + generación de Smart Prompt
// NO genera emails, NO maneja UI
// ═══════════════════════════════════════════════════════════

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/firebase/config';
import { getBrand } from '@/services/brandService';
import { getMolecule, getIndications } from '@/services/moleculeService';
import type {
  Brand,
  MailingBlockContent,
  BrandTextBankEntry,
  TextBankEmailType,
  TextBankSource,
} from '@/types';
import type { EmailType } from '@/services/aiMailingContext';

const COLLECTION = 'brandTextBank';
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

export async function createTextBankEntry(
  entry: Omit<BrandTextBankEntry, 'id' | 'createdAt'>,
): Promise<string> {
  // Strip undefined values recursively — Firestore rejects them
  const clean = JSON.parse(JSON.stringify(entry));
  const ref = await addDoc(collection(db, COLLECTION), {
    ...clean,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getBrandTextBank(
  brandId: string,
  tenantId: string,
  options?: { limit?: number; emailType?: TextBankEmailType },
): Promise<BrandTextBankEntry[]> {
  const constraints = [
    where('tenantId', '==', tenantId),
    where('brandId', '==', brandId),
    orderBy('createdAt', 'desc'),
  ];
  if (options?.emailType) {
    constraints.push(where('emailType', '==', options.emailType));
  }
  if (options?.limit) {
    constraints.push(firestoreLimit(options.limit));
  }
  const q = query(collection(db, COLLECTION), ...constraints);
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BrandTextBankEntry);
  } catch (err) {
    // Firestore composite index may not exist yet — degrade gracefully
    console.warn('[TextBank] Query failed (index may be building):', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// EXTRACCIÓN DE TEXTOS DESDE BLOQUES
// ═══════════════════════════════════════════════════════════

export function extractTextsFromBlocks(
  blocks: MailingBlockContent[],
): BrandTextBankEntry['texts'] {
  const texts: BrandTextBankEntry['texts'] = {
    titles: [],
    paragraphs: [],
    bulletPoints: [],
    ctaTexts: [],
    ctaLabels: [],
    heroTitles: [],
    heroSubtitles: [],
    quotes: [],
    footerText: undefined,
  };

  for (const block of blocks) {
    if (!block.content && block.type !== 'hero') continue;

    switch (block.type) {
      case 'text':
        if (block.style?.headingLevel || block.style?.fontWeight === 'bold') {
          if (block.content.trim()) texts.titles.push(block.content.trim());
        } else {
          if (block.content.trim()) texts.paragraphs.push(block.content.trim());
        }
        break;
      case 'hero':
        if (block.style?.heroTitle) texts.heroTitles.push(block.style.heroTitle);
        if (block.style?.heroSubtitle) texts.heroSubtitles.push(block.style.heroSubtitle);
        break;
      case 'bullets':
        texts.bulletPoints.push(
          ...block.content.split('\n').map((s) => s.trim()).filter(Boolean),
        );
        break;
      case 'cta':
        if (block.ctaText?.trim()) texts.ctaTexts.push(block.ctaText.trim());
        if (block.content.trim()) texts.ctaLabels.push(block.content.trim());
        break;
      case 'quote':
        if (block.content.trim()) texts.quotes.push(block.content.trim());
        break;
      case 'footer':
        if (block.content.trim()) texts.footerText = block.content.trim();
        break;
    }
  }

  return texts;
}

// ═══════════════════════════════════════════════════════════
// DETERMINAR SOURCE
// ═══════════════════════════════════════════════════════════

export function determineSource(
  isAIGenerated: boolean,
  originalAIBlocks: MailingBlockContent[] | null,
  currentBlocks: MailingBlockContent[],
): TextBankSource {
  if (!isAIGenerated) return 'manual';

  // Si no hay bloques originales para comparar, asumir que es AI puro
  if (!originalAIBlocks) return 'ai';

  // Comparar contenido de los bloques
  const hasEdits = currentBlocks.some((current) => {
    const original = originalAIBlocks.find((o) => o.id === current.id);
    if (!original) return true; // bloque nuevo → editado
    return (
      current.content !== original.content ||
      current.ctaText !== original.ctaText ||
      current.imageUrl !== original.imageUrl ||
      JSON.stringify(current.style) !== JSON.stringify(original.style)
    );
  });

  // También verificar si se eliminaron bloques
  const hasDeleted = originalAIBlocks.some(
    (o) => !currentBlocks.find((c) => c.id === o.id),
  );

  return hasEdits || hasDeleted ? 'ai_edited' : 'ai';
}

// ═══════════════════════════════════════════════════════════
// ANÁLISIS DE PATRONES PARA CONTEXTO AI
// ═══════════════════════════════════════════════════════════

export interface TextBankSummary {
  totalEmails: number;
  byType: Record<string, number>;
  recentSubjects: string[];
  recentTitles: string[];
  recentParagraphs: string[];
  recentBulletPoints: string[];
  recentCTAs: string[];
  recentHeroTitles: string[];
  preferredTone?: string;
  avgSubjectLength: number;
  commonBlockSequences: string[];
  summary: string;
}

export function buildTextBankSummary(
  entries: BrandTextBankEntry[],
): TextBankSummary {
  if (entries.length === 0) {
    return {
      totalEmails: 0,
      byType: {},
      recentSubjects: [],
      recentTitles: [],
      recentParagraphs: [],
      recentBulletPoints: [],
      recentCTAs: [],
      recentHeroTitles: [],
      avgSubjectLength: 0,
      commonBlockSequences: [],
      summary: '',
    };
  }

  // Conteo por tipo
  const byType: Record<string, number> = {};
  for (const e of entries) {
    byType[e.emailType] = (byType[e.emailType] || 0) + 1;
  }

  // Extraer textos recientes
  const recentSubjects = entries.slice(0, 10).map((e) => e.subject).filter(Boolean);
  const recentTitles = entries.flatMap((e) => e.texts.titles).slice(0, 15);
  const recentParagraphs = entries
    .flatMap((e) => e.texts.paragraphs)
    .map((p) => (p.length > 100 ? p.slice(0, 100) + '…' : p))
    .slice(0, 10);
  const recentBulletPoints = entries.flatMap((e) => e.texts.bulletPoints).slice(0, 15);
  const recentCTAs = entries.flatMap((e) => e.texts.ctaTexts).slice(0, 10);
  const recentHeroTitles = entries.flatMap((e) => e.texts.heroTitles).slice(0, 5);

  // Tono preferido (de entries con aiContext)
  const tones = entries
    .filter((e) => e.aiContext?.tone)
    .map((e) => e.aiContext!.tone!);
  const preferredTone = mode(tones);

  // Largo promedio de subjects
  const subjectsWithLength = recentSubjects.filter((s) => s.length > 0);
  const avgSubjectLength = subjectsWithLength.length > 0
    ? Math.round(subjectsWithLength.reduce((sum, s) => sum + s.length, 0) / subjectsWithLength.length)
    : 0;

  // Secuencias de bloques comunes
  const sequences = entries.map((e) => e.blockSequence.join('→'));
  const commonBlockSequences = [...new Set(sequences)].slice(0, 3);

  // Resumen textual
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const summary = [
    `La marca ha producido ${entries.length} emails.`,
    topType ? `El tipo más frecuente es "${topType[0]}" (${topType[1]} emails).` : '',
    preferredTone ? `El tono habitual es ${preferredTone}.` : '',
    avgSubjectLength > 0 ? `Largo promedio de subjects: ${avgSubjectLength} caracteres.` : '',
    recentCTAs.length > 0 ? `CTAs típicos: "${recentCTAs.slice(0, 3).join('", "')}"` : '',
  ].filter(Boolean).join(' ');

  return {
    totalEmails: entries.length,
    byType,
    recentSubjects,
    recentTitles,
    recentParagraphs,
    recentBulletPoints,
    recentCTAs,
    recentHeroTitles,
    preferredTone,
    avgSubjectLength,
    commonBlockSequences,
    summary,
  };
}

// ═══════════════════════════════════════════════════════════
// SMART PROMPT — Genera brief inteligente basado en el banco
// ═══════════════════════════════════════════════════════════

export async function generateSmartPrompt(
  brand: Brand,
  tenantId: string,
  emailType?: EmailType,
  currentText?: string,
): Promise<string> {
  // 1. Obtener banco de textos + datos de marca
  const [entries, molecule, indications] = await Promise.all([
    getBrandTextBank(brand.id, tenantId, { limit: 15 }),
    getMolecule(brand.moleculeId),
    getIndications(brand.moleculeId),
  ]);

  const moleculeName = molecule?.name ?? '';
  const indicationNames = indications.map((i) => i.name);
  const claims = (brand.params.claims || []).map((c) => c.text).slice(0, 5);

  // 2. Construir sección del banco de textos
  let bankSection = '';
  if (entries.length > 0) {
    const summary = buildTextBankSummary(entries);

    // Agrupar por tipo
    const byTypeEntries = new Map<string, BrandTextBankEntry[]>();
    for (const e of entries) {
      const list = byTypeEntries.get(e.emailType) || [];
      list.push(e);
      byTypeEntries.set(e.emailType, list);
    }

    const typeDetails = Array.from(byTypeEntries.entries())
      .map(([type, items]) => {
        const subjects = items.map((i) => `"${i.subject}"`).slice(0, 3).join(', ');
        const titles = items.flatMap((i) => i.texts.titles).slice(0, 3);
        const ctas = items.flatMap((i) => i.texts.ctaTexts).slice(0, 3);
        return [
          `Tipo: ${type} (${items.length} emails)`,
          subjects ? `  - Subjects: ${subjects}` : '',
          titles.length > 0 ? `  - Títulos: ${titles.map((t) => `"${t}"`).join(', ')}` : '',
          ctas.length > 0 ? `  - CTAs: ${ctas.map((c) => `"${c}"`).join(', ')}` : '',
        ].filter(Boolean).join('\n');
      })
      .join('\n\n');

    bankSection = `
BANCO DE TEXTOS DE ESTA MARCA (${summary.totalEmails} emails anteriores):
${typeDetails}

PATRONES DETECTADOS:
${summary.summary}`;
  }

  // 3. Construir el prompt para Gemini
  const expandOrGenerate = currentText?.trim()
    ? `El usuario ya escribió esto: "${currentText.trim()}"
Mejóralo y expándelo manteniendo el estilo de la marca.`
    : `Genera un prompt de email que sea coherente con el estilo y temas habituales de esta marca.${
        emailType ? ` Debe ser de tipo "${emailType}".` : ''
      }
Sugiere algo nuevo que no se haya hecho antes.`;

  const systemPrompt = `Eres un asistente que ayuda a redactar briefs para emails farmacéuticos.

MARCA: ${brand.name}
MOLÉCULA: ${moleculeName}
INDICACIONES: ${indicationNames.join(', ') || 'No definidas'}
CLAIMS DISPONIBLES: ${claims.length > 0 ? claims.join(' | ') : 'Sin claims'}
${bankSection}

${expandOrGenerate}

REGLAS:
- Máximo 2-3 oraciones
- Ser específico (mencionar molécula, indicación, datos concretos)
- Incluir contexto de audiencia (ej: "dirigido a cardiólogos")
- Mantener el tono habitual de la marca
- Sugerir algo que complemente los emails ya existentes
- NO repetir un email que ya se hizo
- Usar lenguaje natural, como lo escribiría un product manager

Devuelve SOLO el texto del prompt, sin comillas ni prefijos.`;

  // 4. Llamar a Gemini
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const result = await Promise.race([
    model.generateContent(currentText?.trim() || 'Genera un prompt de email para esta marca'),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout generating smart prompt')), 15000),
    ),
  ]);

  const text = result.response.text().trim();
  // Limpiar comillas envolventes si las hay
  return text.replace(/^["']|["']$/g, '');
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Retorna el valor más frecuente de un array, o undefined si está vacío */
function mode(arr: string[]): string | undefined {
  if (arr.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
