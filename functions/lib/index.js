"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContent = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
// ── Función principal ───────────────────────────────────
exports.generateContent = (0, https_1.onCall)({
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
}, async (request) => {
    // Auth check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const data = request.data;
    if (!data.messages || data.messages.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Se requiere al menos un mensaje.');
    }
    if (!data.slots || data.slots.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Se requiere al menos un slot de plantilla.');
    }
    // Construir el system prompt
    const systemPrompt = buildSystemPrompt(data);
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: systemPrompt,
        });
        // Convertir mensajes al formato Gemini
        const geminiHistory = data.messages.slice(0, -1).map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
        const lastMessage = data.messages[data.messages.length - 1];
        const chat = model.startChat({
            history: geminiHistory,
        });
        const result = await chat.sendMessage(lastMessage.content);
        const response = result.response;
        const text = response.text();
        if (!text) {
            throw new https_1.HttpsError('internal', 'La IA no devolvió texto.');
        }
        // Intentar parsear JSON de slots si la respuesta lo contiene
        const parsed = tryParseSlotValues(text, data.slots);
        // Extraer uso de tokens
        const usageMetadata = response.usageMetadata;
        return {
            message: text,
            slotValues: parsed,
            usage: {
                inputTokens: usageMetadata?.promptTokenCount ?? 0,
                outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
            },
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Gemini API error:', message);
        throw new https_1.HttpsError('internal', 'Error al comunicarse con la IA: ' + message);
    }
});
// ── Construcción del System Prompt ──────────────────────
function buildSystemPrompt(data) {
    const parts = [];
    parts.push(`Eres un redactor experto en marketing farmacéutico. Tu trabajo es generar contenido textual promocional para materiales de laboratorios farmacéuticos.

REGLAS ABSOLUTAS:
1. Solo puedes usar información de los INSIGHTS VALIDADOS que se te proporcionan.
2. NUNCA inventes claims médicos, estadísticas o datos que no estén en los insights.
3. NUNCA uses tu conocimiento general sobre fármacos — solo lo que te damos.
4. Cada afirmación debe poder rastrearse a un insight proporcionado.
5. Respeta los límites de caracteres de cada slot.
6. Escribe en español a menos que se indique lo contrario.`);
    // Contexto de marca
    parts.push(`

MARCA: "${data.brandContext.brandName}"
- Tipografía títulos: ${data.brandContext.fontTitle}
- Tipografía cuerpo: ${data.brandContext.fontBody}
- Color primario: ${data.brandContext.colorPrimary}
- Color secundario: ${data.brandContext.colorSecondary}
(Estos datos son de referencia para que adaptes el tono y estilo al nivel de formalidad de la marca.)`);
    // Molécula e indicaciones
    if (data.moleculeName) {
        parts.push(`\nMOLÉCULA: ${data.moleculeName}`);
    }
    if (data.indicationNames.length > 0) {
        parts.push(`INDICACIONES SELECCIONADAS:\n${data.indicationNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
    }
    // Insights validados
    if (data.insights.length > 0) {
        parts.push(`\nINSIGHTS VALIDADOS (tu ÚNICA fuente de información):`);
        data.insights.forEach((insight, i) => {
            let insightBlock = `\n[Insight ${i + 1}] (${insight.category}): "${insight.text}"`;
            if (insight.references.length > 0) {
                insightBlock += `\n  Referencias:`;
                insight.references.forEach((ref) => {
                    insightBlock += `\n    - Doc: ${ref.documentName}`;
                    if (ref.page)
                        insightBlock += `, pág. ${ref.page}`;
                    if (ref.section)
                        insightBlock += `, sección: ${ref.section}`;
                    if (ref.quote)
                        insightBlock += `\n      Cita: "${ref.quote}"`;
                });
            }
            parts.push(insightBlock);
        });
    }
    else {
        parts.push(`\nNOTA: No hay insights validados disponibles. Solo puedes generar contenido genérico de estructura sin claims específicos.`);
    }
    // Plantilla y slots
    parts.push(`\nPLANTILLA: "${data.templateName}"\nSLOTS A COMPLETAR:`);
    data.slots.forEach((slot) => {
        let slotDesc = `- ${slot.id} (${slot.name}): tipo=${slot.type}, máx ${slot.maxLength} caracteres`;
        if (slot.type === 'bullets' && slot.maxItems) {
            slotDesc += `, ${slot.maxItems} items, máx ${slot.maxItemLength ?? slot.maxLength} chars c/u`;
        }
        if (slot.required)
            slotDesc += ' [OBLIGATORIO]';
        parts.push(slotDesc);
    });
    // Instrucciones de formato de respuesta
    parts.push(`

FORMATO DE RESPUESTA:
Cuando generes contenido para los slots, incluye un bloque JSON al final con esta estructura:
\`\`\`json
{
${data.slots.map((s) => `  "${s.id}": "${s.type === 'bullets' ? '["item1", "item2", ...]' : 'texto generado'}"`).join(',\n')}
}
\`\`\`

Antes del JSON puedes incluir explicaciones, comentarios o preguntas para el usuario.
Si el usuario pide ajustes a slots específicos, devuelve el JSON completo con todos los slots (los no modificados mantienen su valor anterior).

Si el usuario hace una pregunta general o pide cambios sin que sea necesario generar contenido, responde normalmente sin incluir el bloque JSON.`);
    // Valores actuales (si existen de iteraciones previas)
    if (data.currentSlotValues && Object.keys(data.currentSlotValues).length > 0) {
        parts.push(`\nVALORES ACTUALES DE LOS SLOTS (de la iteración anterior):`);
        Object.entries(data.currentSlotValues).forEach(([key, value]) => {
            parts.push(`- ${key}: "${value}"`);
        });
        parts.push(`\nSi el usuario pide ajustes, modifica solo los slots mencionados y mantén el resto igual.`);
    }
    return parts.join('\n');
}
// ── Parser de JSON de slots ─────────────────────────────
function tryParseSlotValues(text, slots) {
    // Buscar bloque JSON en la respuesta
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch)
        return null;
    try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        const result = {};
        for (const slot of slots) {
            if (parsed[slot.id] !== undefined) {
                const value = parsed[slot.id];
                if (Array.isArray(value)) {
                    // Para bullets, unir con newlines
                    result[slot.id] = value.join('\n');
                }
                else {
                    result[slot.id] = String(value);
                }
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=index.js.map