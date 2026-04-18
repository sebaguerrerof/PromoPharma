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
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/firebase/config';
import type {
  MailingProject,
  MailingBlockContent,
  DesignTemplate,
  DesignBlockType,
  Brand,
} from '@/types';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const COLLECTION = 'mailingProjects';

// ── Queries ─────────────────────────────────────────────

export async function getMailingProjects(tenantId: string): Promise<MailingProject[]> {
  const q = query(
    collection(db, COLLECTION),
    where('tenantId', '==', tenantId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MailingProject);
}

export async function getMailingProject(id: string): Promise<MailingProject | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MailingProject;
}

// ── Create from DesignTemplate ──────────────────────────

export async function createMailingProject(data: {
  name: string;
  subject: string;
  brandId: string;
  brandName: string;
  designTemplate: Pick<DesignTemplate, 'id' | 'name' | 'layout'>;
  style: MailingProject['style'];
  tenantId: string;
  createdBy: string;
}): Promise<string> {
  const blocks: MailingBlockContent[] = data.designTemplate.layout.blocks.map((b) => ({
    id: b.id,
    type: b.type,
    content: b.defaultContent ?? '',
    style: b.style,
  }));

  const ref = await addDoc(collection(db, COLLECTION), {
    name: data.name,
    subject: data.subject,
    brandId: data.brandId,
    brandName: data.brandName,
    designTemplateId: data.designTemplate.id,
    designTemplateName: data.designTemplate.name,
    blocks,
    layout: data.designTemplate.layout,
    style: data.style,
    status: 'ready',
    tenantId: data.tenantId,
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Create from AI-generated blocks (no design template) ──

export async function createMailingProjectFromBlocks(data: {
  name: string;
  subject: string;
  brandId: string;
  brandName: string;
  blocks: MailingBlockContent[];
  style: MailingProject['style'];
  emailSettings?: MailingProject['emailSettings'];
  tenantId: string;
  createdBy: string;
}): Promise<string> {
  const layout = {
    width: data.emailSettings?.containerWidth ?? 600,
    height: 800,
    blocks: data.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      defaultContent: b.content,
      style: b.style,
    })),
  };

  const ref = await addDoc(collection(db, COLLECTION), {
    name: data.name,
    subject: data.subject,
    brandId: data.brandId,
    brandName: data.brandName,
    designTemplateId: 'ai-generated',
    designTemplateName: 'Generado con IA',
    blocks: data.blocks,
    layout,
    style: data.style,
    emailSettings: data.emailSettings ?? {},
    status: 'ready',
    tenantId: data.tenantId,
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Mutations ───────────────────────────────────────────

export async function updateMailingBlocks(
  id: string,
  blocks: MailingBlockContent[],
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    blocks,
    updatedAt: serverTimestamp(),
  });
}

export async function updateMailingProject(
  id: string,
  data: Partial<Pick<MailingProject, 'name' | 'subject' | 'status' | 'blocks' | 'style'>>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMailingProject(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ── Export HTML ─────────────────────────────────────────

export async function generateMailingHTML(project: MailingProject): Promise<string> {
  const React = await import('react');
  const { render } = await import('@react-email/render');
  const { MailingEmail } = await import('@/emails/MailingEmail');

  const element = React.createElement(MailingEmail, {
    subject: project.subject,
    previewText: project.emailSettings?.preheaderText || project.subject,
    blocks: project.blocks,
    layout: project.layout,
    style: project.style,
    emailSettings: project.emailSettings,
  });

  const html = await render(element);
  return html;
}

// ── AI Copy Suggestions ─────────────────────────────────

export interface CopySuggestion {
  text: string;
  tone: string;
}

/**
 * Sugiere 3 variantes de copy para un bloque de email usando Gemini.
 * Recibe contexto de marca (claims, insights) + tipo de bloque + asunto del email.
 */
export async function suggestBlockCopy(opts: {
  blockType: DesignBlockType;
  currentContent: string;
  subject: string;
  brand: Pick<Brand, 'name' | 'params'>;
  otherBlockContents: string[];
  claims?: string[];
  insights?: string[];
  /** Whether this text block is styled as a title */
  isTitle?: boolean;
}): Promise<CopySuggestion[]> {
  const { blockType, currentContent, subject, brand, otherBlockContents, claims, insights, isTitle } = opts;

  const blockDescriptions: Partial<Record<DesignBlockType, string>> = {
    text: isTitle
      ? 'un título corto y contundente de MÁXIMO 3 PALABRAS (NO más de 3 palabras bajo ninguna circunstancia)'
      : 'un párrafo de texto para el cuerpo del email (40-80 palabras, claro y directo)',
    bullets: 'una lista de 3-5 puntos clave (un punto por línea, sin viñetas, cada punto máximo 12 palabras)',
    cta: 'un texto de llamada a la acción para un botón (2-4 palabras, verbo imperativo)',
    header: 'un título de encabezado de MÁXIMO 3 PALABRAS (NO más de 3 palabras)',
    hero: 'un título impactante de MÁXIMO 4 PALABRAS para la sección hero',
    footer: 'un texto de pie de email (disclaimer + contacto, 1-2 líneas cortas)',
    quote: 'una cita profesional médica/científica (1-2 oraciones, máximo 25 palabras)',
  };

  const blockDesc = blockDescriptions[blockType] ?? 'contenido para un bloque de email';

  const contextParts: string[] = [
    `Marca: ${brand.name}`,
  ];
  if (subject) contextParts.push(`Asunto del email: "${subject}"`);
  if (claims?.length) contextParts.push(`Claims aprobados de la marca:\n${claims.map((c) => `- ${c}`).join('\n')}`);
  if (insights?.length) contextParts.push(`Insights científicos validados:\n${insights.map((i) => `- ${i}`).join('\n')}`);
  if (otherBlockContents.length) {
    contextParts.push(`Contenido ya escrito en otros bloques (NO repetir):\n${otherBlockContents.map((c) => `- ${c.slice(0, 100)}`).join('\n')}`);
  }
  if (currentContent) contextParts.push(`Contenido actual del bloque (mejorar o inspirarse):\n"${currentContent}"`);

  // Length constraints per type
  const lengthRules: string[] = [];
  if (blockType === 'header' || (blockType === 'text' && isTitle) || blockType === 'hero') {
    lengthRules.push('6. MÁXIMO 3-4 PALABRAS por variante. Si tiene más de 4 palabras, es INCORRECTO. Sé breve y contundente.');
  }
  if (blockType === 'bullets') {
    lengthRules.push('6. Un punto por línea, sin viñetas ni guiones al inicio. Cada punto máximo 12 palabras.');
  }
  if (blockType === 'cta') {
    lengthRules.push('6. Máximo 4 palabras, verbo imperativo. Ejemplos: "Descubrir más", "Ver estudio", "Solicitar muestra".');
  }
  if (blockType === 'text' && !isTitle) {
    lengthRules.push('6. Entre 40 y 80 palabras. Párrafo conciso, profesional, sin relleno.');
  }

  const prompt = `Eres un redactor experto en marketing farmacéutico para emails profesionales.

CONTEXTO:
${contextParts.join('\n\n')}

TAREA:
Genera exactamente 3 variantes de ${blockDesc}.

REGLAS:
1. Usa SOLO información de los claims, insights y texto de referencia proporcionados. NO inventes datos médicos.
2. Tono profesional y científico pero accesible.
3. Cada variante debe tener un enfoque/tono distinto: (1) informativo, (2) persuasivo, (3) conciso.
4. Escribe en español.
5. NO repitas contenido de otros bloques.
${lengthRules.join('\n')}

FORMATO DE RESPUESTA (JSON estricto, sin markdown):
[
  { "text": "...", "tone": "informativo" },
  { "text": "...", "tone": "persuasivo" },
  { "text": "...", "tone": "conciso" }
]`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Extract JSON array from response (might be wrapped in ```json ... ```)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('La IA no devolvió un formato válido.');

  const parsed = JSON.parse(jsonMatch[0]) as CopySuggestion[];
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Respuesta vacía de la IA.');

  return parsed.slice(0, 3);
}
