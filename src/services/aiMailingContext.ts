// src/services/aiMailingContext.ts
// ═══════════════════════════════════════════════════════════
// Responsabilidad única: Definir tipos + recopilar contexto desde Firebase
// NO llama a IA, NO parsea respuestas, NO genera HTML
// ═══════════════════════════════════════════════════════════

import type {
  BrandClaim,
  BrandLogo,
  DesignBlockType,
  DesignLayout,
  InsightCategory,
  KnowledgeItemType,
  MailingBlockContent,
} from '@/types';

import { getBrand } from '@/services/brandService';
import { getMolecule, getIndications } from '@/services/moleculeService';
import { getInsights } from '@/services/insightService';
import { getKnowledgeForBrand } from '@/services/knowledgeService';
import { getSystemEmailDesigns, type EmailDesignTag } from '@/services/designTemplateService';
import { getBrandTextBank, buildTextBankSummary } from '@/services/brandTextBankService';

// ═══════════════════════════════════════════════════════════
// A) TIPOS — Contexto de Entrada
// ═══════════════════════════════════════════════════════════

export type EmailType =
  | 'promocional'
  | 'informativo'
  | 'newsletter'
  | 'invitación'
  | 'científico'
  | 'aviso_breve';

export type ContentBlockType = 'hero' | 'text' | 'image' | 'bullets' | 'cta' | 'quote' | 'columns' | 'video' | 'divider';

export interface AIMailingOptions {
  includeHeroImage?: boolean;
  includeClinicalData?: boolean;
  includeQR?: boolean;
  includeSocialLinks?: boolean;
  tone?: 'profesional' | 'cercano' | 'académico' | 'urgente';
  length?: 'corto' | 'medio' | 'largo';
  selectedBlocks?: ContentBlockType[];
}

export interface AIMailingContext {
  brand: {
    id: string;
    name: string;
    moleculeId: string;
    moleculeName: string;
    indicationNames: string[];
    colorPrimary: string;
    colorSecondary: string;
    fontTitle: string;
    fontBody: string;
    logoUrl: string;
    logos: BrandLogo[];
    assets: string[];
    disclaimerBadge?: string;
    qrUrl?: string;
    qrImageUrl?: string;
    communicationTone?: string;
  };

  claims: BrandClaim[];

  insights: Array<{
    text: string;
    category: InsightCategory;
    references: Array<{
      documentId: string;
      documentName: string;
      page: number | null;
      section: string;
      quote: string;
    }>;
  }>;

  knowledgeItems: Array<{
    title: string;
    type: KnowledgeItemType;
    content: string;
    tags: string[];
  }>;

  availableTemplates: Array<{
    id: string;
    name: string;
    description: string;
    tags: EmailDesignTag[];
    blockSummary: string;
  }>;

  availableFonts: string[];

  textBank?: import('@/services/brandTextBankService').TextBankSummary;

  systemRules: typeof SYSTEM_RULES;

  userPrompt: string;
  emailType?: EmailType;
  options?: AIMailingOptions;
}

// ═══════════════════════════════════════════════════════════
// B) TIPOS — Respuesta de la IA
// ═══════════════════════════════════════════════════════════

export interface AIMailingResponse {
  templateId: string;
  projectName: string;
  subject: string;
  emailSettings: {
    preheaderText?: string;
    bodyBackground?: string;
    containerWidth?: number;
    borderRadius?: number;
  };
  blocks: MailingBlockContent[];
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════
// C) CONSTANTES
// ═══════════════════════════════════════════════════════════

export const CHAR_LIMITS = {
  subject: 60,
  preheader: 100,
  header_content: 30,
  hero_title: 60,
  hero_subtitle: 100,
  text_title: 40,
  text_body: 300,
  bullet_item: 80,
  bullet_max_items: 6,
  cta_label: 40,
  cta_text: 25,
  quote_text: 200,
  quote_author: 50,
  footer_disclaimer: 500,
  footer_company_info: 300,
  column_text: 200,
  video_title: 60,
  social_text: 60,
} as const;

const BASE_FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'Palatino', 'Garamond',
];

const SYSTEM_RULES = {
  maxSubjectLength: CHAR_LIMITS.subject,
  maxPreheaderLength: CHAR_LIMITS.preheader,
  maxTitleLength: CHAR_LIMITS.text_title,
  maxBodyLength: CHAR_LIMITS.text_body,
  maxCtaTextLength: CHAR_LIMITS.cta_text,
  maxBulletItems: CHAR_LIMITS.bullet_max_items,
  maxBulletItemLength: CHAR_LIMITS.bullet_item,
  maxQuoteLength: CHAR_LIMITS.quote_text,
  maxQuoteAuthorLength: CHAR_LIMITS.quote_author,
  maxHeroTitleLength: CHAR_LIMITS.hero_title,
  maxHeroSubtitleLength: CHAR_LIMITS.hero_subtitle,
  maxFooterDisclaimerLength: CHAR_LIMITS.footer_disclaimer,
  requireDisclaimer: true,
  requireFooter: true,
  emailWidth: 600,
  emailCompatibility: ['outlook', 'gmail', 'apple_mail'],
  allowedBlockTypes: [
    'header', 'hero', 'text', 'image', 'cta', 'footer', 'spacer',
    'divider', 'bullets', 'columns', 'quote', 'social', 'video',
  ] as DesignBlockType[],
};

// ═══════════════════════════════════════════════════════════
// D) FUNCIÓN CONSTRUCTORA — Recopila contexto desde Firebase
// ═══════════════════════════════════════════════════════════

export async function buildAIMailingContext(
  brandId: string,
  tenantId: string,
  userPrompt: string,
  emailType?: EmailType,
  options?: AIMailingOptions,
): Promise<AIMailingContext> {
  // 1. Obtener brand
  const brand = await getBrand(brandId);
  if (!brand) throw new Error(`Brand not found: ${brandId}`);

  // 2. Obtener molécula + indicaciones en paralelo
  const [molecule, indications] = await Promise.all([
    getMolecule(brand.moleculeId),
    getIndications(brand.moleculeId),
  ]);

  if (!molecule) throw new Error(`Molecule not found: ${brand.moleculeId}`);

  // 3. Obtener insights aprobados de cada indicación + knowledge + textBank en paralelo
  const [knowledgeItems, textBankEntries, ...insightsByIndication] = await Promise.all([
    getKnowledgeForBrand(tenantId, brandId),
    getBrandTextBank(brandId, tenantId, { limit: 20 }),
    ...indications.map((ind) => getInsights(ind.id)),
  ]);

  // 4. Filtrar solo insights aprobados y mapear
  const approvedInsights = insightsByIndication
    .flat()
    .filter((i) => i.status === 'approved')
    .map((i) => ({
      text: i.text,
      category: i.category,
      references: i.references,
    }));

  // 5. Mapear knowledge items
  const mappedKnowledge = knowledgeItems.map((k) => ({
    title: k.title,
    type: k.type,
    content: k.content,
    tags: k.tags,
  }));

  // 6. Mapear templates (sin enviar el layout completo al prompt, solo resumen)
  const systemDesigns = getSystemEmailDesigns();
  const availableTemplates = systemDesigns.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: t.tags,
    blockSummary: t.layout.blocks.map((b) => b.type).join(' → '),
  }));

  // 7. Fonts disponibles (base + fonts de marca sin duplicados)
  const brandFonts = [brand.params.fontTitle, brand.params.fontBody].filter(Boolean);
  const availableFonts = [...new Set([...BASE_FONTS, ...brandFonts])];

  return {
    brand: {
      id: brand.id,
      name: brand.name,
      moleculeId: brand.moleculeId,
      moleculeName: molecule.name,
      indicationNames: indications.map((i) => i.name),
      colorPrimary: brand.params.colorPrimary || '#2563EB',
      colorSecondary: brand.params.colorSecondary || '#0EA5E9',
      fontTitle: brand.params.fontTitle || 'Inter',
      fontBody: brand.params.fontBody || 'Inter',
      logoUrl: brand.params.logoUrl || '',
      logos: brand.params.logos || [],
      assets: brand.params.assets || [],
      disclaimerBadge: brand.params.disclaimerBadge,
      qrUrl: brand.params.qrUrl,
      qrImageUrl: brand.params.qrImageUrl,
    },
    claims: brand.params.claims || [],
    insights: approvedInsights,
    knowledgeItems: mappedKnowledge,
    availableTemplates,
    availableFonts,
    textBank: textBankEntries.length > 0 ? buildTextBankSummary(textBankEntries) : undefined,
    systemRules: SYSTEM_RULES,
    userPrompt,
    emailType,
    options,
  };
}
