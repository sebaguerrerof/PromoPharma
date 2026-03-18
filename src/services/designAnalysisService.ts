import { GoogleGenerativeAI } from '@google/generative-ai';
import { Timestamp } from 'firebase/firestore';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Template, TemplateSlot } from '@/types';

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