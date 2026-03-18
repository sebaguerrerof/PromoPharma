# PharmaDesign AI 2.0 — Plan de Evolución "Modo Pomelli"

## Contexto

**Google Pomelli** es una herramienta de Google Labs + DeepMind que permite a negocios crear campañas de marketing on-brand en 3 pasos:
1. **Business DNA** — Analiza tu URL y extrae colores, fonts, tono, imágenes
2. **Campaign Ideas** — La IA propone ideas de campaña adaptadas a tu marca
3. **Assets** — Genera sets de piezas (social, banners, emails) listos para usar

**Nuestro objetivo**: Adaptar ese flujo simple y poderoso al contexto farmacéutico, donde tenemos ventajas que Pomelli no tiene (compliance, claims validados, Knowledge Bank).

---

## Estado Actual vs Pomelli

### Lo que Pomelli hace y nosotros NO

| Concepto Pomelli | PharmaDesign AI Hoy | Gap |
|---|---|---|
| **Business DNA** — URL → extrae identidad automática | Brand Identity manual | Automatización |
| **Campaign Ideas** — IA propone ideas basadas en tu marca | Chat vacío, tú dices qué crear | Proactividad de la IA |
| **Multi-asset** — Genera SETS de piezas de un solo prompt | Una pieza por vez | Escala |
| **Photoshoot** — Fotos de producto con IA de alta calidad | Imágenes genéricas (Gemini experimental) | Calidad visual |
| **3 pasos** — DNA → Ideas → Assets | Setup → Chat → Editor → Export (4+ pasos) | Simplicidad |

### Lo que nosotros tenemos y Pomelli NO

| Ventaja nuestra | Pomelli |
|---|---|
| Claims validados con referencias documentales | No maneja compliance |
| Knowledge Bank con documentos científicos | No tiene banco de conocimiento |
| Insights con flujo de aprobación (pending → approved) | No hay validación |
| 6 variantes de diseño (Moderna, Elegante, Vibrante...) | Menos control de estilo |
| Multi-página (folletos, presentaciones 5 slides) | Solo piezas individuales |
| Especialización farmacéutica en el system prompt | Genérico para cualquier negocio |
| Exportación PPTX/PDF profesional | Solo descarga de imágenes |

---

## Fases de Implementación

---

### FASE 1 — Flujo Simplificado + Ideas Proactivas
**Impacto: ⭐⭐⭐⭐⭐ | Esfuerzo: Medio**

#### 1A. Campaign Ideas — La IA propone, tú eliges

**Qué cambia para el usuario:**
- Hoy: abre chat vacío y escribe qué quiere
- Después: la IA analiza claims/insights/Knowledge Bank y propone 3-4 ideas como botones

**Ejemplo visual:**
```
┌─────────────────────────────────────────────┐
│  💡 Ideas de campaña para [Marca X]         │
│                                             │
│  Basándome en tus claims e insights:        │
│                                             │
│  [💊 Eficacia clínica]                      │
│  Destaca resultados de estudios clínicos    │
│                                             │
│  [🎯 Diferenciación competitiva]            │
│  Posiciona vs alternativas del mercado      │
│                                             │
│  [👨‍⚕️ Confianza médica]                     │
│  Enfoque en seguridad y perfil del fármaco  │
│                                             │
│  [✏️ Escribir mi propia idea...]            │
│                                             │
└─────────────────────────────────────────────┘
```

**Implementación técnica:**
- Nuevo prompt de pre-análisis que recibe: claims aprobados, insights, Knowledge Bank summary
- Se ejecuta al crear sesión, ANTES de mostrar el chat
- Respuesta parseada como array de objetos `{ title, description, prompt }`
- Se muestran como botones/cards clicables
- Al elegir uno, se envía el `prompt` como si fuera el `initialPrompt`
- También se puede escribir uno propio (textarea como ahora)

**Archivos a modificar:**
- `src/services/generationService.ts` — nueva función `generateCampaignIdeas()`
- `src/pages/Generate.tsx` — nuevo paso intermedio en SetupView o nuevo "IdeasView"

---

#### 1B. Simplificar a 3 pasos (como Pomelli)

**Flujo actual (4+ interacciones):**
```
Seleccionar marca → Seleccionar plantilla → Seleccionar indicaciones → 
Escribir prompt → Chat → Ver preview → Editar en Canvas → Exportar
```

**Flujo propuesto (3 pasos):**
```
Paso 1: ELIGE MARCA (auto-carga DNA + claims + insights)
   ↓
Paso 2: ELIGE IDEA (IA propone o tú escribes) + tipo de pieza
   ↓  
Paso 3: LA IA GENERA TODO → vista previa inmediata → editar → exportar
```

**Qué cambia:**
- Combinar selección de plantilla + indicaciones + prompt en un solo paso
- Las indicaciones se pre-seleccionan automáticamente (todas las de la marca)
- La plantilla se puede inferir del tipo de idea o seleccionar con pills compactos
- El usuario ve resultados MUCHO más rápido

**Archivos a modificar:**
- `src/pages/Generate.tsx` — refactorizar SetupView

---

### FASE 2 — Calidad Visual Superior
**Impacto: ⭐⭐⭐⭐⭐ | Esfuerzo: Medio**

#### 2A. Cambiar motor de imágenes a DALL-E 3

**Por qué:**
- Gemini 2.0 Flash Experimental es gratuito pero la calidad es baja para marketing profesional
- DALL-E 3 produce imágenes significativamente mejores para contexto pharma/editorial
- Costo bajo (~$0.04-0.08 por imagen)

**Implementación:**
- Nueva función en `imageService.ts`: `generateImageDallE3(prompt, brandContext)`
- API REST a `https://api.openai.com/v1/images/generations`
- Modelo: `dall-e-3`, size: `1024x1024` o `1792x1024`
- Mantener Gemini como fallback gratuito
- Selector en settings: "Motor de imágenes: DALL-E 3 | Gemini (gratis)"
- Nueva env var: `VITE_OPENAI_API_KEY`

**Archivos a modificar:**
- `src/services/imageService.ts` — agregar `generateImageDallE3()`, modificar `generateImage()` para elegir motor
- `.env` — agregar `VITE_OPENAI_API_KEY`

#### 2B. Estilos de imagen seleccionables

**Qué cambia:**
- Hoy: el prompt de imagen es genérico ("premium pharmaceutical marketing image")
- Después: el usuario puede elegir estilo visual

**Estilos propuestos:**
| Estilo | Prompt modifier |
|---|---|
| 📷 Fotografía médica | "Professional medical photography, clinical setting, realistic" |
| 🔬 Ilustración científica | "Scientific illustration, molecular structures, clean vector style" |
| 🎨 Abstracto premium | "Abstract premium design, soft gradients, geometric shapes" |
| 📊 Infografía | "Clean infographic style, data visualization, charts" |
| 💊 Producto | "Product photography, pharmaceutical packaging, clean background" |

**Archivos a modificar:**
- `src/services/imageService.ts` — agregar `imageStyle` al prompt
- `src/pages/Generate.tsx` — selector de estilo de imagen en setup o chat

---

### FASE 3 — Multi-Asset (Kit de Campaña)
**Impacto: ⭐⭐⭐⭐ | Esfuerzo: Alto**

#### 3A. Genera varias piezas de un solo prompt

**Qué cambia:**
- Hoy: creas una sesión = una pieza (1 folleto O 1 email O 1 banner)
- Después: "Kit de campaña" genera VARIAS piezas simultáneamente

**Ejemplo:**
```
Usuario: "Campaña de eficacia clínica para Molécula X"
   ↓
La IA genera en paralelo:
   📄 Folleto 2 páginas — con claims y datos clínicos
   📧 Email promocional — versión concisa para médicos  
   🖼️ Banner congreso — versión visual para stand

Todo con el MISMO mensaje adaptado a cada formato.
```

**Implementación:**
- Nueva opción en setup: "Kit de campaña" (seleccionar múltiples templates)
- Crear N sesiones en paralelo con el mismo prompt base
- Vista tipo galería con tabs por cada pieza
- Compartir slotValues comunes (título, subtítulo, claims principales)

**Archivos a modificar:**
- `src/pages/Generate.tsx` — modo "Kit" en setup
- `src/pages/Campaigns.tsx` — visual de kit agrupado
- `src/services/generationService.ts` — función `generateKit()`

---

### FASE 4 — Inteligencia Documental
**Impacto: ⭐⭐⭐⭐ | Esfuerzo: Medio**

#### 4A. Extracción automática de insights de PDFs

**Qué cambia:**
- Hoy: lees el paper, copias manualmente cada claim, lo pegas como insight
- Después: subes el PDF → la IA extrae claims/datos → crea insights en estado "pending"

**Ejemplo:**
```
📄 Subes: "Estudio_Fase3_MoleculaX.pdf"
   ↓
IA extrae automáticamente:
   ✅ "Reducción del 45% en síntomas vs placebo (p<0.001)" — benefit
   ✅ "Perfil de seguridad comparable a placebo" — key_message  
   ✅ "Indicado para pacientes adultos con..." — primary_use
   ⚠️ "Contraindicado en insuficiencia hepática severa" — contraindication
   ↓
Todos en estado "pending" → el usuario revisa y aprueba/rechaza
```

**Implementación:**
- Gemini 2.5 Flash soporta input de archivos PDF directamente
- Nuevo prompt de extracción con categorías predefinidas
- Crear insights automáticamente en Firestore con `status: 'pending'`
- UI de revisión batch (aprobar/rechazar múltiples de una vez)

**Archivos a modificar:**
- `src/services/insightService.ts` — nueva función `extractInsightsFromPDF()`
- `src/pages/IndicationDetail.tsx` — botón "Extraer de PDF" + UI de revisión batch

#### 4B. Validación de compliance post-generación

**Qué cambia:**
- Hoy: el system prompt dice "no inventes claims" pero no hay verificación
- Después: después de generar, un segundo paso automático verifica compliance

**Ejemplo:**
```
┌──────────────────────────────────────────┐
│  ✅ Verificación de Compliance           │
│                                          │
│  Score: 92% compliant                    │
│                                          │
│  ✅ "Eficacia del 45%" — Respaldado      │
│     → Insight #12, Estudio Fase 3        │
│                                          │
│  ⚠️ "El más efectivo del mercado"        │
│     → Superlativo no respaldado          │
│     → Sugerencia: "Alta efectividad      │
│       demostrada en estudios clínicos"   │
│                                          │
│  ✅ "Bien tolerado" — Respaldado         │
│     → Insight #8, Perfil seguridad       │
│                                          │
└──────────────────────────────────────────┘
```

**Implementación:**
- Nuevo prompt de validación que recibe: texto generado + lista de claims aprobados
- Compara cada afirmación contra claims
- Detecta superlativos, claims absolutos, afirmaciones sin respaldo
- Se ejecuta automáticamente después de cada generación
- Usa GPT-4o-mini (barato y rápido para clasificación) o Gemini Flash
- Indicador visual en el chat: "✅ 95% compliant" o "⚠️ 2 observaciones"

**Archivos a modificar:**
- `src/services/generationService.ts` — nueva función `validateCompliance()`
- `src/pages/Generate.tsx` — mostrar badge/indicador de compliance en cada respuesta

---

### FASE 5 — Auto Brand DNA (desde URL)
**Impacto: ⭐⭐⭐ | Esfuerzo: Medio**

#### 5A. Extraer identidad de marca desde URL

**Qué cambia:**
- Hoy: configuras manualmente colores, fonts, tono en Brand Identity
- Después: pegas URL del sitio web del producto → IA extrae todo automáticamente

**Implementación:**
- Fetch de la página web (puede requerir proxy/CORS)
- Enviar HTML + screenshots a Gemini para análisis
- Extraer: colores dominantes, tipografías detectadas, tono de comunicación
- Pre-llenar formulario de Brand Identity con valores detectados
- El usuario puede ajustar antes de guardar

**Archivos a modificar:**
- `src/services/brandService.ts` — nueva función `extractBrandDNA(url)`
- `src/pages/BrandDetail.tsx` — botón "Importar desde URL" + preview de valores detectados

---

### FASE 6 — Extras (Polish)
**Impacto: ⭐⭐ | Esfuerzo: Bajo-Medio**

#### 6A. Variantes A/B de copy
- Generar 2-3 versiones del mismo contenido con temperatures diferentes
- El usuario elige cuál prefiere
- Opcional: la IA evalúa cuál es más efectiva

#### 6B. Traducción automática
- Botón "Traducir a inglés/portugués"
- Crea copia de la sesión en el nuevo idioma
- Mantiene claims y tono farmacéutico

#### 6C. Product Photoshoot
- Subir foto real de producto
- IA genera variantes: producto en escritorio médico, en farmacia, en packaging
- Requiere DALL-E 3 edit/variations

---

## Orden de Implementación Recomendado

| Prioridad | Fase | Qué | Por qué |
|---|---|---|---|
| 🥇 1 | 1A | Campaign Ideas proactivas | Cambio más visible, transforma la UX completamente |
| 🥇 2 | 1B | Simplificar a 3 pasos | Reduce fricción, experiencia tipo Pomelli |
| 🥈 3 | 2A | DALL-E 3 para imágenes | La calidad visual es lo primero que se nota |
| 🥈 4 | 2B | Estilos de imagen | Complemento de 2A, poco esfuerzo extra |
| 🥉 5 | 4A | Extracción de insights de PDFs | Ahorra horas de trabajo manual, valor enorme en pharma |
| 🥉 6 | 3A | Multi-asset (Kit de campaña) | Diferenciador potente vs cualquier herramienta genérica |
| 4️⃣ 7 | 4B | Validación compliance | Diferenciador regulatorio, confianza del usuario |
| 4️⃣ 8 | 5A | Auto Brand DNA | Nice-to-have, optimiza onboarding |
| 5️⃣ 9 | 6A-C | Extras (A/B, traducción, photoshoot) | Polish para versión madura |

---

## Costos Estimados (uso moderado, ~50 campañas/mes)

| Servicio | Uso | Costo/mes |
|---|---|---|
| Gemini 2.5 Flash (texto, ya existe) | Chat + ideas + extracción | ~$5-15 |
| DALL-E 3 (imágenes, nuevo) | ~200 imágenes/mes | ~$15-40 |
| GPT-4o-mini (compliance, nuevo) | Validación post-gen | ~$3-5 |
| **Total estimado** | | **~$25-60/mes** |

---

## Stack Técnico (sin cambios en infra)

- **Frontend**: React 19 + TypeScript + Vite + Tailwind v4 (sin cambios)
- **Backend**: Firebase (Auth, Firestore, Storage) (sin cambios)
- **IAs de Texto**: Gemini 2.5 Flash (primario) + DeepSeek V3 (fallback) (sin cambios)
- **IAs de Imagen**: DALL-E 3 (nuevo primario) + Gemini Exp (fallback gratuito)
- **IA de Compliance**: GPT-4o-mini o Gemini Flash (nuevo)
- **Voz**: Web Speech API (sin cambios)
- **Export**: pptxgenjs + jsPDF (sin cambios)

No se necesitan nuevos servicios de infraestructura. Solo 1 API key nueva (OpenAI para DALL-E 3 + GPT-4o-mini).

---

## Decisiones Pendientes (para ti)

- [ ] ¿Apruebas el orden de prioridades propuesto?
- [ ] ¿Quieres DALL-E 3 o prefieres otro motor de imágenes (Flux, Ideogram)?
- [ ] ¿Validación de compliance con GPT-4o-mini o con Gemini Flash (gratis pero más lento)?
- [ ] ¿Kit de campaña multi-asset es prioridad o lo dejamos para después?
- [ ] ¿Presupuesto mensual máximo aceptable para APIs de IA?
- [ ] ¿Empezamos con Fase 1 (Ideas + 3 pasos)?
