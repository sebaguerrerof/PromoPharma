import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type {
  GenerationSession,
  ChatMessage,
  Brand,
  Template,
  Insight,
  BrochureLayoutSpec,
} from '@/types';

const SESSIONS = 'generationSessions';

// ── AI Providers ────────────────────────────────────────

export type AIProvider = 'gemini' | 'deepseek';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

/** Max mensajes de historial para evitar exceder tokens */
const MAX_HISTORY_MESSAGES = 10;

/** Detecta si un provider está disponible */
export function isProviderAvailable(provider: AIProvider): boolean {
  if (provider === 'gemini') return !!import.meta.env.VITE_GEMINI_API_KEY;
  if (provider === 'deepseek') return !!DEEPSEEK_API_KEY;
  return false;
}

export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (isProviderAvailable('gemini')) providers.push('gemini');
  if (isProviderAvailable('deepseek')) providers.push('deepseek');
  return providers;
}

interface GenerateResponse {
  message: string;
  slotValues: Record<string, string> | null;
  usage: { inputTokens: number; outputTokens: number };
}

// ── System prompt builder ───────────────────────────────

function buildSystemPrompt(
  brand: Brand,
  template: Template,
  insights: Insight[],
  indicationNames: string[],
  moleculeName: string | null,
  currentSlotValues: Record<string, string> | null,
  knowledgeContent?: string,
): string {
  const parts: string[] = [];

  parts.push(`Eres un redactor experto en marketing farmacéutico. Tu trabajo es generar contenido textual promocional para materiales de laboratorios farmacéuticos.

REGLAS ABSOLUTAS:
1. Solo puedes usar información de los INSIGHTS VALIDADOS que se te proporcionan.
2. NUNCA inventes claims médicos, estadísticas o datos que no estén en los insights.
3. NUNCA uses tu conocimiento general sobre fármacos — solo lo que te damos.
4. Cada afirmación debe poder rastrearse a un insight proporcionado.
5. Respeta los límites de caracteres de cada slot.
6. Escribe en español a menos que se indique lo contrario.

ESTILO VISUAL DEL TEXTO:
- Usa emojis y símbolos como viñetas e iconos para hacer el contenido más atractivo y visual.
- Ejemplos de emojis útiles: ✅ ✓ → • 💊 🔬 🧬 📊 📈 ⚕️ 🏥 💡 🎯 ⭐ 🔹 🔸 ▶ ◆ ★
- En TÍTULOS: incluye un emoji relevante al inicio (ej: "💊 Eficacia comprobada", "🎯 Indicaciones principales").
- En BULLETS/LISTAS: usa un emoji diferente y relevante como viñeta para cada punto (ej: "✅ Reducción del 30%...", "🔬 Estudios clínicos demuestran...").
- En SUBTÍTULOS: usa símbolos decorativos (ej: "▶ Mecanismo de acción", "◆ Beneficios clave").
- Haz que el contenido se sienta premium, profesional y visualmente atractivo — no plano ni genérico.
- Varía los emojis — no repitas el mismo emoji para todos los bullets.
- Usa negritas con ** cuando el formato lo permita para resaltar datos clave.`);

  parts.push(`\nMARCA: "${brand.name}"
- Tipografía títulos: ${brand.params.fontTitle}
- Tipografía cuerpo: ${brand.params.fontBody}
- Color primario: ${brand.params.colorPrimary}
- Color secundario: ${brand.params.colorSecondary}`);

  if (brand.params.claims && brand.params.claims.length > 0) {
    // Group claims by indication
    const grouped = brand.params.claims.reduce<Record<string, string[]>>((acc, c) => {
      const key = c.indicationName || 'General';
      if (!acc[key]) acc[key] = [];
      acc[key].push(c.text);
      return acc;
    }, {});
    let claimsBlock = '\nCLAIMS APROBADOS DE LA MARCA (puedes usarlos textualmente):';
    for (const [indication, texts] of Object.entries(grouped)) {
      claimsBlock += `\n  [${indication}]`;
      texts.forEach((t, i) => { claimsBlock += `\n    ${i + 1}. ${t}`; });
    }
    parts.push(claimsBlock);
  }

  if (moleculeName) parts.push(`\nMOLÉCULA: ${moleculeName}`);
  if (indicationNames.length > 0) {
    parts.push(`INDICACIONES:\n${indicationNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
  }

  if (insights.length > 0) {
    parts.push(`\nINSIGHTS VALIDADOS (tu ÚNICA fuente de información):`);
    insights.forEach((ins, i) => {
      let block = `\n[Insight ${i + 1}] (${ins.category}): "${ins.text}"`;
      if (ins.references?.length > 0) {
        block += `\n  Referencias:`;
        ins.references.forEach((ref) => {
          block += `\n    - Doc: ${ref.documentName}`;
          if (ref.page) block += `, pág. ${ref.page}`;
          if (ref.section) block += `, sección: ${ref.section}`;
          if (ref.quote) block += `\n      Cita: "${ref.quote}"`;
        });
      }
      parts.push(block);
    });
  } else {
    parts.push(`\nNOTA: No hay insights validados. Solo puedes generar contenido genérico sin claims específicos.`);
  }

  const textSlots = template.slots.filter((s) => s.type !== 'image');

  parts.push(`\nPLANTILLA: "${template.name}"\nSLOTS DE TEXTO A COMPLETAR (ignora los de imagen, esos se generan aparte):`);
  textSlots.forEach((slot) => {
    let desc = `- ${slot.id} (${slot.name}): tipo=${slot.type}, máx ${slot.maxLength} chars`;
    if (slot.type === 'bullets' && slot.maxItems) {
      desc += `, ${slot.maxItems} items, máx ${slot.maxItemLength ?? slot.maxLength} chars c/u`;
    }
    if (slot.required) desc += ' [OBLIGATORIO]';
    parts.push(desc);
  });

  if (template.format === 'pptx') {
    parts.push(`\nIMPORTANTE: Esta plantilla es una PRESENTACIÓN de múltiples slides.
DEBES generar contenido para TODOS los slides (${textSlots.length} slots de texto).
No generes solo el primer slide — genera la presentación COMPLETA con todos los slides.`);
  }

  // Multi-page PDF templates (folletos)
  if (template.format === 'pdf' && textSlots.length > 3) {
    const pageHint = currentSlotValues?.['__page_count'];
    const pageNum = pageHint ? parseInt(pageHint) || 0 : 0;
    if (pageNum > 1) {
      parts.push(`\nIMPORTANTE: Este material tiene ${pageNum} PÁGINAS.
DEBES generar contenido para TODAS las ${pageNum} páginas (${textSlots.length} slots de texto en total).
Los slots cuerpo_1, cuerpo_2, cuerpo_3... corresponden a cada página.
No generes solo las primeras 2 páginas — genera la publicación COMPLETA con todas las páginas.
Cada página debe tener contenido relevante, variado y complementario que aporte valor al lector.`);
    }
  }

  // Brochure-locked mode: force strong design consistency when session comes from an uploaded brochure.
  const designMode = currentSlotValues?.['__design_mode'];
  if (designMode === 'brochure_locked') {
    const brochureName = currentSlotValues?.['__brochure_source_name'] ?? 'folleto base';
    const brochureStyle = currentSlotValues?.['__brochure_style'] ?? 'no especificado';
    let brochureColors: string[] = [];
    let brochureFonts: string[] = [];

    try {
      brochureColors = JSON.parse(currentSlotValues?.['__brochure_colors'] ?? '[]') as string[];
    } catch {
      brochureColors = [];
    }
    try {
      brochureFonts = JSON.parse(currentSlotValues?.['__brochure_fonts'] ?? '[]') as string[];
    } catch {
      brochureFonts = [];
    }

    parts.push(`\nMODO BROCHURE BLOQUEADO (sesión creada desde folleto existente):
- Folleto de referencia: "${brochureName}"
- Estilo detectado: ${brochureStyle}
- Colores detectados: ${brochureColors.length > 0 ? brochureColors.join(', ') : 'no disponibles'}
- Tipografías detectadas: ${brochureFonts.length > 0 ? brochureFonts.join(', ') : 'no disponibles'}

REGLAS OBLIGATORIAS DE CONSISTENCIA VISUAL:
1. Mantén la misma jerarquía editorial (titulares, subtítulos, cuerpo, callouts y bullets) del folleto base.
2. No propongas cambios de layout ni reordenamientos drásticos de secciones.
3. Conserva tono visual y densidad de contenido similares al folleto original.
4. Enfócate en actualizar SOLO el copy y los datos aprobados (claims/insights), no el diseño.
5. Evita sugerencias de rediseño total, cambio de estilo o variaciones creativas de composición.`);
  }

  if (designMode === 'brochure_locked') {
    parts.push(`\nMODO DE RESPUESTA (BROCHURE BLOQUEADO):
- En la PRIMERA respuesta, genera contenido para TODOS los slots de texto (${textSlots.length} slots).
- En respuestas posteriores, modifica SOLO los slots solicitados por el usuario.
- NO propongas ni sugieras cambios de diseño, layout o estilo visual.
- Mantén estructura, densidad y tono editorial del folleto base.

PARÁMETROS VISUALES DEL LOGO:
Puedes modificar "__logo_scale", "__logo_x" y "__logo_y" SOLO cuando el usuario lo solicite explícitamente.

FORMATO DE RESPUESTA:
Cuando generes o modifiques contenido, incluye un bloque JSON al final:
\`\`\`json
{
${textSlots.map((s) => `  "${s.id}": "${s.type === 'bullets' ? '["item1", "item2"]' : 'texto generado'}"`).join(',\n')}
}
\`\`\`
Antes del JSON incluye una breve explicación enfocada en actualización de contenido (no en rediseño).
Si el usuario hace preguntas generales o conversa, responde sin JSON.`);
  } else {
    parts.push(`\nFLEXIBILIDAD EN LA GENERACIÓN:
- En la PRIMERA respuesta, genera contenido para TODOS los slots de texto (${textSlots.length} slots).
- En las respuestas posteriores, SOLO modifica los slots que el usuario mencione o pida cambiar.
- Si el usuario pide ajustar algo específico (ej: "cambia el título"), devuelve el JSON completo pero SOLO modifica lo pedido.
- Si el usuario hace preguntas, conversa o pide ideas, responde de forma natural SIN incluir JSON.
- Sé creativo y adaptable — no seas rígido. Escucha lo que el usuario pide y responde acorde.
- Si el usuario quiere un enfoque diferente, un tono distinto o cambiar la dirección creativa, hazlo sin problema.

PARÁMETROS VISUALES DEL LOGO:
Además de los slots de texto, PUEDES modificar el tamaño y la posición del logo.
Para hacerlo, incluye estos campos especiales en tu JSON:
- "__logo_scale": un número entre 0.5 y 3.0 (tamaño del logo, 1.0 = tamaño normal por defecto)
- "__logo_x": un número entre -50 y 50 (desplazamiento horizontal en píxeles, 0 = posición original)
- "__logo_y": un número entre -50 y 50 (desplazamiento vertical en píxeles, 0 = posición original)
Solo inclúyelos cuando el usuario lo pida explícitamente.

FORMATO DE RESPUESTA:
Cuando generes o modifiques contenido, incluye un bloque JSON al final:
\`\`\`json
{
${textSlots.map((s) => `  "${s.id}": "${s.type === 'bullets' ? '["item1", "item2"]' : 'texto generado'}"`).join(',\n')}
}
\`\`\`
Antes del JSON incluye una breve explicación de las decisiones creativas.
Si el usuario hace preguntas generales o conversa, responde sin JSON.`);
  }

  if (knowledgeContent) {
    parts.push(`\nBANCO DE CONOCIMIENTO (materiales de referencia aprobados — úsalos como guía de estilo, tono, estructura y contenido):`);
    parts.push(knowledgeContent);
  }

  if (currentSlotValues && Object.keys(currentSlotValues).length > 0) {
    parts.push(`\nVALORES ACTUALES DE SLOTS:`);
    Object.entries(currentSlotValues).forEach(([key, value]) => {
      if (key === '__layout_spec') {
        parts.push(`- ${key}: [layout-spec-bloqueado]`);
        return;
      }
      // Filtrar imágenes base64 del prompt — ocupan cientos de miles de tokens
      if (value.startsWith('data:image') || value.startsWith('https://')) {
        parts.push(`- ${key}: [imagen generada]`);
      } else {
        parts.push(`- ${key}: "${value}"`);
      }
    });
    parts.push(`Modifica solo los slots mencionados, mantén el resto.`);
  }

  return parts.join('\n');
}

// ── Parser de JSON de slots ─────────────────────────────

function tryParseSlotValues(
  text: string,
  template: Template
): Record<string, string> | null {
  // Intentar múltiples patrones de extracción de JSON
  const patterns = [
    /```json\s*([\s\S]*?)```/i,           // ```json ... ```
    /```\s*(\{[\s\S]*?\})\s*```/,          // ``` { ... } ```
    /(?:^|\n)\s*(\{[\s\S]*?"[a-z_]+"[\s\S]*?\})\s*(?:$|\n)/m, // JSON suelto
  ];

  // Claves especiales de parámetros visuales
  const VISUAL_KEYS = ['__logo_scale', '__logo_x', '__logo_y'];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1].trim());
      if (typeof parsed !== 'object' || parsed === null) continue;
      const result: Record<string, string> = {};
      for (const slot of template.slots) {
        if (parsed[slot.id] !== undefined) {
          const value = parsed[slot.id];
          result[slot.id] = Array.isArray(value) ? value.join('\n') : String(value);
        }
      }
      // Extraer parámetros visuales especiales
      for (const key of VISUAL_KEYS) {
        if (parsed[key] !== undefined) {
          result[key] = String(parsed[key]);
        }
      }
      if (Object.keys(result).length > 0) return result;
    } catch {
      continue;
    }
  }

  // Último recurso: buscar el bloque JSON más grande que contenga IDs de slots conocidos
  const slotIds = template.slots.map((s) => s.id);
  const braceMatch = text.match(/\{[\s\S]{50,}\}/g);
  if (braceMatch) {
    for (const block of braceMatch) {
      if (!slotIds.some((id) => block.includes(`"${id}"`))) continue;
      try {
        const parsed = JSON.parse(block);
        const result: Record<string, string> = {};
        for (const slot of template.slots) {
          if (parsed[slot.id] !== undefined) {
            const value = parsed[slot.id];
            result[slot.id] = Array.isArray(value) ? value.join('\n') : String(value);
          }
        }
        for (const key of VISUAL_KEYS) {
          if (parsed[key] !== undefined) {
            result[key] = String(parsed[key]);
          }
        }
        if (Object.keys(result).length > 0) return result;
      } catch {
        continue;
      }
    }
  }

  return null;
}

// ── Sanitizar mensajes antes de enviar ──────────────────

/** Elimina datos base64 de los mensajes para reducir tokens */
function sanitizeMessageContent(content: string): string {
  // Reemplazar bloques data:image/...;base64,... por placeholder
  return content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[imagen-base64-omitida]');
}

/** Recorta historial para mantener solo los mensajes más recientes */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  // Siempre mantener el primer mensaje (el prompt inicial) y los últimos N
  const first = messages[0];
  const recent = messages.slice(-(MAX_HISTORY_MESSAGES - 1));
  return [first, ...recent];
}

// ── Llamar a Gemini ─────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  messages: ChatMessage[],
  template: Template,
): Promise<GenerateResponse> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  // Recortar y sanitizar historial
  const trimmed = trimHistory(messages);
  const history = trimmed.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: sanitizeMessageContent(m.content) }],
  }));

  const lastMessage = trimmed[trimmed.length - 1];

  const chat = model.startChat({ history });

  // Timeout de 60 segundos
  const timeoutMs = 60_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(
      'La IA tardó demasiado en responder. Verifica que no tengas un ad blocker bloqueando generativelanguage.googleapis.com y recarga la página.'
    )), timeoutMs)
  );

  const result = await Promise.race([
    chat.sendMessage(sanitizeMessageContent(lastMessage.content)),
    timeoutPromise,
  ]);
  const response = result.response;
  const text = response.text();

  if (!text) throw new Error('La IA no devolvió texto.');

  const slotValues = tryParseSlotValues(text, template);
  const usage = response.usageMetadata;

  return {
    message: text,
    slotValues,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
    },
  };
}

// ── Llamar a DeepSeek ───────────────────────────────────

async function callDeepSeek(
  systemPrompt: string,
  messages: ChatMessage[],
  template: Template,
): Promise<GenerateResponse> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API key no configurada. Agrega VITE_DEEPSEEK_API_KEY en tu archivo .env');
  }

  // Recortar y sanitizar historial
  const trimmed = trimHistory(messages);
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...trimmed.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: sanitizeMessageContent(m.content),
    })),
  ];

  const timeoutMs = 90_000; // DeepSeek puede ser un poco más lento
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        max_tokens: 8192,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as Record<string, Record<string, string>>;
      throw new Error(
        `DeepSeek API error ${res.status}: ${errBody?.error?.message ?? res.statusText}`
      );
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('DeepSeek no devolvió texto.');

    const slotValues = tryParseSlotValues(text, template);
    const usage = data.usage;

    return {
      message: text,
      slotValues,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('DeepSeek tardó demasiado en responder (timeout 90s).');
    }
    throw err;
  }
}

// ── API pública: llamar a la IA con fallback ────────────

export async function callGenerateContent(
  brand: Brand,
  template: Template,
  insights: Insight[],
  indicationNames: string[],
  moleculeName: string | null,
  messages: ChatMessage[],
  currentSlotValues: Record<string, string> | null,
  provider: AIProvider = 'gemini',
  knowledgeContent?: string,
): Promise<GenerateResponse & { provider: AIProvider }> {
  const systemPrompt = buildSystemPrompt(
    brand, template, insights, indicationNames, moleculeName, currentSlotValues, knowledgeContent
  );

  // Intentar con el provider seleccionado; si falla, intentar el alternativo
  const fallback: AIProvider = provider === 'gemini' ? 'deepseek' : 'gemini';

  try {
    const result = provider === 'deepseek'
      ? await callDeepSeek(systemPrompt, messages, template)
      : await callGemini(systemPrompt, messages, template);
    return { ...result, provider };
  } catch (primaryErr) {
    console.error(`[AI/${provider}] Error:`, primaryErr);

    // Intentar fallback si está disponible
    if (isProviderAvailable(fallback)) {
      console.info(`[AI] Intentando fallback con ${fallback}...`);
      try {
        const result = fallback === 'deepseek'
          ? await callDeepSeek(systemPrompt, messages, template)
          : await callGemini(systemPrompt, messages, template);
        return { ...result, provider: fallback };
      } catch (fallbackErr) {
        console.error(`[AI/${fallback}] Fallback también falló:`, fallbackErr);
        // Lanzar el error original (más relevante para el usuario)
      }
    }

    throw primaryErr;
  }
}

// ── Variantes A/B de copy ───────────────────────────────

export interface ABVariant {
  label: string;
  slotValues: Record<string, string>;
  tone: string;
}

/**
 * Genera 3 variantes A/B del contenido actual con tonos diferentes.
 * Retorna las variantes para que el usuario elija una.
 */
export async function generateABVariants(
  brand: Brand,
  template: Template,
  insights: Insight[],
  indicationNames: string[],
  moleculeName: string | null,
  currentSlotValues: Record<string, string>,
): Promise<ABVariant[]> {
  const slotNames = template.slots
    .filter(s => s.type !== 'image')
    .map(s => `"${s.id}" (${s.name}, tipo: ${s.type}, max: ${s.maxLength} chars)`)
    .join('\n');

  const currentContent = Object.entries(currentSlotValues)
    .filter(([, v]) => v?.trim() && !v.startsWith('http') && !v.startsWith('__'))
    .map(([k, v]) => `"${k}": "${v}"`)
    .join('\n');

  const claimsText = insights
    .filter(i => i.status === 'approved')
    .map(i => `- ${i.text}`)
    .join('\n');

  const prompt = `Eres un copywriter farmacéutico experto. Genera 3 VARIANTES del mismo contenido de marketing con diferentes tonos.

MARCA: "${brand.name}"
${moleculeName ? `MOLÉCULA: ${moleculeName}` : ''}
${indicationNames.length > 0 ? `INDICACIONES: ${indicationNames.join(', ')}` : ''}
PLANTILLA: "${template.name}"

SLOTS DISPONIBLES:
${slotNames}

CONTENIDO ACTUAL:
${currentContent}

CLAIMS APROBADOS:
${claimsText || 'Sin claims específicos'}

Genera EXACTAMENTE 3 variantes con estos tonos:
1. "Profesional y directo" — Lenguaje clínico, datos concretos, sin emociones
2. "Empático y cercano" — Enfoque en el paciente, emocional, humano
3. "Impactante y premium" — Bold, números destacados, llamativo

REGLAS:
- Respeta los caracteres máximos de cada slot
- NO inventes datos médicos — usa solo los claims proporcionados
- Escribe en español
- Para bullets, separa cada punto con \\n

Responde SOLO con un JSON array:
[
  { "label": "A", "tone": "Profesional y directo", "slotValues": { ... } },
  { "label": "B", "tone": "Empático y cercano", "slotValues": { ... } },
  { "label": "C", "tone": "Impactante y premium", "slotValues": { ... } }
]`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No se pudieron generar las variantes.');

  const parsed = JSON.parse(jsonMatch[0]) as ABVariant[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Formato de variantes inválido.');
  }

  return parsed.slice(0, 3);
}

// ── Regenerar un slot específico con IA ─────────────────

/**
 * Regenera el texto de UN slot específico según una instrucción del usuario.
 * Usa Gemini directamente con un prompt puntual (sin historial de chat).
 */
export async function regenerateSlotText(
  brand: Brand,
  template: Template,
  slotId: string,
  instruction: string,
  currentSlotValues: Record<string, string>,
  moleculeName: string | null,
  indicationNames: string[],
): Promise<string> {
  const slot = template.slots.find(s => s.id === slotId);
  if (!slot) throw new Error(`Slot "${slotId}" no encontrado.`);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const currentValue = currentSlotValues[slotId] || '';
  const maxLen = slot.maxLength || 500;

  let prompt = `Eres un redactor farmacéutico experto. Genera contenido para el campo "${slot.name}" (tipo: ${slot.type}) de un material promocional.

MARCA: "${brand.name}"
${moleculeName ? `MOLÉCULA: ${moleculeName}` : ''}
${indicationNames.length > 0 ? `INDICACIONES: ${indicationNames.join(', ')}` : ''}
PLANTILLA: "${template.name}"

RESTRICCIONES:
- Máximo ${maxLen} caracteres.
- Escribe en español.
- NO inventes datos médicos. Usa solo la información proporcionada.
${slot.type === 'bullets' ? `- Devuelve cada punto en una línea separada (uno por línea, sin viñetas ni numeración).
- Máximo ${slot.maxItems ?? 5} puntos de ${slot.maxItemLength ?? 80} caracteres cada uno.` : ''}

`;

  if (currentValue) {
    prompt += `\nCONTENIDO ACTUAL del campo:\n"${currentValue}"\n`;
  }

  prompt += `\nINSTRUCCIÓN DEL USUARIO:\n${instruction}\n`;
  prompt += `\nResponde SOLO con el texto final para el campo "${slot.name}". Sin explicaciones, sin JSON, sin comillas alrededor de la respuesta.`;

  const timeoutMs = 30_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: la IA tardó demasiado.')), timeoutMs)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise,
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no devolvió texto.');

  // Truncar si excede maxLength
  return text.slice(0, maxLen);
}

/**
 * Regenera TODOS los slots de texto según una instrucción general.
 * Retorna un Record con los valores nuevos para cada slot.
 */
export async function regenerateAllSlotsText(
  brand: Brand,
  template: Template,
  instruction: string,
  currentSlotValues: Record<string, string>,
  moleculeName: string | null,
  indicationNames: string[],
): Promise<Record<string, string>> {
  const textSlots = template.slots.filter(s => s.type !== 'image');
  if (textSlots.length === 0) throw new Error('No hay slots de texto.');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  let prompt = `Eres un redactor farmacéutico experto. Genera contenido para TODOS los campos de texto de un material promocional.

MARCA: "${brand.name}"
${moleculeName ? `MOLÉCULA: ${moleculeName}` : ''}
${indicationNames.length > 0 ? `INDICACIONES: ${indicationNames.join(', ')}` : ''}
PLANTILLA: "${template.name}"

CAMPOS A COMPLETAR:
${textSlots.map(s => `- "${s.id}" (${s.name}, tipo: ${s.type}, máx ${s.maxLength} chars)${s.type === 'bullets' ? ` — máx ${s.maxItems ?? 5} puntos, cada uno de máx ${s.maxItemLength ?? 80} chars, uno por línea` : ''}`).join('\n')}

RESTRICCIONES:
- Escribe en español.
- NO inventes datos médicos.
- Respeta los límites de caracteres de cada campo.

`;

  // Include current values
  const hasCurrent = textSlots.some(s => currentSlotValues[s.id]?.trim());
  if (hasCurrent) {
    prompt += `VALORES ACTUALES:\n`;
    textSlots.forEach(s => {
      const v = currentSlotValues[s.id];
      if (v?.trim()) prompt += `- ${s.id}: "${v}"\n`;
    });
  }

  prompt += `\nINSTRUCCIÓN DEL USUARIO:\n${instruction}\n`;
  prompt += `\nResponde SOLO con un bloque JSON con todos los campos:
\`\`\`json
{
${textSlots.map(s => `  "${s.id}": "texto generado"`).join(',\n')}
}
\`\`\``;

  const timeoutMs = 60_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: la IA tardó demasiado.')), timeoutMs)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise,
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no devolvió texto.');

  // Parse JSON from response
  const parsed = tryParseSlotValues(text, template);
  if (!parsed || Object.keys(parsed).length === 0) {
    throw new Error('No se pudo interpretar la respuesta de la IA.');
  }
  return parsed;
}

// ── Generador de Ideas de Campaña ───────────────────────

export interface CampaignIdea {
  title: string;
  description: string;
  suggestedPrompt: string;
  templateSuggestion?: string;
  style: string;
}

/**
 * Genera ideas de campaña proactivas basadas en el contexto de la marca.
 */
export async function generateCampaignIdeas(
  brand: Brand,
  insights: Insight[],
  moleculeName: string | null,
  indicationNames: string[],
  claims?: string[],
  knowledgeSummary?: string,
): Promise<CampaignIdea[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const topInsights = insights.slice(0, 10).map(i => `- ${i.text}`).join('\n');

  let prompt = `Eres un director creativo experto en marketing farmacéutico y pharma branding.

MARCA: "${brand.name}"
${moleculeName ? `MOLÉCULA: ${moleculeName}` : ''}
${indicationNames.length > 0 ? `INDICACIONES TERAPÉUTICAS: ${indicationNames.join(', ')}` : ''}
${claims && claims.length > 0 ? `CLAIMS APROBADOS:\n${claims.slice(0, 8).map(c => `- ${c}`).join('\n')}` : ''}
${topInsights ? `\nINSIGHTS DE MERCADO:\n${topInsights}` : ''}
${knowledgeSummary ? `\nCONTEXTO ADICIONAL:\n${knowledgeSummary}` : ''}

TIPOS DE PLANTILLA DISPONIBLES: folleto-2p (folleto 2 páginas), email-promo (email promocional), slide-deck (presentación), banner-congreso (banner para congreso).

Genera exactamente 4 ideas de campaña creativas, originales y profesionales para esta marca. Cada idea debe ser una campaña de marketing promocional realista para la industria farmacéutica.

RESPONDE SOLO con un bloque JSON con este formato exacto:
\`\`\`json
[
  {
    "title": "Nombre corto de la campaña (máx 50 chars)",
    "description": "Descripción breve del concepto creativo (máx 150 chars)",
    "suggestedPrompt": "Prompt detallado que el usuario puede usar para generar el contenido (en español, 100-200 chars)",
    "templateSuggestion": "folleto-2p|email-promo|slide-deck|banner-congreso",
    "style": "moderno|elegante|vibrante|científico"
  }
]
\`\`\`

Las ideas deben ser variadas: distintos ángulos, distintas plantillas, distintos tonos. Piensa como un creativo de agencia que presenta opciones al cliente.`;

  const timeoutMs = 30_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout generando ideas.')), timeoutMs)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise,
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no generó ideas.');

  // Extraer JSON del texto
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No se pudo interpretar la respuesta de ideas.');

  const ideas = JSON.parse(jsonMatch[0]) as CampaignIdea[];
  if (!Array.isArray(ideas) || ideas.length === 0) {
    throw new Error('La respuesta no contiene ideas válidas.');
  }

  return ideas.slice(0, 6);
}

// ── Generar sugerencia de prompt ─────────────────────────

export async function generatePromptSuggestion(
  brandName: string,
  moleculeName: string | null,
  indicationNames: string[],
  templateNames: string[],
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Eres un director creativo experto en marketing farmacéutico.

MARCA: "${brandName}"
${moleculeName ? `MOLÉCULA: ${moleculeName}` : ''}
${indicationNames.length > 0 ? `INDICACIONES: ${indicationNames.join(', ')}` : ''}
PLANTILLAS SELECCIONADAS: ${templateNames.join(', ')}

Genera UN SOLO prompt creativo y detallado (en español, 100-250 caracteres) que un usuario pueda usar para pedirle a una IA que genere el contenido promocional de esta campaña farmacéutica. El prompt debe ser concreto, profesional y orientado a resultados.

RESPONDE SOLO con el texto del prompt, sin comillas, sin explicaciones, sin formato adicional.`;

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout generando prompt.')), 20_000)
    ),
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no generó un prompt.');
  return text;
}

// ── Validación de Compliance ────────────────────────────

export interface ComplianceCheck {
  status: 'compliant' | 'warning' | 'violation';
  text: string;
  reason: string;
  suggestion?: string;
}

export interface ComplianceResult {
  score: number; // 0-100
  checks: ComplianceCheck[];
}

/**
 * Valida el contenido generado contra claims aprobados.
 * Detecta afirmaciones sin respaldo, superlativos y claims fabricados.
 */
export async function validateCompliance(
  generatedText: string,
  approvedClaims: string[],
  brandName: string,
): Promise<ComplianceResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const claimsList = approvedClaims.length > 0
    ? approvedClaims.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '(Sin claims aprobados registrados)';

  const prompt = `Eres un experto en compliance farmacéutico y regulación de materiales promocionales. Tu trabajo es revisar texto de marketing farmacéutico y verificar que CADA afirmación esté respaldada por datos aprobados.

MARCA: "${brandName}"

CLAIMS APROBADOS (los únicos que están permitidos):
${claimsList}

TEXTO A VALIDAR:
"""
${generatedText}
"""

REGLAS DE VALIDACIÓN:
1. Cada afirmación de eficacia, seguridad o superioridad DEBE estar respaldada por un claim aprobado
2. Los superlativos ("el mejor", "el más efectivo", "único") son violaciones a menos que estén explícitamente en los claims
3. Las frases genéricas de marketing sin afirmaciones médicas ("Confía en la ciencia", "Innovación para la salud") son aceptables
4. Las cifras y porcentajes deben coincidir con los claims aprobados
5. Las contraindicaciones mencionadas deben ser precisas

Analiza CADA oración relevante del texto y clasifícala:
- "compliant" — Respaldada por claims o es genérica/aceptable
- "warning" — Parcialmente respaldada o podría ser más precisa
- "violation" — Sin respaldo, superlativo no autorizado, o dato fabricado

RESPONDE SOLO con un bloque JSON:
\`\`\`json
{
  "score": 85,
  "checks": [
    {
      "status": "compliant|warning|violation",
      "text": "La oración o frase del texto revisada",
      "reason": "Por qué tiene ese status (breve)",
      "suggestion": "Sugerencia de mejora (solo si warning o violation)"
    }
  ]
}
\`\`\`

Sé estricto pero justo. Solo marca violations reales. Las frases genéricas de branding son aceptables.`;

  const timeoutMs = 30_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout en validación.')), timeoutMs)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise,
  ]);

  const text = result.response.text().trim();
  if (!text) throw new Error('La IA no devolvió validación.');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No se pudo interpretar la validación.');

  const parsed = JSON.parse(jsonMatch[0]) as ComplianceResult;
  if (typeof parsed.score !== 'number' || !Array.isArray(parsed.checks)) {
    throw new Error('Formato de validación inválido.');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(parsed.score))),
    checks: parsed.checks.filter(c => c.text && c.status),
  };
}

// ── Sesiones de generación (persistencia) ───────────────

export async function createSession(data: {
  brandId: string;
  brandName: string;
  campaignName: string;
  templateId: string;
  templateName: string;
  moleculeId: string | null;
  moleculeName: string | null;
  indicationIds: string[];
  indicationNames: string[];
  tenantId: string;
  createdBy: string;
  initialSlotValues?: Record<string, string>;
  kitId?: string;
  brochureSourceUrl?: string;
  brochureSourceName?: string;
  brochureSourceMimeType?: string;
  brochureSourceSizeBytes?: number;
  brochureDesignSnapshot?: {
    layoutPages: number;
    style: 'moderno' | 'elegante' | 'cientifico' | 'vibrante';
    colors: string[];
    fonts: string[];
  };
  brochureLayoutSpec?: BrochureLayoutSpec;
}): Promise<string> {
  const { initialSlotValues, ...rest } = data;
  // Firestore rejects undefined values — strip them recursively
  const clean = JSON.parse(JSON.stringify(rest));
  const ref = await addDoc(collection(db, SESSIONS), {
    ...clean,
    slotValues: initialSlotValues ?? {},
    messages: [],
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Crea un kit: múltiples sesiones agrupadas por un kitId compartido */
export async function createKit(data: {
  brandId: string;
  brandName: string;
  campaignName: string;
  templates: { id: string; name: string }[];
  moleculeId: string | null;
  moleculeName: string | null;
  indicationIds: string[];
  indicationNames: string[];
  tenantId: string;
  createdBy: string;
  pageCount?: number;
}): Promise<{ kitId: string; sessionIds: string[] }> {
  const kitId = crypto.randomUUID();
  const sessionIds: string[] = [];

  for (const tpl of data.templates) {
    const initialSlotValues: Record<string, string> = {};
    if (tpl.id === 'folleto-2p' && data.pageCount) {
      initialSlotValues['__page_count'] = String(data.pageCount);
    }

    const id = await createSession({
      brandId: data.brandId,
      brandName: data.brandName,
      campaignName: data.campaignName,
      templateId: tpl.id,
      templateName: tpl.name,
      moleculeId: data.moleculeId,
      moleculeName: data.moleculeName,
      indicationIds: data.indicationIds,
      indicationNames: data.indicationNames,
      tenantId: data.tenantId,
      createdBy: data.createdBy,
      initialSlotValues,
      kitId,
    });
    sessionIds.push(id);
  }

  return { kitId, sessionIds };
}

/** Traduce el contenido de una sesión y crea una copia en el nuevo idioma */
export async function translateSession(
  sessionId: string,
  targetLang: 'en' | 'pt'
): Promise<string> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Sesión no encontrada');

  const langLabel = targetLang === 'en' ? 'inglés' : 'portugués';

  // Recopilar todos los slots con contenido
  const slotsWithContent = Object.entries(session.slotValues).filter(
    ([, v]) => v?.trim() && !v.startsWith('http') && !v.startsWith('__')
  );

  if (slotsWithContent.length === 0) {
    throw new Error('La sesión no tiene contenido para traducir');
  }

  // Construir prompt de traducción
  const slotsJson = Object.fromEntries(slotsWithContent);
  const prompt = `Eres un traductor especializado en marketing farmacéutico.
Traduce los siguientes textos del español al ${langLabel}.
Mantén el tono profesional y farmacéutico. Preserva claims médicos tal cual.
No traduzcas nombres de marcas, moléculas o ingredientes activos.
Responde SOLO con un JSON con las mismas claves y los valores traducidos.

Textos a traducir:
${JSON.stringify(slotsJson, null, 2)}`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No se pudo interpretar la traducción');

  const translated = JSON.parse(jsonMatch[0]) as Record<string, string>;

  // Combinar slots traducidos con los no traducidos (urls, metadata)
  const newSlotValues: Record<string, string> = { ...session.slotValues };
  for (const [key, val] of Object.entries(translated)) {
    if (val?.trim()) newSlotValues[key] = val;
  }

  // Crear nueva sesión con el contenido traducido
  const langSuffix = targetLang === 'en' ? '(EN)' : '(PT)';
  const newSessionId = await createSession({
    brandId: session.brandId,
    brandName: session.brandName,
    campaignName: `${session.campaignName} ${langSuffix}`,
    templateId: session.templateId,
    templateName: session.templateName,
    moleculeId: session.moleculeId,
    moleculeName: session.moleculeName,
    indicationIds: session.indicationIds,
    indicationNames: session.indicationNames,
    tenantId: session.tenantId,
    createdBy: session.createdBy,
    initialSlotValues: newSlotValues,
    kitId: session.kitId,
  });

  return newSessionId;
}

export async function getSession(id: string): Promise<GenerationSession | null> {
  const snap = await getDoc(doc(db, SESSIONS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as GenerationSession;
}

export async function getSessionsByBrand(brandId: string): Promise<GenerationSession[]> {
  const q = query(
    collection(db, SESSIONS),
    where('brandId', '==', brandId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as GenerationSession)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function addMessageToSession(
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  const ref = doc(db, SESSIONS, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const messages = (data.messages ?? []) as ChatMessage[];
  messages.push({
    ...message,
    timestamp: Timestamp.now(),
  });

  await updateDoc(ref, {
    messages,
    updatedAt: serverTimestamp(),
  });
}

export async function updateSessionSlots(
  sessionId: string,
  slotValues: Record<string, string>
): Promise<void> {
  await updateDoc(doc(db, SESSIONS, sessionId), {
    slotValues,
    updatedAt: serverTimestamp(),
  });
}

export async function saveSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, SESSIONS, sessionId), {
    status: 'saved',
    updatedAt: serverTimestamp(),
  });
}

export async function getSavedSessionsByBrand(brandId: string): Promise<GenerationSession[]> {
  const q = query(
    collection(db, SESSIONS),
    where('brandId', '==', brandId),
    where('status', '==', 'saved')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as GenerationSession)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function getDraftSessionsByBrand(brandId: string): Promise<GenerationSession[]> {
  const q = query(
    collection(db, SESSIONS),
    where('brandId', '==', brandId),
    where('status', '==', 'draft')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as GenerationSession)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, SESSIONS, sessionId));
}

export async function getAllSavedSessions(): Promise<GenerationSession[]> {
  const q = query(
    collection(db, SESSIONS),
    where('status', '==', 'saved')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as GenerationSession)
    .sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
}

export async function renameSession(sessionId: string, newName: string): Promise<void> {
  await updateDoc(doc(db, SESSIONS, sessionId), {
    campaignName: newName,
    updatedAt: serverTimestamp(),
  });
}
