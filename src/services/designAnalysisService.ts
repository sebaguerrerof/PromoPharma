import { GoogleGenerativeAI } from '@google/generative-ai';
import { Timestamp } from 'firebase/firestore';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Template, TemplateSlot, DesignBlock, DesignLayout } from '@/types';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

/**
 * Información extraída de un folleto existente
 */
export interface ExtractedDesign {
  /** Colores principales detectados */
  colors: string[];
  /** Fuentes detectadas */
  fonts: string[];
  /** Estructura/layout del documento */
  layout: {
    /** Número de páginas */
    pages: number;
    /** Secciones identificadas */
    sections: string[];
    /** Elementos visuales */
    elements: string[];
  };
  /** Estilo general */
  style: 'moderno' | 'elegante' | 'cientifico' | 'vibrante';
  /** Template generado basado en el diseño */
  template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>;
}

/**
 * Analiza un folleto subido (PDF o imagen) y extrae información de diseño
 * @param file Archivo del folleto (PDF o imagen)
 * @param brandName Nombre de la marca para contexto
 * @param moleculeName Nombre de la molécula si aplica
 */
export async function analyzeBrochureDesign(
  file: File,
  brandName: string,
  moleculeName?: string
): Promise<ExtractedDesign> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Convertir archivo a base64 para enviar a Gemini
  const base64 = await fileToBase64(file);

  const prompt = `Analiza este folleto farmacéutico y extrae información detallada de diseño. Eres un experto en diseño gráfico y marketing farmacéutico.

FOLLETO A ANALIZAR: ${file.name}
MARCA: ${brandName}
${moleculeName ? `MOLECULA: ${moleculeName}` : ''}

INSTRUCCIONES:
1. Examina el layout, colores, tipografía y elementos visuales
2. Identifica la estructura del documento (páginas, secciones)
3. Detecta el estilo general (moderno, elegante, científico, vibrante)
4. Genera un template JSON que capture la estructura

RESPONDE SOLO con un objeto JSON válido con esta estructura exacta:
{
  "colors": ["#hex1", "#hex2", "#hex3"],
  "fonts": ["Fuente Principal", "Fuente Secundaria"],
  "layout": {
    "pages": 2,
    "sections": ["Header", "Introducción", "Beneficios", "Datos clínicos", "Contacto"],
    "elements": ["Logo", "Imagen producto", "Gráficos", "Tabla datos"]
  },
  "style": "moderno|elegante|cientifico|vibrante",
  "template": {
    "name": "Folleto basado en diseño existente",
    "format": "folleto-2p",
    "description": "Template extraído de folleto subido",
    "slots": [
      {
        "id": "titulo_principal",
        "name": "Título Principal",
        "type": "text",
        "description": "Título principal del folleto",
        "required": true,
        "defaultValue": ""
      }
      // ... más slots según el análisis
    ]
  }
}`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: file.type,
          data: base64.split(',')[1] // Solo la parte base64
        }
      }
    ]);

    const text = result.response.text().trim();
    console.log('Análisis de diseño:', text);

    // Extraer JSON de la respuesta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se pudo extraer información de diseño del folleto');
    }

    const extracted = JSON.parse(jsonMatch[0]) as ExtractedDesign;

    // Validar estructura básica
    if (!extracted.colors || !extracted.layout || !extracted.template) {
      throw new Error('La respuesta no contiene toda la información requerida');
    }

    return extracted;

  } catch (error) {
    console.error('Error analizando diseño:', error);
    throw new Error('No se pudo analizar el diseño del folleto. Intenta con una imagen más clara.');
  }
}

/**
 * Crea un template basado en el diseño extraído
 * @param extracted Diseño extraído del folleto
 * @param tenantId ID del tenant
 */
export async function createTemplateFromDesign(
  extracted: ExtractedDesign,
  tenantId: string
): Promise<Template> {
  const templateId = `custom_${Date.now()}`;

  const template: Template = {
    id: templateId,
    name: extracted.template.name,
    format: extracted.template.format as 'pdf' | 'pptx' | 'jpg',
    description: extracted.template.description,
    slots: extracted.template.slots,
    tenantId,
    createdAt: Timestamp.now(),
    featured: false,
  };

  // Persistir template para que pueda recuperarse al reabrir la sesión.
  await setDoc(doc(db, 'templates', templateId), {
    name: template.name,
    format: template.format,
    description: template.description,
    slots: template.slots,
    tenantId,
    featured: false,
    order: 9999,
    createdAt: serverTimestamp(),
  });

  return template;
}

/**
 * Convierte un File a base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Tipos de archivo soportados para análisis de diseño
 */
export const SUPPORTED_DESIGN_FILES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

/**
 * Valida si un archivo es soportado para análisis de diseño
 */
export function isSupportedDesignFile(file: File): boolean {
  return SUPPORTED_DESIGN_FILES.includes(file.type);
}

// ═══════════════════════════════════════════════════════════
// Email Design Analysis (image/PDF → DesignLayout)
// ═══════════════════════════════════════════════════════════

export interface ExtractedEmailDesign {
  name: string;
  description: string;
  layout: DesignLayout;
  detectedColors: string[];
  detectedFonts: string[];
}

/**
 * Analyzes an uploaded email screenshot or PDF and extracts a DesignLayout
 * that can be saved as a custom DesignTemplate.
 */
export async function analyzeEmailDesign(file: File): Promise<ExtractedEmailDesign> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const base64 = await fileToBase64(file);

  const prompt = `Analyze this email design image and extract its EXACT block structure as a JSON layout.

You are an expert email designer. Identify every visual section/block in this email and map it to these block types:
- header: top bar with logo/brand
- hero: large banner image
- text: paragraph or title text
- image: standalone image
- cta: button / call-to-action
- footer: bottom section with legal text
- spacer: empty space between blocks
- divider: horizontal line separator
- bullets: bullet point list
- columns: side-by-side content

For each block, estimate its position as percentages of the total email:
- x: horizontal position (0-100, usually 0 for full-width or 5-10 for padded)
- y: vertical position from top (0-100)
- w: width percentage (0-100)
- h: height percentage (0-100, relative to total email height)

Also detect:
1. The dominant colors (as hex codes)
2. The fonts used (or closest match)
3. A descriptive name for this design

RESPOND ONLY with valid JSON:
{
  "name": "Descriptive template name",
  "description": "Brief description of the email's style and purpose",
  "detectedColors": ["#hex1", "#hex2"],
  "detectedFonts": ["Font1", "Font2"],
  "blocks": [
    { "id": "block-1", "type": "header", "x": 0, "y": 0, "w": 100, "h": 8, "defaultContent": "Logo text" },
    { "id": "block-2", "type": "hero", "x": 0, "y": 8, "w": 100, "h": 25, "defaultContent": "Hero image" },
    ...more blocks...
  ]
}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: file.type, data: base64.split(',')[1] } },
  ]);

  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No se pudo analizar el diseño del email.');

  const parsed = JSON.parse(jsonMatch[0]) as {
    name: string;
    description: string;
    detectedColors: string[];
    detectedFonts: string[];
    blocks: (DesignBlock & { defaultContent?: string })[];
  };

  if (!parsed.blocks || parsed.blocks.length === 0) {
    throw new Error('No se detectaron bloques en el diseño.');
  }

  return {
    name: parsed.name || 'Diseño importado',
    description: parsed.description || 'Diseño extraído de imagen subida.',
    layout: {
      width: 600,
      height: 800,
      blocks: parsed.blocks.map((b, i) => ({
        id: b.id || `block-${i + 1}`,
        type: b.type,
        x: Math.max(0, Math.min(100, b.x)),
        y: Math.max(0, Math.min(100, b.y)),
        w: Math.max(5, Math.min(100, b.w)),
        h: Math.max(2, Math.min(50, b.h)),
        defaultContent: b.defaultContent,
        style: b.style,
      })),
    },
    detectedColors: parsed.detectedColors ?? [],
    detectedFonts: parsed.detectedFonts ?? [],
  };
}