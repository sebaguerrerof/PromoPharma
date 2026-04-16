import { Timestamp } from 'firebase/firestore';

// ── M2: Contenido Científico ────────────────────────────

export interface Molecule {
  id: string;
  name: string;
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Indication {
  id: string;
  moleculeId: string;
  name: string;
  /** Beneficios de la marca para esta indicación */
  benefits: string[];
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
}

// ── M2: Documentos por Indicación ───────────────────────

export type DocumentStatus = 'uploading' | 'processing' | 'processed' | 'error';

export interface ScientificDocument {
  id: string;
  indicationId: string;
  moleculeId: string;
  tenantId: string;
  /** Nombre original del archivo */
  fileName: string;
  /** Ruta en Firebase Storage */
  storagePath: string;
  /** URL pública de descarga */
  downloadUrl: string;
  /** Tamaño en bytes */
  sizeBytes: number;
  /** MIME type */
  mimeType: string;
  status: DocumentStatus;
  createdBy: string;
  createdAt: Timestamp;
}

// ── M2: Insights con Referencias ────────────────────────

export type InsightStatus = 'pending' | 'approved' | 'rejected';

export type InsightCategory =
  | 'benefit'
  | 'primary_use'
  | 'key_message'
  | 'contraindication'
  | 'other';

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  benefit: 'Beneficio',
  primary_use: 'Uso principal',
  key_message: 'Mensaje clave',
  contraindication: 'Contraindicación',
  other: 'Otro',
};

export interface InsightReference {
  documentId: string;
  documentName: string;
  page: number | null;
  section: string;
  quote: string;
}

export interface Insight {
  id: string;
  indicationId: string;
  moleculeId: string;
  tenantId: string;
  text: string;
  category: InsightCategory;
  status: InsightStatus;
  references: InsightReference[];
  createdBy: string;
  createdAt: Timestamp;
  validatedBy: string | null;
  validatedAt: Timestamp | null;
}

// ── M3: Marcas y Parámetros ─────────────────────────────

export interface BrandLogo {
  /** Etiqueta descriptiva (ej: "Logo fondo claro", "Logo fondo oscuro") */
  label: string;
  /** URL de la imagen en Storage */
  url: string;
}

/** Claim aprobado, asociado a una indicación */
export interface BrandClaim {
  indicationId: string;
  indicationName: string;
  text: string;
}

export interface BrandParams {
  fontTitle: string;
  fontBody: string;
  colorPrimary: string;
  colorSecondary: string;
  /** URL destino del QR (la página a la que redirige) */
  qrUrl: string;
  /** URL de la imagen QR en Storage (generada o subida) */
  qrImageUrl?: string;
  /** URL del logo principal de la marca en Storage (legacy, se mantiene para compatibilidad) */
  logoUrl: string;
  /** Logos adicionales para distintos fondos */
  logos?: BrandLogo[];
  /** URLs de imágenes/assets de la marca (fotos producto, iconos, etc.) */
  assets: string[];
  /** Sello/badge farmacéutico visible en los materiales (ej: "Material exclusivo para profesionales de la salud") */
  disclaimerBadge?: string;
  /** Claims aprobados de la marca, agrupados por indicación */
  claims?: BrandClaim[];
}

export interface Brand {
  id: string;
  name: string;
  moleculeId: string;
  params: BrandParams;
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── Banco de Conocimiento (Knowledge Bank) ──────────────

export type KnowledgeItemType = 'reference_material' | 'style_guide' | 'approved_text' | 'design_asset';

export const KNOWLEDGE_ITEM_TYPE_LABELS: Record<KnowledgeItemType, string> = {
  reference_material: 'Material de referencia',
  style_guide: 'Guía de estilo',
  approved_text: 'Texto aprobado',
  design_asset: 'Asset de diseño',
};

export type KnowledgeScope = 'global' | 'brand';

export interface KnowledgeItem {
  id: string;
  /** Título descriptivo */
  title: string;
  /** Descripción o notas sobre el material */
  description: string;
  /** Tipo de material */
  type: KnowledgeItemType;
  /** Alcance: global (toda la farmacéutica) o por marca */
  scope: KnowledgeScope;
  /** ID de marca (solo cuando scope === 'brand') */
  brandId: string | null;
  /** Nombre de la marca (para queries rápidas) */
  brandName: string | null;
  /** ID de molécula asociada */
  moleculeId: string | null;
  /** Nombre de la molécula asociada */
  moleculeName: string | null;
  /** URLs de archivos subidos (PDFs, imágenes) */
  fileUrls: string[];
  /** Nombres originales de los archivos */
  fileNames: string[];
  /** Texto extraído o notas del contenido (para que la IA lo use) */
  content: string;
  /** Tags para filtrado */
  tags: string[];
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── M3: Plantillas con Slots ────────────────────────────

export type SlotType = 'title' | 'subtitle' | 'body' | 'bullets' | 'callout' | 'disclaimer' | 'image';

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  title: 'Título',
  subtitle: 'Subtítulo',
  body: 'Cuerpo',
  bullets: 'Viñetas',
  callout: 'Callout',
  disclaimer: 'Disclaimer',
  image: 'Imagen',
};

export interface TemplateSlot {
  id: string;
  name: string;
  type: SlotType;
  maxLength: number;
  maxItems?: number;       // Para bullets
  maxItemLength?: number;  // Para cada bullet
  required: boolean;
  /** Prompt sugerido para generación de imagen (solo type=image) */
  imagePromptHint?: string;
  /** Aspect ratio para imagen (solo type=image) */
  imageAspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
}

export interface Template {
  id: string;
  name: string;
  description: string;
  format: 'pdf' | 'pptx' | 'jpg';
  slots: TemplateSlot[];
  tenantId: string;
  createdAt: Timestamp;
  featured?: boolean;
  order?: number;
}

// ── M4: Chat AI / Generación ────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
  /** Valores de slots parseados de la respuesta AI (si los hay) */
  slotValues?: Record<string, string>;
}

export interface BrochureLayoutZone {
  id: string;
  slotId: string;
  slotType: SlotType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrochureLayoutPage {
  pageNumber: number;
  backgroundImageUrl?: string;
  zones: BrochureLayoutZone[];
}

export interface BrochureLayoutSpec {
  version: 1;
  width: number;
  height: number;
  pages: BrochureLayoutPage[];
}

export interface GenerationSession {
  id: string;
  brandId: string;
  brandName: string;
  /** Nombre de la campaña dado por el usuario */
  campaignName: string;
  templateId: string;
  templateName: string;
  moleculeId: string | null;
  moleculeName: string | null;
  /** IDs de indicaciones seleccionadas */
  indicationIds: string[];
  indicationNames: string[];
  /** Valores actuales de cada slot */
  slotValues: Record<string, string>;
  /** Historial de mensajes del chat */
  messages: ChatMessage[];
  /** Estado: draft = en edición, saved = guardado como publicación */
  status: 'draft' | 'saved';
  /** ID de kit (agrupa varias piezas de una misma campaña) */
  kitId?: string;
  /** Archivo fuente del folleto, si la sesión nace de brochure */
  brochureSourceUrl?: string;
  brochureSourceName?: string;
  brochureSourceMimeType?: string;
  brochureSourceSizeBytes?: number;
  /** Snapshot de diseño detectado para trazabilidad */
  brochureDesignSnapshot?: {
    layoutPages: number;
    style: 'moderno' | 'elegante' | 'cientifico' | 'vibrante';
    colors: string[];
    fonts: string[];
  };
  brochureLayoutSpec?: BrochureLayoutSpec;
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── M5: Design Library (CRM de Diseños) ─────────────────

export type DesignCategory = 'email' | 'brochure' | 'banner' | 'presentation' | 'custom';
export type DesignSource = 'system' | 'imported' | 'created';

export const DESIGN_CATEGORY_LABELS: Record<DesignCategory, string> = {
  email: 'Email',
  brochure: 'Folleto',
  banner: 'Banner',
  presentation: 'Presentación',
  custom: 'Personalizado',
};

export type DesignBlockType =
  | 'header'
  | 'hero'
  | 'text'
  | 'image'
  | 'cta'
  | 'footer'
  | 'spacer'
  | 'divider'
  | 'bullets'
  | 'columns'
  | 'quote'
  | 'social'
  | 'video';

export interface DesignBlock {
  id: string;
  type: DesignBlockType;
  /** Posición y tamaño en porcentaje (0-100) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Contenido por defecto (placeholder) */
  defaultContent?: string;
  /** Estilos inline opcionales */
  style?: Record<string, string>;
}

export interface DesignLayout {
  /** Ancho base en px (ej: 600 para email) */
  width: number;
  /** Alto base en px */
  height: number;
  blocks: DesignBlock[];
}

export interface DesignTemplate {
  id: string;
  name: string;
  /** Marca asociada (null = diseño global) */
  brandId: string | null;
  brandName: string | null;
  category: DesignCategory;
  /** URL de thumbnail preview */
  thumbnailUrl: string;
  layout: DesignLayout;
  style: {
    colorPrimary: string;
    colorSecondary: string;
    colorBackground: string;
    fontTitle: string;
    fontBody: string;
    variant: string;
  };
  source: DesignSource;
  /** URL del archivo original si fue importado */
  sourceFileUrl?: string;
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ── M6: Mailing ─────────────────────────────────────────

export type MailingStatus = 'draft' | 'ready' | 'sent';

export interface MailingBlockContent {
  id: string;
  type: DesignBlockType;
  content: string;
  /** URL de imagen si type=image, hero, video thumbnail */
  imageUrl?: string;
  /** Texto del botón si type=cta */
  ctaText?: string;
  /** URL del botón si type=cta */
  ctaUrl?: string;
  /** URL del video (YouTube/Vimeo) si type=video */
  videoUrl?: string;
  /** Autor de la cita si type=quote */
  quoteAuthor?: string;
  /** Links de redes sociales si type=social [{platform, url}] */
  socialLinks?: { platform: string; url: string }[];
  /** Fondo personalizado del bloque */
  backgroundColor?: string;
  /** Imagen de fondo del bloque */
  backgroundImage?: string;
  /** Padding personalizado */
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  /** Texto de fecha editable (header) */
  dateText?: string;
  /** Alto del logo en px (header) */
  logoHeight?: number;
  /** Posición X del logo en % (0-100) relativo al header */
  logoX?: number;
  /** Posición Y del logo en % (0-100) relativo al header */
  logoY?: number;
  style?: Record<string, string>;
}

export interface MailingProject {
  id: string;
  /** Nombre del email (ej: "Newsletter Marzo 2026") */
  name: string;
  /** Asunto del email */
  subject: string;
  brandId: string;
  brandName: string;
  /** ID del diseño base usado */
  designTemplateId: string;
  designTemplateName: string;
  /** Contenido de cada bloque editado */
  blocks: MailingBlockContent[];
  /** Layout copiado del DesignTemplate al crear */
  layout: DesignLayout;
  /** Estilos aplicados (heredados de marca + diseño) */
  style: {
    colorPrimary: string;
    colorSecondary: string;
    colorBackground: string;
    fontTitle: string;
    fontBody: string;
    /** Logo URL de la marca */
    logoUrl?: string;
  };
  /** Configuración global del email */
  emailSettings?: {
    /** Color de fondo del body (outer background) */
    bodyBackground?: string;
    /** Imagen de fondo del body */
    bodyBackgroundImage?: string;
    /** Ancho del contenedor (default: layout.width) */
    containerWidth?: number;
    /** Bordes redondeados del contenedor */
    borderRadius?: number;
    /** Preheader text */
    preheaderText?: string;
  };
  status: MailingStatus;
  tenantId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
