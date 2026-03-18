import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Template, TemplateSlot } from '@/types';

const TEMPLATES = 'templates';

// ── Expand template slots for multi-page ────────────────

/**
 * For PDF templates (like folleto-2p), dynamically expand the slot list
 * to include content slots for every page beyond those already defined.
 * The base folleto has 2 pages of content; if the user sets 6 pages,
 * this adds body + image + callout slots for pages 3-6.
 */
export function expandTemplateForPages(
  template: Template,
  pageCount: number,
): Template {
  if (template.format !== 'pdf' || pageCount <= 0) return template;

  // Detect highest page number already present in slot ids (cuerpo_N pattern)
  const existingPageNums = template.slots
    .map(s => s.id.match(/^cuerpo_(\d+)$/))
    .filter(Boolean)
    .map(m => parseInt(m![1]));
  const basePages = existingPageNums.length > 0 ? Math.max(...existingPageNums) : 1;

  if (pageCount <= basePages) return template;

  const extraSlots: TemplateSlot[] = [];

  for (let p = basePages + 1; p <= pageCount; p++) {
    extraSlots.push({
      id: `cuerpo_${p}`,
      name: `Cuerpo página ${p}`,
      type: 'body',
      maxLength: 400,
      required: false,
    });
    extraSlots.push({
      id: `imagen_pag_${p}`,
      name: `Imagen página ${p}`,
      type: 'image',
      maxLength: 0,
      required: false,
      imagePromptHint: 'Professional pharmaceutical illustration for brochure page, clean modern medical style',
    });
    extraSlots.push({
      id: `bullets_pag_${p}`,
      name: `Puntos clave página ${p}`,
      type: 'bullets',
      maxLength: 300,
      maxItems: 4,
      maxItemLength: 70,
      required: false,
    });
  }

  return { ...template, slots: [...template.slots, ...extraSlots] };
}

// ── Queries ─────────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  const q = query(collection(db, TEMPLATES), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Template);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const snap = await getDoc(doc(db, TEMPLATES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Template;
}

// ── Plantillas predefinidas (seed) ──────────────────────

const SEED_TEMPLATES: { id: string; name: string; description: string; format: 'pdf' | 'pptx' | 'jpg'; featured?: boolean; order: number; slots: TemplateSlot[] }[] = [
  {
    id: 'folleto-2p',
    name: 'Folleto – Médicos',
    description: 'Folleto multipágina orientado a profesionales de la salud. Puedes configurar el número de páginas y tamaño en el editor.',
    format: 'pdf',
    featured: true,
    order: 1,
    slots: [
      { id: 'titulo_principal', name: 'Título principal', type: 'title', maxLength: 60, required: true },
      { id: 'subtitulo', name: 'Subtítulo', type: 'subtitle', maxLength: 90, required: true },
      { id: 'imagen_hero', name: 'Imagen principal', type: 'image', maxLength: 0, required: true, imagePromptHint: 'Professional medical illustration, clean and modern pharmaceutical style' },
      { id: 'cuerpo_1', name: 'Cuerpo página 1', type: 'body', maxLength: 300, required: true },
      { id: 'bullets', name: 'Puntos clave', type: 'bullets', maxLength: 400, maxItems: 5, maxItemLength: 80, required: true },
      { id: 'imagen_secundaria', name: 'Imagen secundaria', type: 'image', maxLength: 0, required: false, imagePromptHint: 'Medical professional in consultation, warm and trustworthy atmosphere' },
      { id: 'cuerpo_2', name: 'Cuerpo página 2', type: 'body', maxLength: 400, required: false },
      { id: 'callout', name: 'Dato destacado', type: 'callout', maxLength: 120, required: false },
      { id: 'disclaimer', name: 'Disclaimer', type: 'disclaimer', maxLength: 200, required: false },
    ],
  },
  {
    id: 'email-promo',
    name: 'Email promocional',
    description: 'Email HTML para envío a profesionales de la salud.',
    format: 'pdf',
    featured: true,
    order: 2,
    slots: [
      { id: 'asunto', name: 'Asunto del email', type: 'title', maxLength: 60, required: true },
      { id: 'pre_header', name: 'Pre-header', type: 'subtitle', maxLength: 90, required: true },
      { id: 'imagen_banner', name: 'Banner del email', type: 'image', maxLength: 0, required: true, imagePromptHint: 'Professional email header banner, pharmaceutical branding, modern gradient design' },
      { id: 'saludo', name: 'Saludo', type: 'body', maxLength: 100, required: true },
      { id: 'cuerpo', name: 'Cuerpo del email', type: 'body', maxLength: 500, required: true },
      { id: 'cta', name: 'Call to action', type: 'callout', maxLength: 40, required: true },
      { id: 'bullets', name: 'Beneficios destacados', type: 'bullets', maxLength: 300, maxItems: 4, maxItemLength: 70, required: false },
    ],
  },
  {
    id: 'slide-deck',
    name: 'Presentación médica (5 slides)',
    description: 'Deck de 5 slides para visita médica o congreso.',
    format: 'pptx',
    order: 3,
    slots: [
      // Slide 1 – Portada
      { id: 'titulo_portada', name: 'Slide 1: Título de portada', type: 'title', maxLength: 50, required: true },
      { id: 'subtitulo_portada', name: 'Slide 1: Subtítulo portada', type: 'subtitle', maxLength: 80, required: false },
      { id: 'imagen_portada', name: 'Slide 1: Imagen de portada', type: 'image', maxLength: 0, required: false, imagePromptHint: 'Modern pharmaceutical presentation cover, abstract medical molecular background, clean professional design', imageAspectRatio: '16:9' },
      // Slide 2 – Introducción
      { id: 'slide2_titulo', name: 'Slide 2: Título', type: 'title', maxLength: 50, required: true },
      { id: 'slide2_cuerpo', name: 'Slide 2: Contenido', type: 'body', maxLength: 250, required: true },
      // Slide 3 – Puntos clave
      { id: 'slide3_titulo', name: 'Slide 3: Título', type: 'title', maxLength: 50, required: true },
      { id: 'slide3_bullets', name: 'Slide 3: Puntos clave', type: 'bullets', maxLength: 400, maxItems: 5, maxItemLength: 80, required: true },
      { id: 'slide3_imagen', name: 'Slide 3: Imagen', type: 'image', maxLength: 0, required: false, imagePromptHint: 'Medical data visualization, clean pharmaceutical infographic style', imageAspectRatio: '16:9' },
      // Slide 4 – Detalle
      { id: 'slide4_titulo', name: 'Slide 4: Título', type: 'title', maxLength: 50, required: true },
      { id: 'slide4_cuerpo', name: 'Slide 4: Contenido', type: 'body', maxLength: 300, required: true },
      // Slide 5 – Cierre
      { id: 'slide5_titulo', name: 'Slide 5: Título', type: 'title', maxLength: 50, required: true },
      { id: 'slide5_callout', name: 'Slide 5: Mensaje final', type: 'callout', maxLength: 120, required: true },
    ],
  },
  {
    id: 'banner-congreso',
    name: 'Banner para congreso',
    description: 'Banner visual impreso o digital para stand en congreso médico.',
    format: 'jpg',
    order: 4,
    slots: [
      { id: 'headline', name: 'Headline', type: 'title', maxLength: 40, required: true },
      { id: 'subhead', name: 'Sub-headline', type: 'subtitle', maxLength: 60, required: true },
      { id: 'imagen_fondo', name: 'Imagen de fondo', type: 'image', maxLength: 0, required: true, imagePromptHint: 'Abstract medical/scientific background, molecular structures, clean and modern pharmaceutical aesthetic' },
      { id: 'cuerpo_corto', name: 'Texto breve', type: 'body', maxLength: 150, required: false },
      { id: 'callout', name: 'Dato impactante', type: 'callout', maxLength: 80, required: true },
    ],
  },
];

/**
 * Crea las plantillas seed en Firestore si no existen.
 * Se llama una vez desde la UI (ej: al entrar por primera vez).
 */
export async function seedTemplates(tenantId: string): Promise<void> {
  for (const t of SEED_TEMPLATES) {
    const ref = doc(db, TEMPLATES, t.id);
    await setDoc(ref, {
      name: t.name,
      description: t.description,
      format: t.format,
      featured: t.featured ?? false,
      order: t.order,
      slots: t.slots,
      tenantId,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }
}
