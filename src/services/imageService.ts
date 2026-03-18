import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

export type ImageProvider = 'dalle3' | 'gemini';

export type ImageStyle =
  | 'auto'
  | 'medical_photo'
  | 'scientific_illustration'
  | 'abstract_premium'
  | 'infographic'
  | 'product';

export const IMAGE_STYLE_LABELS: Record<ImageStyle, { label: string; emoji: string }> = {
  auto:                    { label: 'Automático',               emoji: '✨' },
  medical_photo:           { label: 'Fotografía médica',        emoji: '📷' },
  scientific_illustration: { label: 'Ilustración científica',   emoji: '🔬' },
  abstract_premium:        { label: 'Abstracto premium',        emoji: '🎨' },
  infographic:             { label: 'Infografía',               emoji: '📊' },
  product:                 { label: 'Producto',                 emoji: '💊' },
};

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  auto: '',
  medical_photo: 'Professional medical photography, clinical setting, realistic, warm lighting, doctor or patient context.',
  scientific_illustration: 'Scientific illustration style, molecular structures, clean vector-like rendering, laboratory imagery.',
  abstract_premium: 'Abstract premium design, soft gradients, geometric shapes, minimalist, elegant, modern.',
  infographic: 'Clean infographic style, data visualization aesthetic, charts and icons, flat design.',
  product: 'Product photography, pharmaceutical packaging, clean white background, studio lighting.',
};

export interface ImageBrandContext {
  brandName: string;
  colorPrimary: string;
  colorSecondary: string;
  moleculeName?: string | null;
  indicationNames?: string[];
  claims?: string[];
  knowledgeSummary?: string;
}

/** Detecta si un motor de imágenes está disponible */
export function isImageProviderAvailable(provider: ImageProvider): boolean {
  if (provider === 'dalle3') return !!OPENAI_API_KEY;
  if (provider === 'gemini') return !!import.meta.env.VITE_GEMINI_API_KEY;
  return false;
}

/** Retorna el motor de imágenes por defecto (DALL-E 3 si disponible, Gemini si no) */
export function getDefaultImageProvider(): ImageProvider {
  if (isImageProviderAvailable('dalle3')) return 'dalle3';
  return 'gemini';
}

// ── Build enriched prompt ───────────────────────────────

function buildImagePrompt(
  prompt: string,
  brandContext?: ImageBrandContext,
  style: ImageStyle = 'auto',
): string {
  let fullPrompt = `Generate a premium, high-quality pharmaceutical marketing image. ${prompt}`;

  if (style !== 'auto' && STYLE_PROMPTS[style]) {
    fullPrompt += `\n\nVISUAL STYLE: ${STYLE_PROMPTS[style]}`;
  }

  if (brandContext) {
    fullPrompt += `\n\nBRAND CONTEXT:`;
    fullPrompt += `\n- Brand: "${brandContext.brandName}"`;
    fullPrompt += `\n- Color palette: primary ${brandContext.colorPrimary}, secondary ${brandContext.colorSecondary}`;
    fullPrompt += `\n- Style: clean, modern, premium pharmaceutical/medical, professional`;

    if (brandContext.moleculeName) {
      fullPrompt += `\n- Active molecule: ${brandContext.moleculeName} — incorporate subtle visual references to this molecule (molecular structures, capsules, medical imagery related to it)`;
    }

    if (brandContext.indicationNames && brandContext.indicationNames.length > 0) {
      fullPrompt += `\n- Therapeutic areas: ${brandContext.indicationNames.join(', ')} — the imagery should visually relate to these medical areas`;
    }

    if (brandContext.claims && brandContext.claims.length > 0) {
      const topClaims = brandContext.claims.slice(0, 5);
      fullPrompt += `\n- Key product messages (use as visual inspiration, NOT as text): ${topClaims.join('; ')}`;
    }

    if (brandContext.knowledgeSummary) {
      fullPrompt += `\n- Additional brand context: ${brandContext.knowledgeSummary}`;
    }

    fullPrompt += `\n\nVISUAL REQUIREMENTS:
- Create a cohesive image that reflects the brand's identity and therapeutic area
- Use the brand colors as dominant tones in the composition
- Include visual elements related to healthcare/pharma (molecules, abstract medical shapes, clean gradients)
- Make it look like premium pharmaceutical advertising — not generic stock photography
- The image should feel unique and branded, not generic`;
  }

  fullPrompt += '\n\nIMPORTANT: Do NOT include any text, letters, words, or numbers in the image. The image should be purely visual/graphical.';

  return fullPrompt;
}

// ── DALL-E 3 ────────────────────────────────────────────

async function generateImageDallE3(
  prompt: string,
  brandContext?: ImageBrandContext,
  style: ImageStyle = 'auto',
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key no configurada. Agrega VITE_OPENAI_API_KEY en tu archivo .env');
  }

  const fullPrompt = buildImagePrompt(prompt, brandContext, style);

  // Use landscape (1792x1024) for hero/background images, square for others
  const isHero = prompt.toLowerCase().includes('full-bleed') || prompt.toLowerCase().includes('hero') || prompt.toLowerCase().includes('background') || prompt.toLowerCase().includes('banner');
  const size = isHero ? '1792x1024' : '1024x1024';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size,
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as Record<string, Record<string, string>>;
    throw new Error(
      `DALL-E 3 API error ${res.status}: ${errBody?.error?.message ?? res.statusText}`
    );
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('DALL-E 3 no devolvió imagen.');

  return `data:image/png;base64,${b64}`;
}

// ── Gemini Image Generation ─────────────────────────────

async function generateImageGemini(
  prompt: string,
  brandContext?: ImageBrandContext,
  style: ImageStyle = 'auto',
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp-image-generation',
  });

  const fullPrompt = buildImagePrompt(prompt, brandContext, style);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      // @ts-expect-error - responseModalities is valid for image generation model
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const response = result.response;
  const parts = response.candidates?.[0]?.content?.parts;

  if (!parts) {
    throw new Error('No se recibió respuesta del modelo de imágenes.');
  }

  for (const part of parts) {
    if (part.inlineData) {
      const { mimeType, data } = part.inlineData;
      return `data:${mimeType};base64,${data}`;
    }
  }

  throw new Error('El modelo no generó una imagen. Intenta con un prompt diferente.');
}

// ── Public API ──────────────────────────────────────────

/**
 * Genera una imagen usando DALL-E 3 (primario) o Gemini (fallback).
 * Retorna un data URL (base64).
 */
export async function generateImage(
  prompt: string,
  brandContext?: ImageBrandContext,
  provider?: ImageProvider,
  style: ImageStyle = 'auto',
): Promise<string> {
  const selectedProvider = provider ?? getDefaultImageProvider();

  // Intentar con el proveedor seleccionado
  try {
    if (selectedProvider === 'dalle3') {
      return await generateImageDallE3(prompt, brandContext, style);
    }
    return await generateImageGemini(prompt, brandContext, style);
  } catch (primaryErr) {
    console.error(`[Image/${selectedProvider}] Error:`, primaryErr);

    // Fallback: si DALL-E falla, intentar Gemini y viceversa
    const fallback: ImageProvider = selectedProvider === 'dalle3' ? 'gemini' : 'dalle3';
    if (isImageProviderAvailable(fallback)) {
      console.info(`[Image] Intentando fallback con ${fallback}...`);
      try {
        if (fallback === 'dalle3') {
          return await generateImageDallE3(prompt, brandContext, style);
        }
        return await generateImageGemini(prompt, brandContext, style);
      } catch (fallbackErr) {
        console.error(`[Image/${fallback}] Fallback también falló:`, fallbackErr);
      }
    }

    throw primaryErr;
  }
}

// ── Product Photoshoot ──────────────────────────────────

export const PHOTOSHOOT_SCENES = [
  { id: 'doctor_desk', label: 'Escritorio médico', emoji: '🩺', prompt: 'pharmaceutical product on a doctor desk in a modern medical office, stethoscope, medical charts, warm professional lighting' },
  { id: 'pharmacy', label: 'Farmacia', emoji: '💊', prompt: 'pharmaceutical product displayed on a clean pharmacy shelf, organized, professional pharmacy environment, bright clean lighting' },
  { id: 'lab', label: 'Laboratorio', emoji: '🔬', prompt: 'pharmaceutical product in a scientific laboratory setting, test tubes, microscope, clean white lab environment' },
  { id: 'hero', label: 'Hero shot', emoji: '✨', prompt: 'pharmaceutical product hero shot, floating, dramatic studio lighting, gradient background, premium advertising photography' },
  { id: 'lifestyle', label: 'Estilo de vida', emoji: '🌿', prompt: 'pharmaceutical product in a lifestyle wellness setting, natural light, plants, soft bokeh, health and wellbeing concept' },
] as const;

export type PhotoshootScene = typeof PHOTOSHOOT_SCENES[number]['id'];

/**
 * Genera una imagen de "photoshoot" del producto farmacéutico en un escenario específico.
 * Usa el nombre del producto y la identidad de marca para crear una imagen contextualizada.
 */
/**
 * Genera un fondo de página completo para usar como background de diseño.
 * La imagen cubre toda la página con elementos visuales pharma-themed, sin texto.
 */
export async function generatePageBackground(
  brandContext: ImageBrandContext,
  campaignTheme: string,
  pageNumber: number,
  totalPages: number,
): Promise<string> {
  const isFirstPage = pageNumber === 1;
  const prompt = `Create a FULL-PAGE background design for a pharmaceutical marketing ${isFirstPage ? 'cover' : 'inner page'}.

DESIGN BRIEF:
- This is page ${pageNumber} of ${totalPages} of a promotional material for "${brandContext.brandName}"
- Campaign theme: ${campaignTheme}
- Brand colors: primary ${brandContext.colorPrimary}, secondary ${brandContext.colorSecondary}
${brandContext.moleculeName ? `- Product/molecule: ${brandContext.moleculeName}` : ''}
${brandContext.indicationNames?.length ? `- Therapeutic area: ${brandContext.indicationNames.join(', ')}` : ''}

VISUAL REQUIREMENTS:
${isFirstPage ? `- Hero/cover page: bold, impactful, with strong brand presence
- Large decorative area at top (30-40% of page) for brand header
- Use brand primary color as dominant with gradients and abstract shapes
- Include abstract pharmaceutical/medical visual elements (molecules, DNA helixes, capsules, abstract medical shapes)
- Sophisticated, modern design with depth (gradients, overlapping shapes, subtle patterns)` :
`- Inner page: lighter, more refined, content-focused background
- Subtle header area at top (10-15% of page)  
- Mostly clean/light background for readability (white/very light tones) with decorative edges
- Subtle brand color accents on borders/corners
- Delicate abstract patterns or shapes, very subtle`}

STYLE:
- Premium pharmaceutical advertising aesthetic
- Clean, modern, sophisticated — think Pfizer, Novartis, Roche level design
- Abstract and geometric, not literal medical photos
- Portrait orientation (taller than wide, like a letter-size page)
- The design should have clear areas where text can be overlaid (lighter/darker zones)

CRITICAL: Do NOT include ANY text, letters, words, numbers, or typography of any kind. This is ONLY a visual/graphical background.`;

  return generateImage(prompt, undefined, undefined, 'abstract_premium');
}

export async function generateProductPhotoshoot(
  productName: string,
  scene: PhotoshootScene,
  brandContext?: ImageBrandContext,
): Promise<string> {
  const sceneConfig = PHOTOSHOOT_SCENES.find(s => s.id === scene);
  if (!sceneConfig) throw new Error('Escenario no válido');

  const prompt = `Product photoshoot of "${productName}" pharmaceutical product. Scene: ${sceneConfig.prompt}. 
The product packaging should be clean, modern, and clearly the focal point of the image. 
Make it look like a professional advertising photograph for a pharmaceutical company.`;

  return generateImage(prompt, brandContext, undefined, 'product');
}
