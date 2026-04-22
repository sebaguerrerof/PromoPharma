// src/services/aiMailingGenerator.ts
// ═══════════════════════════════════════════════════════════
// Responsabilidad única: Orquestar generación de email con IA
// prompt → IA → parse → validate → apply styles → return
// NO accede a Firebase directamente (usa AIMailingContext)
// NO maneja UI (eso es de AIMailingPanel)
// ═══════════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MailingBlockContent } from '@/types';
import type { AIMailingContext, AIMailingResponse } from '@/services/aiMailingContext';
import { CHAR_LIMITS } from '@/services/aiMailingContext';
import { generateImage } from '@/services/imageService';
import { searchStockImage, searchStockImages, buildStockImageQuery, isPexelsAvailable } from '@/services/stockImageService';

// ═══════════════════════════════════════════════════════════
// TIPOS INTERNOS
// ═══════════════════════════════════════════════════════════

export type GenerationStep =
  | 'building_context'
  | 'generating_content'
  | 'generating_images'
  | 'validating'
  | 'done'
  | 'error';

export interface GenerationProgress {
  step: GenerationStep;
  message: string;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  blockId?: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════
// UTILIDAD — Limpiar HTML del contenido generado por IA
// ═══════════════════════════════════════════════════════════

function stripHtmlTags(text: string): string {
  if (!text) return text;
  // Reemplazar <br>, <br/>, <br /> por \n
  let clean = text.replace(/<br\s*\/?>/gi, '\n');
  // Reemplazar </p>, </div>, </li> por \n (mantener separación de bloques)
  clean = clean.replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n');
  // Eliminar todas las demás etiquetas HTML
  clean = clean.replace(/<[^>]+>/g, '');
  // Decodificar entidades HTML comunes
  clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Limpiar múltiples saltos de línea consecutivos
  clean = clean.replace(/\n{3,}/g, '\n\n');
  // Trim
  return clean.trim();
}

/** Limpia HTML de campos de texto dentro de style (heroTitle, heroSubtitle, etc.) */
function sanitizeBlockStyle(style: Record<string, string>): Record<string, string> {
  const textFields = ['heroTitle', 'heroSubtitle', 'footerCompanyInfo'];
  const result = { ...style };
  for (const field of textFields) {
    if (result[field]) {
      result[field] = stripHtmlTags(result[field]);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL — Orquestador
// ═══════════════════════════════════════════════════════════

export async function generateAIMailing(
  context: AIMailingContext,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<AIMailingResponse> {
  // Paso 1: Generar estructura + contenido con Gemini
  onProgress?.({ step: 'generating_content', message: 'Generando estructura y contenido...' });

  const systemPrompt = buildMailingSystemPrompt(context);
  const rawResponse = await callGemini(systemPrompt, context.userPrompt);
  const response = parseAIMailingResponse(rawResponse);

  // Paso 2: Aplicar estilos de marca (post-proceso local, NO IA)
  response.blocks = applyBrandStylesToBlocks(response.blocks, context.brand);
  applyStructuredInputsToBlocks(response.blocks, context.options);

  // Paso 2.5: Post-proceso de contenido — fix columnas y footer
  for (const b of response.blocks) {
    if (b.type === 'columns' && !b.content.includes('|||')) {
      // La IA no usó el separador — partir el contenido a la mitad
      const lines = b.content.split('\n').filter(Boolean);
      if (lines.length >= 2) {
        const mid = Math.ceil(lines.length / 2);
        b.content = lines.slice(0, mid).join('\n') + '|||' + lines.slice(mid).join('\n');
      } else {
        b.content = b.content + '|||';
      }
    }
    if (b.type === 'footer' && b.content.length > 150) {
      // Truncar footer a ~130 chars en el último espacio
      const truncated = b.content.slice(0, 130);
      const lastSpace = truncated.lastIndexOf(' ');
      b.content = (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + '...';
    }
  }

  // Paso 3: Buscar imágenes stock para bloques hero/image
  // Limpiar URLs placeholder que la IA genera (ej: https://example.com/...)
  for (const b of response.blocks) {
    if ((b.type === 'hero' || b.type === 'image') && b.imageUrl && !b.imageUrl.startsWith('https://images.pexels.com')) {
      b.imageUrl = undefined;
    }
  }
  const imageBlocks = response.blocks.filter(
    (b) => (b.type === 'hero' || b.type === 'image') && !b.imageUrl,
  );
  const shouldFetchImages = imageBlocks.length > 0 && context.options?.includeHeroImage !== false;

  const imagePromise = shouldFetchImages
    ? (async () => {
        onProgress?.({ step: 'generating_images', message: 'Buscando imágenes...' });
        try {
          const stockQuery = buildStockImageQuery({
            userPrompt: context.userPrompt,
            moleculeName: context.brand.moleculeName,
            indicationNames: context.brand.indicationNames,
            emailType: context.emailType,
          });

          if (isPexelsAvailable()) {
            // Buscar una imagen contextual diferente para cada bloque
            const imagePromises = imageBlocks.map(async (block) => {
              // Construir query específico al contenido del bloque
              const blockContext = block.type === 'hero'
                ? [block.style?.heroTitle, block.style?.heroSubtitle, block.content].filter(Boolean).join(' ')
                : block.content || '';
              const contextualQuery = buildStockImageQuery({
                userPrompt: blockContext || context.userPrompt,
                moleculeName: context.brand.moleculeName,
                indicationNames: context.brand.indicationNames,
                emailType: context.emailType,
              });
              const url = await searchStockImage(contextualQuery);
              if (url) block.imageUrl = url;
            });
            await Promise.all(imagePromises);
          } else {
            // Fallback: DALL-E / Gemini para hero solamente
            const heroBlock = imageBlocks.find((b) => b.type === 'hero');
            if (heroBlock) {
              const imagePromptText = buildImagePrompt(context, heroBlock.content || '');
              const imageUrl = await generateImage(imagePromptText, {
                brandName: context.brand.name,
                moleculeName: context.brand.moleculeName,
                colorPrimary: context.brand.colorPrimary,
                colorSecondary: context.brand.colorSecondary,
                indicationNames: context.brand.indicationNames,
                claims: context.claims.map((c) => c.text),
              });
              heroBlock.imageUrl = imageUrl;
            }
          }
        } catch {
          // Si falla, se deja sin imagen (el usuario puede subirla después)
        }
      })()
    : Promise.resolve();

  // Paso 4: Validar estructura
  onProgress?.({ step: 'validating', message: 'Validando contenido...' });
  const [issues] = await Promise.all([
    validateMailingResponse(response, context),
    imagePromise,
  ]);

  // Aplicar correcciones automáticas si hay issues reparables
  if (issues.length > 0) {
    autoFixIssues(response, issues, context);
  }

  onProgress?.({ step: 'done', message: 'Email generado' });
  return response;
}

function applyStructuredInputsToBlocks(
  blocks: MailingBlockContent[],
  options: AIMailingContext['options'] | undefined,
): void {
  if (!options) return;

  const eventDetails = options.eventDetails;
  const speakerDetails = options.speakerDetails;
  const joinedEventSpeakers = eventDetails?.speakers && eventDetails.speakers.length > 0
    ? eventDetails.speakers.join(', ')
    : undefined;

  if (eventDetails && (eventDetails.date || eventDetails.time || joinedEventSpeakers)) {
    for (const block of blocks) {
      if (block.type !== 'event') continue;
      const s = { ...(block.style || {}) };
      if (eventDetails.date) s.eventDate = eventDetails.date;
      if (eventDetails.time) s.eventTime = eventDetails.time;
      if (joinedEventSpeakers) s.eventSpeaker = joinedEventSpeakers;
      block.style = s;
    }
  }

  if (speakerDetails?.name) {
    for (const block of blocks) {
      if (block.type !== 'speaker') continue;
      const s = { ...(block.style || {}) };
      s.speakerName = speakerDetails.name;
      block.style = s;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT — Específico para mailing
// ═══════════════════════════════════════════════════════════

function buildMailingSystemPrompt(context: AIMailingContext): string {
  const { brand, claims, insights, availableTemplates, systemRules } = context;
  const promptLower = context.userPrompt.toLowerCase();
  const eventDetails = context.options?.eventDetails;
  const speakerDetails = context.options?.speakerDetails;

  // Claims agrupados por indicación
  const claimsByIndication = new Map<string, string[]>();
  for (const claim of claims) {
    const list = claimsByIndication.get(claim.indicationName) || [];
    list.push(claim.text);
    claimsByIndication.set(claim.indicationName, list);
  }

  const claimsSection = claims.length > 0
    ? Array.from(claimsByIndication.entries())
        .map(([ind, texts]) => `  ${ind}:\n${texts.map((t) => `    - ${t}`).join('\n')}`)
        .join('\n')
    : '  (No hay claims aprobados — genera contenido informativo genérico sobre la marca)';

  const insightsSection = insights.length > 0
    ? insights
        .slice(0, 10) // Limitar a 10 para no exceder tokens
        .map((i) => {
          const ref = i.references[0];
          const refText = ref ? ` [Ref: ${ref.documentName}${ref.page ? `, p.${ref.page}` : ''}]` : '';
          return `  - [${i.category}] ${i.text}${refText}`;
        })
        .join('\n')
    : '  (No hay insights disponibles)';

  const templatesSection = availableTemplates
    .map((t) => `  - ${t.id}: ${t.name} (${t.tags.join(', ')}) → ${t.blockSummary}`)
    .join('\n');

  // Prompt por tipo de email
  const typePrompts: Record<string, string> = {
    'promocional': 'Enfócate en el CTA principal. Usa hero image impactante. Máximo 3 bloques de contenido antes del CTA.',
    'informativo': 'Estructura con bullets y datos clínicos. Tono profesional y objetivo. Incluye referencias.',
    'newsletter': 'Formato multi-sección con separadores. 3-4 secciones temáticas. Títulos descriptivos.',
    'invitación': 'Destacar fecha/hora/lugar. CTA urgente. Incluir speaker/ponente si se menciona.',
    'científico': 'Priorizar datos duros. Incluir bloque de citas. Tono académico. Fuentes verificables.',
    'aviso_breve': 'Máximo 3 bloques de contenido. Directo al punto. Un solo CTA claro.',
  };
  const typeInstruction = context.emailType ? typePrompts[context.emailType] || '' : '';

  // Tono
  const toneMap: Record<string, string> = {
    'profesional': 'Tono profesional y formal, adecuado para médicos especialistas.',
    'cercano': 'Tono cercano y accesible, pero siempre profesional.',
    'académico': 'Tono académico y científico, con terminología técnica apropiada.',
    'urgente': 'Tono directo y con sentido de urgencia, sin ser alarmista.',
  };
  const toneInstruction = context.options?.tone ? toneMap[context.options.tone] || '' : '';

  // Longitud
  const lengthMap: Record<string, string> = {
    'corto': 'Email breve: máximo 4-5 bloques de contenido (sin contar header/footer/spacer/divider).',
    'medio': 'Email de longitud media: 6-8 bloques de contenido.',
    'largo': 'Email completo: 8-12 bloques de contenido con múltiples secciones.',
  };
  const lengthInstruction = context.options?.length ? lengthMap[context.options.length] || '' : '';

  // Bloques seleccionados por el usuario
  const selectedBlocks = context.options?.selectedBlocks;
  const blocksInstruction = selectedBlocks && selectedBlocks.length > 0
    ? `ESTRUCTURA DE BLOQUES OBLIGATORIA:
El email DEBE contener exactamente estos bloques de contenido (además de header y footer que son obligatorios):
${selectedBlocks.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}
Respeta este orden. NO agregues bloques de contenido adicionales que no estén en esta lista.`
    : '';
  const shouldPrioritizeSpeaker = !selectedBlocks?.includes('speaker') && /(speaker|ponente|expositor|charla|webinar|simposio|conferencia|panelista)/i.test(promptLower);
  const speakerInstruction = shouldPrioritizeSpeaker
    ? 'El prompt sugiere que hay un ponente o expositor. Incluye obligatoriamente un bloque speaker dedicado además del bloque event si corresponde.'
    : '';
  const eventInputInstruction = eventDetails && (eventDetails.date || eventDetails.time || (eventDetails.speakers && eventDetails.speakers.length > 0))
    ? `Usa estos datos explícitos del evento en el bloque event (si existe):
- Fecha: ${eventDetails.date || '(no especificada)'}
- Hora: ${eventDetails.time || '(no especificada)'}
- Speaker(s): ${eventDetails.speakers && eventDetails.speakers.length > 0 ? eventDetails.speakers.join(', ') : '(no especificado)'}
Si falta algún dato, completa solo lo no especificado con valores razonables.`
    : '';
  const speakerInputInstruction = speakerDetails?.name
    ? `Si existe bloque speaker, el campo style.speakerName DEBE ser exactamente: "${speakerDetails.name}".`
    : '';

  // TextBank — corpus de textos anteriores de la marca
  let textBankSection = '';
  if (context.textBank && context.textBank.totalEmails > 0) {
    const tb = context.textBank;
    const parts: string[] = [
      `La marca tiene ${tb.totalEmails} emails previos.`,
    ];
    if (tb.recentSubjects.length > 0) {
      parts.push(`Subjects recientes: ${tb.recentSubjects.slice(0, 5).map(s => `"${s}"`).join(', ')}`);
    }
    if (tb.recentTitles.length > 0) {
      parts.push(`Títulos usados: ${tb.recentTitles.slice(0, 5).map(s => `"${s}"`).join(', ')}`);
    }
    if (tb.recentCTAs.length > 0) {
      parts.push(`CTAs habituales: ${tb.recentCTAs.slice(0, 5).map(s => `"${s}"`).join(', ')}`);
    }
    if (tb.preferredTone) {
      parts.push(`Tono habitual: ${tb.preferredTone}`);
    }
    if (tb.commonBlockSequences.length > 0) {
      parts.push(`Estructuras comunes: ${tb.commonBlockSequences.slice(0, 2).join(' | ')}`);
    }
    parts.push('IMPORTANTE: Mantén coherencia con el estilo de la marca pero NO repitas textos anteriores. Genera contenido nuevo y complementario.');
    textBankSection = `\n═══ BANCO DE TEXTOS DE LA MARCA ═══\n${parts.join('\n')}`;
  }

  return `ERES un experto en email marketing farmacéutico y diseño de mailings para la industria de salud.

Tu trabajo es crear emails HTML profesionales que cumplan con:
1. Regulaciones farmacéuticas (incluir disclaimer obligatorio)
2. Identidad visual de la marca (colores, tipografías, logos exactos)
3. Contenido basado EXCLUSIVAMENTE en claims aprobados e insights científicos validados
4. Compatibilidad con clientes de email (Outlook, Gmail, Apple Mail)

═══ MARCA ═══
Nombre: ${brand.name}
Molécula: ${brand.moleculeName}
Indicaciones: ${brand.indicationNames.join(', ')}

═══ IDENTIDAD VISUAL ═══
- Color primario: ${brand.colorPrimary}
- Color secundario: ${brand.colorSecondary}
- Tipografía títulos: ${brand.fontTitle}
- Tipografía cuerpo: ${brand.fontBody}
- Logo: disponible (será insertado automáticamente en header y footer)
${brand.disclaimerBadge ? `- Disclaimer obligatorio: "${brand.disclaimerBadge}"` : ''}
${brand.communicationTone ? `- Tono de comunicación de la marca: ${brand.communicationTone}` : ''}

═══ CLAIMS APROBADOS (USAR SOLO ESTOS) ═══
${claimsSection}

═══ INSIGHTS CIENTÍFICOS VALIDADOS ═══
${insightsSection}

═══ TEMPLATES DISPONIBLES (elige uno como base) ═══
${templatesSection}

═══ REGLAS ESTRICTAS ═══
- NO inventar datos, cifras o porcentajes que no estén en los claims/insights
- NO usar superlativos sin respaldo ("el mejor", "el más efectivo")
- SIEMPRE incluir disclaimer farmacéutico en el footer
- SIEMPRE incluir un bloque header y un bloque footer
- Subject line: máximo ${systemRules.maxSubjectLength} caracteres
- Preheader: máximo ${systemRules.maxPreheaderLength} caracteres
- Texto de botón CTA: máximo ${systemRules.maxCtaTextLength} caracteres (2-4 palabras)
- Bullets: máximo ${systemRules.maxBulletItems} ítems, cada uno máximo ${systemRules.maxBulletItemLength} chars
- Usar los colores de marca exactos (${brand.colorPrimary} y ${brand.colorSecondary})
${typeInstruction ? `\n═══ INSTRUCCIÓN POR TIPO ═══\n${typeInstruction}` : ''}
${toneInstruction ? `\n═══ TONO ═══\n${toneInstruction}` : ''}
${lengthInstruction ? `\n═══ LONGITUD ═══\n${lengthInstruction}` : ''}
${blocksInstruction ? `\n═══ BLOQUES SELECCIONADOS ═══\n${blocksInstruction}` : ''}
${speakerInstruction ? `\n═══ HEURÍSTICA DE SPEAKER ═══\n${speakerInstruction}` : ''}
${eventInputInstruction ? `\n═══ DATOS DE EVENTO INGRESADOS ═══\n${eventInputInstruction}` : ''}
${speakerInputInstruction ? `\n═══ DATOS DE SPEAKER INGRESADOS ═══\n${speakerInputInstruction}` : ''}
${textBankSection}

═══ FORMATO DE RESPUESTA ═══
Devuelve SOLO un JSON válido (sin markdown, sin \`\`\`json) con esta estructura exacta:

{
  "templateId": "sys-xxx",
  "projectName": "...",
  "subject": "...",
  "emailSettings": {
    "preheaderText": "...",
    "bodyBackground": "#f4f4f8",
    "containerWidth": 600,
    "borderRadius": 12
  },
  "blocks": [
    {
      "id": "ai_[type]_[n]",
      "type": "header|hero|text|image|cta|event|speaker|footer|spacer|divider|bullets|columns|quote|social|video",
      "content": "...",
      "imageUrl": "...",
      "ctaText": "...",
      "ctaUrl": "...",
      "videoUrl": "...",
      "quoteAuthor": "...",
      "socialLinks": [{"platform": "linkedin", "url": ""}],
      "style": {
        "...": "keys exactas del editor (ver reglas abajo)"
      }
    }
  ],
  "reasoning": "..."
}

═══ REGLA CRÍTICA: SOLO TEXTO PLANO EN CONTENT ═══
TODOS los campos "content" deben ser TEXTO PLANO. NUNCA uses etiquetas HTML como <strong>, <em>, <b>, <i>, <p>, <br>, <h1>, <h2>, <h3>, <span>, <ul>, <li>, <a>, <div>, etc.
Para saltos de línea usa \n (barra invertida + n), NO <br> ni <br/>.
El sistema de renderizado agrega automáticamente el formato visual (negritas, itálicas, headings, bullets, etc.) según el tipo de bloque y sus propiedades de style.

═══ REGLAS DE CONTENIDO POR TIPO DE BLOQUE ═══
- header: content = nombre de marca (texto plano). style: textAlign, textTransform, headerDate ("__hide__" para ocultar)
- hero: content = alt text (texto plano). imageUrl = "" (DEJAR VACÍO, se asigna automáticamente). style: heroTitle (máx 60 chars, texto plano), heroSubtitle (máx 100 chars, texto plano)
- text (título): content = título corto (texto plano, SIN etiquetas HTML). style: headingLevel ("h1"|"h2"|"h3"|"h4"), fontWeight="bold", accentBarColor="${brand.colorPrimary}"
- text (párrafo): content = párrafo (texto plano, 40-80 palabras, usa \n para saltos de línea). style: fontSize, color, textAlign
- bullets: content = un punto por línea separados con \n (texto plano, SIN viñetas •, SIN números, SIN HTML). style: bulletStyle ("number"|"bullet"|"letter"), bulletBadgeBg="${brand.colorPrimary}"
- cta: content = etiqueta superior en texto plano (o vacío). ctaText = texto del botón (texto plano, 2-4 palabras). ctaUrl = URL. style: bandBgColor="${brand.colorPrimary}", btnBgColor="#ffffff", btnTextColor="${brand.colorPrimary}" (SIEMPRE usar estos valores exactos para asegurar contraste)
- event: content = etiqueta superior opcional (texto plano). ctaText = texto del botón (2-4 palabras, ej: "Inscribirse"). ctaUrl = URL de inscripción. style: eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventSpeaker, eventCapacity, eventMode, bandBgColor="${brand.colorPrimary}", btnBgColor="#ffffff", btnTextColor="${brand.colorPrimary}"
- speaker: content = etiqueta superior opcional (texto plano, ej: "Speaker invitado"). imageUrl = foto del speaker o "" si no la tienes. style: speakerName, speakerRole, speakerBio, speakerOrg, speakerImageShape ("circle"|"rounded"), speakerCardBg, speakerVariant ("classic"|"spotlight")
- quote: content = texto de la cita (texto plano, SIN comillas decorativas, SIN icono). quoteAuthor = autor (texto plano). style: quoteIcon ("❝" o un emoji, NO escribir el icono en content), quoteBg, quoteBorder, quoteAuthorColor. IMPORTANTE: El icono decorativo se agrega automáticamente vía style.quoteIcon, NO lo incluyas en content.
- footer: content = disclaimer breve (MÁXIMO 130 caracteres, texto plano). Debe ser conciso: solo lo esencial del aviso legal. socialLinks = redes sociales. style: footerQrUrl, footerCompanyInfo
- columns: content DEBE usar el separador ||| para dividir columnas. Formato EXACTO: "Texto columna izquierda|||Texto columna derecha". EJEMPLO: "Eficacia comprobada en estudios clínicos|||Perfil de seguridad favorable". Si no incluyes el separador |||, todo el texto aparecerá solo en la columna izquierda. style: headingLevel, accentBar
- spacer: content = "" (vacío). style: spacerHeight ("8"-"120")
- divider: content = "" (vacío). style: dividerColor, dividerDotColor="${brand.colorPrimary}"
- social: content = texto opcional (texto plano). socialLinks = redes. style: socialBtnStyle, socialBtnColor
- image: content = descripción de la imagen (texto plano). imageUrl = "" (DEJAR VACÍO, se asigna automáticamente)
- video: content = título (texto plano). videoUrl = URL del video

═══ REGLAS DE CONTRASTE Y COLOR ═══
- Si usas un fondo oscuro (bandBgColor oscuro, quoteBg oscuro), el texto DEBE ser claro (#ffffff o similar)
- Si usas un fondo claro, el texto DEBE ser oscuro (#333333 o similar)
- NUNCA pongas texto blanco sobre fondo claro ni texto oscuro sobre fondo oscuro
- Para CTA: si bandBgColor es oscuro, usa btnBgColor="#ffffff" y btnTextColor=color oscuro
- Para quote: quoteBg DEBE ser un color muy claro/pastel. El texto de la cita debe ser oscuro (#333 o #555)
- style.color en bloques de texto siempre debe contrastar con el fondo del email (generalmente blanco)

═══ ESTILOS COMUNES DISPONIBLES (opcionales) ═══
fontFamily, fontSize ("10"-"48"), color (HEX), textAlign ("left"|"center"|"right"), textTransform, fontWeight ("bold"|undefined)`;
}

// ═══════════════════════════════════════════════════════════
// LLAMADA A GEMINI
// ═══════════════════════════════════════════════════════════

const GEMINI_TIMEOUT_MS = 60_000;
const DEEPSEEK_TIMEOUT_MS = 90_000;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) return callDeepSeek(systemPrompt, userMessage);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout (60s)')), GEMINI_TIMEOUT_MS),
    );

    const result = await Promise.race([
      model.generateContent(userMessage),
      timeoutPromise,
    ]);

    const text = result.response.text();
    if (!text) throw new Error('Gemini devolvió respuesta vacía');
    return text;
  } catch (err) {
    console.warn('Gemini falló, intentando DeepSeek:', err);
    return callDeepSeek(systemPrompt, userMessage);
  }
}

async function callDeepSeek(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;
  if (!apiKey) throw new Error('No hay API keys disponibles (Gemini + DeepSeek)');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 8192,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('DeepSeek devolvió respuesta vacía');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('DeepSeek tardó demasiado en responder (timeout 90s).');
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// PARSER — Extrae AIMailingResponse del texto de la IA
// ═══════════════════════════════════════════════════════════

function parseAIMailingResponse(text: string): AIMailingResponse {
  // Patrón 1: ```json ... ```
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    try {
      return validateParsedResponse(JSON.parse(fencedMatch[1].trim()));
    } catch { /* continuar */ }
  }

  // Patrón 2: ``` { ... } ```
  const backtickMatch = text.match(/```\s*(\{[\s\S]*?\})\s*```/);
  if (backtickMatch) {
    try {
      return validateParsedResponse(JSON.parse(backtickMatch[1].trim()));
    } catch { /* continuar */ }
  }

  // Patrón 3: JSON suelto (buscar el objeto más grande)
  const jsonMatches = text.match(/\{[\s\S]{100,}\}/g);
  if (jsonMatches) {
    // Ordenar por longitud descendente (el más largo probablemente es el correcto)
    const sorted = jsonMatches.sort((a, b) => b.length - a.length);
    for (const block of sorted) {
      if (!block.includes('"blocks"') || !block.includes('"templateId"')) continue;
      try {
        return validateParsedResponse(JSON.parse(block));
      } catch { /* continuar */ }
    }
  }

  // Patrón 4: Intentar parsear el texto completo
  try {
    return validateParsedResponse(JSON.parse(text.trim()));
  } catch {
    throw new Error('No se pudo parsear la respuesta de la IA como JSON válido');
  }
}

function validateParsedResponse(data: unknown): AIMailingResponse {
  const obj = data as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') {
    throw new Error('Respuesta no es un objeto JSON');
  }
  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0) {
    throw new Error('La respuesta no contiene bloques');
  }
  if (typeof obj.subject !== 'string') {
    throw new Error('La respuesta no contiene subject');
  }

  // Asegurar que cada bloque tiene id y type
  const blocks: MailingBlockContent[] = (obj.blocks as Record<string, unknown>[]).map(
    (block, i) => ({
      id: (block.id as string) || `ai_block_${i + 1}`,
      type: block.type as MailingBlockContent['type'],
      content: stripHtmlTags((block.content as string) || ''),
      imageUrl: block.imageUrl as string | undefined,
      ctaText: stripHtmlTags((block.ctaText as string) || '') || undefined,
      ctaUrl: block.ctaUrl as string | undefined,
      videoUrl: block.videoUrl as string | undefined,
      quoteAuthor: stripHtmlTags((block.quoteAuthor as string) || '') || undefined,
      socialLinks: block.socialLinks as MailingBlockContent['socialLinks'],
      backgroundColor: block.backgroundColor as string | undefined,
      backgroundImage: block.backgroundImage as string | undefined,
      paddingTop: block.paddingTop as number | undefined,
      paddingBottom: block.paddingBottom as number | undefined,
      paddingLeft: block.paddingLeft as number | undefined,
      paddingRight: block.paddingRight as number | undefined,
      style: sanitizeBlockStyle((block.style as Record<string, string>) || {}),
    }),
  );

  const emailSettings = (obj.emailSettings as Record<string, unknown>) || {};

  return {
    templateId: (obj.templateId as string) || 'sys-minimal',
    projectName: (obj.projectName as string) || 'Email generado con IA',
    subject: obj.subject as string,
    emailSettings: {
      preheaderText: emailSettings.preheaderText as string | undefined,
      bodyBackground: (emailSettings.bodyBackground as string) || '#f4f4f8',
      containerWidth: (emailSettings.containerWidth as number) || 600,
      borderRadius: (emailSettings.borderRadius as number) ?? 12,
    },
    blocks,
    reasoning: (obj.reasoning as string) || '',
  };
}

// ═══════════════════════════════════════════════════════════
// POST-PROCESO — Aplicar estilos de marca
// ═══════════════════════════════════════════════════════════

function applyBrandStylesToBlocks(
  blocks: MailingBlockContent[],
  brand: AIMailingContext['brand'],
): MailingBlockContent[] {
  return blocks.map((block) => {
    const s = { ...(block.style || {}) };

    switch (block.type) {
      case 'header':
        if (!block.imageUrl) block.imageUrl = brand.logoUrl;
        // Si hay logo, limpiar content para que solo se muestre la imagen
        if (block.imageUrl) {
          block.content = '';
        }
        // El texto del header siempre debe ser blanco (fondo es gradiente de marca)
        s.color = '#ffffff';
        break;

      case 'text':
        if (s.fontWeight === 'bold' || s.headingLevel) {
          if (!s.color) s.color = brand.colorPrimary;
          if (!s.accentBarColor) s.accentBarColor = brand.colorPrimary;
        }
        break;

      case 'bullets':
        if (!s.bulletBadgeBg) s.bulletBadgeBg = brand.colorPrimary;
        break;

      case 'cta':
        // Siempre forzar colores de marca para buen contraste
        s.bandBgColor = brand.colorPrimary;
        s.btnBgColor = '#ffffff';
        s.btnTextColor = brand.colorPrimary;
        break;

      case 'event':
        s.bandBgColor = brand.colorPrimary;
        s.btnBgColor = '#ffffff';
        s.btnTextColor = brand.colorPrimary;
        if (!s.eventTitle) s.eventTitle = 'Actualización científica exclusiva';
        if (!s.eventDescription) s.eventDescription = 'Revisa evidencia clínica relevante y participa en una conversación práctica con especialistas.';
        if (!s.eventDate) s.eventDate = 'Jueves 12 de junio';
        if (!s.eventTime) s.eventTime = '19:00 h';
        if (!s.eventLocation) s.eventLocation = 'Streaming en vivo';
        if (!s.eventSpeaker) s.eventSpeaker = 'Dra. Valentina Rojas';
        if (!s.eventCapacity) s.eventCapacity = '120 cupos';
        if (!s.eventMode) s.eventMode = 'Online';
        if (!block.ctaText) block.ctaText = 'Inscribirse';
        break;

      case 'speaker':
        if (!s.speakerName) s.speakerName = 'Dra. Valentina Rojas';
        if (!s.speakerRole) s.speakerRole = 'Especialista invitada';
        if (!s.speakerBio) s.speakerBio = 'Compartirá una mirada clínica práctica sobre evidencia reciente y aplicación en pacientes reales.';
        if (!s.speakerOrg) s.speakerOrg = 'Hospital Clínico';
        if (!s.speakerImageShape) s.speakerImageShape = 'circle';
        if (!s.speakerCardBg) s.speakerCardBg = '#f8fafc';
        if (!s.speakerVariant) s.speakerVariant = 'classic';
        break;

      case 'footer':
        if (brand.qrUrl && !s.footerQrUrl) s.footerQrUrl = brand.qrUrl;
        if (brand.disclaimerBadge && !block.content) {
          block.content = brand.disclaimerBadge;
        }
        break;

      case 'divider':
        if (!s.dividerDotColor) s.dividerDotColor = brand.colorPrimary;
        break;

      case 'quote':
        if (!s.quoteBorder) s.quoteBorder = brand.colorPrimary;
        if (!s.quoteAuthorColor) s.quoteAuthorColor = brand.colorPrimary;
        break;

      case 'social':
        if (!s.socialBtnColor) s.socialBtnColor = brand.colorPrimary;
        break;
    }

    return { ...block, style: s };
  });
}

// ═══════════════════════════════════════════════════════════
// VALIDACIÓN — Verificar estructura y contenido
// ═══════════════════════════════════════════════════════════

async function validateMailingResponse(
  response: AIMailingResponse,
  context: AIMailingContext,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const { blocks } = response;

  // Estructura obligatoria
  if (!blocks.some((b) => b.type === 'header')) {
    issues.push({ type: 'error', message: 'Falta bloque header' });
  }
  if (!blocks.some((b) => b.type === 'footer')) {
    issues.push({ type: 'error', message: 'Falta bloque footer' });
  }

  // Subject length
  if (response.subject.length > CHAR_LIMITS.subject) {
    issues.push({ type: 'warning', message: `Subject excede ${CHAR_LIMITS.subject} chars` });
  }

  // Preheader length
  if (response.emailSettings.preheaderText &&
      response.emailSettings.preheaderText.length > CHAR_LIMITS.preheader) {
    issues.push({ type: 'warning', message: `Preheader excede ${CHAR_LIMITS.preheader} chars` });
  }

  // Disclaimer check
  const footer = blocks.find((b) => b.type === 'footer');
  if (footer && context.brand.disclaimerBadge) {
    if (!footer.content.includes(context.brand.disclaimerBadge)) {
      issues.push({
        type: 'warning',
        blockId: footer.id,
        message: 'Footer no incluye disclaimer de marca',
      });
    }
  }

  // CTA text length
  for (const block of blocks) {
    if ((block.type === 'cta' || block.type === 'event') && block.ctaText && block.ctaText.length > CHAR_LIMITS.cta_text) {
      issues.push({
        type: 'warning',
        blockId: block.id,
        message: `CTA text excede ${CHAR_LIMITS.cta_text} chars`,
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════
// AUTO-FIX — Correcciones automáticas para issues reparables
// ═══════════════════════════════════════════════════════════

function autoFixIssues(
  response: AIMailingResponse,
  issues: ValidationIssue[],
  context: AIMailingContext,
): void {
  for (const issue of issues) {
    // Agregar header si falta
    if (issue.message === 'Falta bloque header') {
      response.blocks.unshift({
        id: 'ai_header_fix',
        type: 'header',
        content: context.brand.name,
        imageUrl: context.brand.logoUrl,
        style: { textAlign: 'left', textTransform: 'uppercase' },
      });
    }

    // Agregar footer si falta
    if (issue.message === 'Falta bloque footer') {
      response.blocks.push({
        id: 'ai_footer_fix',
        type: 'footer',
        content: context.brand.disclaimerBadge || 'Material exclusivo para profesionales de la salud.',
        style: {},
      });
    }

    // Truncar subject
    if (issue.message.includes('Subject excede')) {
      response.subject = response.subject.slice(0, CHAR_LIMITS.subject - 3) + '...';
    }

    // Inyectar disclaimer en footer si falta
    if (issue.message === 'Footer no incluye disclaimer de marca' && issue.blockId) {
      const footer = response.blocks.find((b) => b.id === issue.blockId);
      if (footer && context.brand.disclaimerBadge) {
        footer.content = footer.content
          ? `${footer.content}\n\n${context.brand.disclaimerBadge}`
          : context.brand.disclaimerBadge;
      }
    }

    // Truncar CTA text
    if (issue.message.includes('CTA text excede') && issue.blockId) {
      const block = response.blocks.find((b) => b.id === issue.blockId);
      if (block?.ctaText) {
        block.ctaText = block.ctaText.slice(0, CHAR_LIMITS.cta_text);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// IMAGE PROMPT — Para hero image
// ═══════════════════════════════════════════════════════════

function buildImagePrompt(context: AIMailingContext, altText: string): string {
  return `Create a professional medical/pharmaceutical email hero image.
Brand: ${context.brand.name}
Molecule: ${context.brand.moleculeName}
Indications: ${context.brand.indicationNames.join(', ')}
Color palette: ${context.brand.colorPrimary}, ${context.brand.colorSecondary}
Context: ${altText || context.userPrompt}
Style: medical_photo
Format: 600x300px landscape, suitable for email header
RESTRICTIONS:
- Do NOT include any text, letters, words, or numbers in the image
- Do NOT include logos
- Professional and appropriate for medical context
- No identifiable real people`;
}
