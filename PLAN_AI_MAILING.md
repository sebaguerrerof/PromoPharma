# PLAN: Creación de Mailings con IA — "Crear con AI"

> **Módulo**: Mailing Composer (M6)  
> **Ubicación del botón**: Paso 2 (Galería de diseños), al lado izquierdo de "Subir Diseño"  
> **Objetivo**: Que el usuario pueda crear un mailing completo (estructura + contenido + imágenes) con un solo prompt, nutriéndose automáticamente de toda la identidad de marca.

---

## 1. ARCHIVO DE REFERENCIA PARA MODELOS DE IA

### 1.1 Propósito

Crear un archivo `src/services/aiMailingContext.ts` que centralice **toda la información** que cualquier modelo de IA (Gemini, DALL-E, DeepSeek) necesita para generar un mailing coherente con la marca. Este archivo será la **fuente de verdad** que se consulta cada vez que se invoca "Crear con AI".

### 1.2 Estructura del Archivo de Contexto

> **IMPORTANTE**: Esta estructura está diseñada para que la salida de la IA se pueda mapear 1:1
> a los tipos `MailingBlockContent[]`, `MailingProject['style']` y `emailSettings` que usa
> `MailingEditor.tsx` en su `StepEditor`. Cualquier propiedad que la IA genere
> debe ser directamente asignable al estado del editor sin transformación intermedia.

```typescript
// src/services/aiMailingContext.ts

import type {
  Brand,
  BrandParams,
  BrandClaim,
  BrandLogo,
  DesignBlockType,
  MailingBlockContent,
  MailingProject,
  DesignLayout,
  InsightCategory,
  KnowledgeItemType,
} from '@/types';

// ═══════════════════════════════════════════════════════════
// A) CONTEXTO DE ENTRADA — Lo que se le entrega a la IA
// ═══════════════════════════════════════════════════════════

export interface AIMailingContext {
  // ── Identidad de Marca (mapeado 1:1 desde Brand + BrandParams) ──
  brand: {
    id: string;
    name: string;
    moleculeId: string;
    moleculeName: string;
    indicationNames: string[];

    // Visual Identity — se mapea a MailingProject['style']
    // Estos valores se usan para computar `computedStyle` en MailingEditor:
    //   computedStyle = {
    //     colorPrimary:   brand.params.colorPrimary   ?? '#2563EB',
    //     colorSecondary: brand.params.colorSecondary  ?? '#0EA5E9',
    //     colorBackground: '#FFFFFF',
    //     fontTitle:      brand.params.fontTitle       ?? 'Inter',
    //     fontBody:       brand.params.fontBody        ?? 'Inter',
    //     logoUrl:        brand.params.logoUrl         ?? '',
    //   }
    colorPrimary: string;       // HEX — maps to style.colorPrimary
    colorSecondary: string;     // HEX — maps to style.colorSecondary
    fontTitle: string;          // Google Font name — maps to style.fontTitle
    fontBody: string;           // Google Font name — maps to style.fontBody
    logoUrl: string;            // Logo principal — maps to style.logoUrl
    logos: BrandLogo[];         // Logos adicionales {label, url} para distintos fondos
    assets: string[];           // URLs de imágenes/assets de marca (fotos producto, iconos)

    // Regulatorio
    disclaimerBadge?: string;   // Sello farmacéutico (ej: "Material exclusivo para profesionales de la salud")
    qrUrl?: string;             // URL destino del QR
    qrImageUrl?: string;        // Imagen QR ya generada en Storage

    // Tono de comunicación (extraído por Brand DNA)
    communicationTone?: string;
  };

  // ── Claims Aprobados (desde BrandClaim[]) ──
  claims: BrandClaim[];         // { indicationId, indicationName, text }

  // ── Insights Científicos Aprobados ──
  insights: Array<{
    text: string;
    category: InsightCategory;  // 'benefit' | 'primary_use' | 'key_message' | 'contraindication' | 'other'
    references: Array<{
      documentId: string;
      documentName: string;
      page: number | null;
      section: string;
      quote: string;
    }>;
  }>;

  // ── Knowledge Bank ──
  knowledgeItems: Array<{
    title: string;
    type: KnowledgeItemType;    // 'reference_material' | 'style_guide' | 'approved_text' | 'design_asset'
    content: string;
    tags: string[];
  }>;

  // ── Catálogo de Templates Disponibles ──
  // La IA elige uno como base; cada template define su layout con bloques posicionados
  availableTemplates: Array<{
    id: string;                 // ej: 'sys-hero', 'sys-newsletter', etc.
    name: string;
    description: string;
    tags: EmailDesignTag[];     // 'simple' | 'visual' | 'informativo' | 'promocional' | 'científico' | 'newsletter'
    layout: DesignLayout;       // { width: 600, height: number, blocks: DesignBlock[] }
    blockSummary: string;       // Ej: "header → hero → text → bullets → cta → footer"
  }>;

  // ── Fuentes disponibles en el editor ──
  // La IA debe usar SOLO estas fuentes en sus estilos de bloque
  availableFonts: string[];
  // = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana',
  //    'Trebuchet MS', 'Tahoma', 'Courier New', 'Palatino', 'Garamond',
  //    brand.fontTitle, brand.fontBody]

  // ── Reglas del Sistema ──
  systemRules: {
    maxSubjectLength: number;       // 60
    maxPreheaderLength: number;     // 100
    maxTitleLength: number;         // 50 (header_title), 60 (text_title)
    maxBodyLength: number;          // 300 por bloque de texto
    maxCtaTextLength: number;       // 25
    maxBulletItems: number;         // 6
    maxBulletItemLength: number;    // 80
    maxQuoteLength: number;         // 200
    maxQuoteAuthorLength: number;   // 50
    maxHeroTitleLength: number;     // 60
    maxHeroSubtitleLength: number;  // 100
    maxFooterDisclaimerLength: number; // 500
    requireDisclaimer: boolean;     // true
    requireFooter: boolean;         // true
    emailWidth: number;             // 600
    emailCompatibility: string[];   // ['outlook', 'gmail', 'apple_mail']
    allowedBlockTypes: DesignBlockType[];
    // = ['header','hero','text','image','cta','footer','spacer','divider',
    //    'bullets','columns','quote','social','video']
  };

  // ── Prompt del Usuario ──
  userPrompt: string;

  // ── Tipo de email seleccionado por el usuario ──
  emailType?: 'promocional' | 'informativo' | 'newsletter' | 'invitación' | 'científico' | 'aviso_breve';

  // ── Opciones avanzadas ──
  options?: {
    includeHeroImage?: boolean;
    includeClinicalData?: boolean;
    includeQR?: boolean;
    includeSocialLinks?: boolean;
    tone?: 'profesional' | 'cercano' | 'académico' | 'urgente';
    length?: 'corto' | 'medio' | 'largo';
  };
}

type EmailDesignTag = 'simple' | 'visual' | 'informativo' | 'promocional' | 'científico' | 'newsletter';

// ═══════════════════════════════════════════════════════════
// B) RESPUESTA DE LA IA — Formato que se mapea al editor
// ═══════════════════════════════════════════════════════════
//
// La IA debe devolver un JSON que se pueda cargar directamente
// en el estado del MailingEditor sin transformación.
// Cada bloque en `blocks` debe cumplir con `MailingBlockContent`.

export interface AIMailingResponse {
  // Metadatos del email
  templateId: string;             // ID del template base elegido (ej: 'sys-hero')
  projectName: string;            // Nombre interno (se mapea a MailingEditor.projectName)
  subject: string;                // Asunto del email (se mapea a MailingEditor.subject)

  // Email settings (se mapea a MailingEditor.emailSettings)
  emailSettings: {
    preheaderText?: string;       // Texto preview del email
    bodyBackground?: string;      // Color de fondo outer (ej: '#f4f4f8')
    containerWidth?: number;      // Ancho del contenedor (default: 600)
    borderRadius?: number;        // Bordes redondeados (default: 12)
  };

  // ── Array de bloques — DEBE usar MailingBlockContent exacto ──
  // Este array se asigna directamente a MailingEditor.blocks
  blocks: AIGeneratedBlock[];

  // Explicación interna (no se muestra al usuario)
  reasoning: string;
}

// Cada bloque generado DEBE cumplir con MailingBlockContent (src/types/index.ts)
// para que se pueda hacer: setBlocks(response.blocks) sin transformación.
//
// Referencia completa de propiedades por tipo de bloque:

export interface AIGeneratedBlock {
  id: string;                     // Ej: 'ai_header_1', 'ai_hero_1', etc.
  type: DesignBlockType;          // 'header'|'hero'|'text'|'image'|'cta'|'footer'|...

  // ── Contenido principal (varía por tipo) ──
  content: string;
  // Según tipo:
  //   header  → Nombre de marca o título corto
  //   hero    → Leyenda/alt text de la imagen
  //   text    → Párrafo de texto o título (si style.fontWeight='bold')
  //   image   → Leyenda debajo de la imagen (caption)
  //   cta     → Etiqueta superior encima del botón (ej: "DESCUBRE MÁS"). Vacío = sin etiqueta
  //   footer  → Texto legal / disclaimer
  //   bullets → Un punto por línea separado con \n (sin viñetas, el editor las agrega)
  //   columns → "Columna izq|||Columna der" (separador: |||)
  //   quote   → Texto de la cita
  //   social  → Texto opcional (ej: "Síguenos en redes sociales")
  //   video   → Título del video
  //   spacer  → '' (vacío)
  //   divider → '' (vacío)

  // ── Propiedades específicas por tipo ──
  imageUrl?: string;              // hero, image, video: URL de imagen
  ctaText?: string;               // cta: Texto del botón (ej: "Más información")
  ctaUrl?: string;                // cta: URL del botón (ej: "https://...")
  videoUrl?: string;              // video: URL de YouTube/Vimeo
  quoteAuthor?: string;           // quote: Autor de la cita (ej: "Dr. Juan Pérez")
  socialLinks?: Array<{           // social, footer: Redes sociales
    platform: string;             //   'linkedin'|'instagram'|'facebook'|'twitter'|'youtube'|'tiktok'|'web'|'email'
    url: string;
  }>;

  // ── Fondo del bloque (disponible en TODOS los bloques excepto spacer/divider) ──
  backgroundColor?: string;       // HEX del fondo
  backgroundImage?: string;       // URL de imagen de fondo

  // ── Espaciado interno (disponible en TODOS excepto spacer) ──
  paddingTop?: number;            // 0-120 px
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;

  // ── Estilos inline por bloque ──
  // Record<string, string> — las keys varían por tipo de bloque.
  // La IA DEBE respetar estas keys exactas para que el editor las interprete.
  style?: BlockStyleMap;
}

// ═══════════════════════════════════════════════════════════
// C) MAPA COMPLETO DE ESTILOS POR TIPO DE BLOQUE
// ═══════════════════════════════════════════════════════════
//
// Referencia exhaustiva de `style: Record<string, string>`
// que el BlockEditor de MailingEditor.tsx sabe leer y renderizar.
// La IA debe usar SOLO estas keys.

export type BlockStyleMap = Record<string, string>;

// ── Estilos comunes a TODOS los bloques con texto ──
// (text, bullets, header, footer, quote, hero, cta, columns, video, image, social)
//
// | Key           | Valores                                         | Default              |
// |---------------|-------------------------------------------------|----------------------|
// | fontFamily    | Nombre de fuente del array availableFonts       | style.fontTitle/Body |
// | fontSize      | '10'-'48' (string numérico en px)               | '16' (body), '24' (título) |
// | color         | HEX (ej: '#333333')                             | '#333333' (body), '#111111' (título) |
// | textAlign     | 'left' | 'center' | 'right'                     | 'left'               |
// | textTransform | 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'none'           |
// | fontWeight    | 'bold' | undefined                              | undefined (normal)   |
//
// ── Estilos específicos: HEADER ──
// | logoX         | Offset horizontal del logo en px (string)       | '0'                  |
// | logoY         | Offset vertical del logo en px (string)         | '0'                  |
// | headerDate    | Texto de fecha | '__hide__' para ocultar        | auto (mes/año)       |
//
// ── Estilos específicos: HERO ──
// | heroTitle     | Título sobre la imagen hero                     | ''                   |
// | heroSubtitle  | Subtítulo sobre la imagen hero                  | ''                   |
// | imgWidth      | '100' | '75' | '50' | 'auto' (%)               | '100'                |
// | imgHeight     | Alto fijo en px (string) o '' para auto         | '' (auto)            |
// | imgObjectFit  | 'contain' | 'cover' | 'fill'                   | 'contain'            |
// | imgAlign      | 'left' | 'center' | 'right'                    | 'center'             |
// | imgBorderRadius | '0'-'50' (string, px)                        | '0'                  |
// | imgShadow     | 'none' | 'sm' | 'md' | 'lg'                    | 'none'               |
// | imgShadowColor | rgba() string                                 | 'rgba(0,0,0,0.12)'  |
// | imgBorder     | 'none' | '1px solid #e5e7eb' | '2px solid #d1d5db' | '3px solid' | 'none' |
// | imgBorderColor | HEX (solo si imgBorder != 'none')             | '#d1d5db'            |
//
// ── Estilos específicos: IMAGE (mismos que hero para img*) ──
// | imgWidth, imgHeight, imgObjectFit, imgAlign, imgBorderRadius, imgShadow, imgShadowColor, imgBorder, imgBorderColor |
// (mismos valores que hero)
//
// ── Estilos específicos: TEXT ──
// | headingLevel  | '' | 'h1' | 'h2' | 'h3' | 'h4'                 | '' (párrafo)         |
// | accentBar     | undefined | 'hide'                              | undefined (visible)  |
// | accentBarColor | HEX                                            | style.colorPrimary   |
// Nota: Si headingLevel está definido, fontWeight se pone 'bold' automáticamente
// Tamaños por defecto según headingLevel: h1=32, h2=24, h3=20, h4=18
//
// ── Estilos específicos: BULLETS ──
// | bulletStyle   | 'number' | 'bullet' | 'letter' | 'none'        | 'number'             |
// | bulletBadgeBg | HEX (fondo del badge numérico)                  | style.colorPrimary   |
// | bulletItemBg  | HEX (fondo de cada fila)                        | lighten(primary, 96%) |
//
// ── Estilos específicos: CTA ──
// | bandBgColor   | HEX (fondo de la banda/sección)                 | style.colorPrimary   |
// | btnBgColor    | HEX (fondo del botón)                           | '#ffffff'            |
// | btnTextColor  | HEX (texto del botón)                           | style.colorPrimary   |
//
// ── Estilos específicos: FOOTER ──
// | footerQrUrl   | URL para generar QR automático                  | ''                   |
// | footerQrLabel | Etiqueta del QR (ej: "Escanea para más info")   | ''                   |
// | footerCompanyInfo | Info empresa (razón social, dirección, etc.)| ''                   |
// | socialBtnColor | HEX (color de botones de redes)                | 'rgba(255,255,255,1)' |
//
// ── Estilos específicos: QUOTE ──
// | quoteIcon     | '❝' | '💬' | '🗣️' | '💡' | '✦' | '★' | '🔬' | '🧬' | 'none' | '❝' |
// | quoteBg       | HEX (fondo de la cita)                          | lighten(primary, 95%)|
// | quoteBorder   | HEX (borde izquierdo)                           | style.colorPrimary   |
// | quoteAuthorColor | HEX                                          | style.colorPrimary   |
//
// ── Estilos específicos: SOCIAL ──
// | socialBtnStyle | 'outline' | 'filled' | 'icon-only'            | 'outline'            |
// | socialBtnShape | 'pill' | 'rounded' | 'square'                 | 'pill'               |
// | socialBtnSize  | 'sm' | 'md' | 'lg'                            | 'md'                 |
// | socialBtnColor | HEX                                            | style.colorPrimary   |
//
// ── Estilos específicos: SPACER ──
// | spacerHeight  | '8'-'120' (string, px)                          | '32'                 |
// | spacerColor   | HEX o '' para transparente                      | '' (transparente)    |
//
// ── Estilos específicos: DIVIDER ──
// | dividerColor  | HEX (color de la línea)                         | '#e5e5ea'            |
// | dividerDotColor | HEX (color del punto central)                 | style.colorPrimary   |
//
// ── Estilos específicos: COLUMNS ──
// | headingLevel, accentBar, accentBarColor (mismos que TEXT)
// | El contenido usa '|||' como separador de columnas

```

### 1.2.1 Ejemplo de Respuesta IA Completa

Este JSON es lo que Gemini devolvería y se cargaría directamente en `setBlocks()` del editor:

```json
{
  "templateId": "sys-hero",
  "projectName": "Email Omeprazol - Webinar Marzo",
  "subject": "Nuevos datos de eficacia en ERGE",
  "emailSettings": {
    "preheaderText": "Descubra los resultados del estudio Fase III",
    "bodyBackground": "#f4f4f8",
    "containerWidth": 600,
    "borderRadius": 12
  },
  "blocks": [
    {
      "id": "ai_header_1",
      "type": "header",
      "content": "Omeprazol Pro",
      "imageUrl": "{{brand.logoUrl}}",
      "style": {
        "textAlign": "left",
        "fontSize": "14",
        "textTransform": "uppercase"
      }
    },
    {
      "id": "ai_hero_1",
      "type": "hero",
      "content": "Imagen médica gastroenterología",
      "imageUrl": "{{se genera con imageService.generateImage()}}",
      "style": {
        "heroTitle": "Nuevos datos de eficacia",
        "heroSubtitle": "Estudio Fase III en ERGE",
        "imgBorderRadius": "0",
        "imgShadow": "none"
      }
    },
    {
      "id": "ai_text_title_1",
      "type": "text",
      "content": "Eficacia comprobada",
      "style": {
        "headingLevel": "h2",
        "fontWeight": "bold",
        "fontSize": "24",
        "color": "{{brand.colorPrimary}}",
        "textAlign": "left"
      }
    },
    {
      "id": "ai_text_body_1",
      "type": "text",
      "content": "Los resultados del estudio multicéntrico confirman una tasa de curación del 92% en pacientes con úlcera gástrica tratados con Omeprazol Pro durante 8 semanas.",
      "style": {
        "fontSize": "16",
        "color": "#4a4a4a",
        "textAlign": "left"
      }
    },
    {
      "id": "ai_divider_1",
      "type": "divider",
      "content": "",
      "style": {
        "dividerColor": "#e5e5ea",
        "dividerDotColor": "{{brand.colorPrimary}}"
      }
    },
    {
      "id": "ai_bullets_1",
      "type": "bullets",
      "content": "Tasa de curación del 92% a 8 semanas\nPerfil de seguridad favorable vs placebo\nMejora significativa de calidad de vida (p<0.001)\nPosología de una toma diaria",
      "style": {
        "bulletStyle": "number",
        "bulletBadgeBg": "{{brand.colorPrimary}}",
        "fontSize": "15"
      }
    },
    {
      "id": "ai_cta_1",
      "type": "cta",
      "content": "DESCUBRIR MÁS",
      "ctaText": "Ver estudio completo",
      "ctaUrl": "https://...",
      "style": {
        "bandBgColor": "{{brand.colorPrimary}}",
        "btnBgColor": "#ffffff",
        "btnTextColor": "{{brand.colorPrimary}}",
        "textAlign": "center"
      }
    },
    {
      "id": "ai_footer_1",
      "type": "footer",
      "content": "Material exclusivo para profesionales de la salud. {{brand.disclaimerBadge}}",
      "socialLinks": [
        { "platform": "linkedin", "url": "" },
        { "platform": "web", "url": "" }
      ],
      "style": {
        "footerQrUrl": "{{brand.qrUrl}}",
        "footerQrLabel": "Más información",
        "footerCompanyInfo": "Laboratorio Ejemplo S.A. - Av. Providencia 1234, Santiago, Chile"
      }
    }
  ],
  "reasoning": "Elegí sys-hero por el alto impacto visual para un email sobre datos clínicos. Usé bullets numerados para los datos duros y un CTA claro para dirigir al estudio."
}
```

> **Nota**: Los valores `{{brand.xxx}}` se reemplazan en código por los valores reales del `AIMailingContext.brand` antes de asignar al estado del editor.

### 1.3 Función Constructora del Contexto

El archivo debe exponer una función `buildAIMailingContext()` que:

1. **Recibe**: `brandId` + `userPrompt`
2. **Consulta Firebase** para obtener:
   - Brand completa con `BrandParams` (colores, fonts, logos, claims)
   - Molécula asociada
   - Indicaciones de la molécula
   - Insights aprobados (`status === 'approved'`) de cada indicación
   - Knowledge Bank items del scope `global` + `brand`
3. **Consulta** las plantillas de email disponibles (system + custom del tenant)
4. **Retorna**: `AIMailingContext` completo listo para inyectar en el prompt

```typescript
export async function buildAIMailingContext(
  brandId: string,
  tenantId: string,
  userPrompt: string
): Promise<AIMailingContext>
```

---

## 2. FLUJO UX: "CREAR CON AI"

### 2.1 Ubicación del Botón

```
Paso 2: Seleccionar diseño
┌──────────────────────────────────────────────────┐
│  Filtros: [simple] [visual] [informativo] ...    │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Minimal  │ │ Hero     │ │ Editorial│  ...    │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  ┌─────────────────┐  ┌─────────────────┐       │
│  │ ✨ Crear con AI │  │ 📤 Subir Diseño │       │
│  └─────────────────┘  └─────────────────┘       │
└──────────────────────────────────────────────────┘
```

- Botón con ícono de sparkles (✨) y gradiente brand
- Posición: a la izquierda de "Subir Diseño"
- Mismo tamaño y estilo visual que "Subir Diseño"

### 2.2 Modal/Panel "Crear con AI"

Al hacer click en "✨ Crear con AI" se abre un **panel lateral derecho** (drawer) o un **modal centrado** con:

```
┌─────────────────────────────────────────┐
│  ✨ Crear Email con IA                  │
│                                         │
│  Marca: [Logo] Omeprazol Pro            │
│  ───────────────────────────            │
│                                         │
│  ¿Qué tipo de email quieres crear?      │
│                                         │
│  [Promocional] [Informativo]            │
│  [Newsletter]  [Invitación]             │
│  [Científico]  [Aviso breve]            │
│                                         │
│  Describe tu email:                     │
│  ┌─────────────────────────────────┐    │
│  │ Quiero un email para invitar    │    │
│  │ médicos gastroenterólogos a un  │    │
│  │ webinar sobre nuevos datos de   │    │
│  │ eficacia en úlcera gástrica... │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Opciones avanzadas ▼                   │
│  ┌─────────────────────────────────┐    │
│  │ □ Incluir hero image            │    │
│  │ □ Incluir datos clínicos        │    │
│  │ □ Incluir QR                    │    │
│  │ □ Incluir redes sociales        │    │
│  │ Tono: [Profesional ▼]          │    │
│  │ Longitud: [Medio ▼]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │      🚀 Generar Email           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Preview de marca detectada:            │
│  🎨 #1A5276  #2ECC71                   │
│  🔤 Montserrat / Open Sans             │
│  📋 3 claims aprobados                 │
│  📊 5 insights disponibles             │
└─────────────────────────────────────────┘
```

### 2.3 Flujo Completo

```
1. Usuario en /mailing/new
2. Paso 1: Selecciona marca → se cargan BrandParams
3. Paso 2: Click "✨ Crear con AI"
4. Se abre panel con:
   a. Resumen visual de la marca (colores, logo, fonts)
   b. Selector de tipo de email (tags)
   c. Textarea para prompt libre
   d. Opciones avanzadas (toggles)
5. Click "Generar Email"
6. Loading con animación + mensaje: "Analizando tu marca..."
7. IA genera:
   a. Selección inteligente de template base
   b. Contenido de cada bloque
   c. Imagen hero (si aplica)
   d. Subject line
   e. Preheader text
8. Se carga el resultado directo en StepEditor (Paso 3)
   → El usuario ve el email completo ya armado
   → Puede editar cualquier bloque manualmente
   → Puede regenerar bloques individuales con "✨ Sugerir"
9. Si no le gusta, puede volver al panel y ajustar el prompt
```

---

## 3. SISTEMA DE PROMPTS PARA GENERACIÓN

### 3.1 System Prompt Principal

El system prompt para generación de mailings debe:

```
ERES un experto en email marketing farmacéutico y diseño de mailings para la industria de salud.

Tu trabajo es crear emails HTML profesionales que cumplan con:
1. Regulaciones farmacéuticas (incluir disclaimer obligatorio)
2. Identidad visual de la marca (colores, tipografías, logos exactos)
3. Contenido basado EXCLUSIVAMENTE en claims aprobados e insights científicos validados
4. Compatibilidad con clientes de email (Outlook, Gmail, Apple Mail)

MARCA: {brand.name}
MOLÉCULA: {brand.moleculeName}
INDICACIONES: {indicationNames}

IDENTIDAD VISUAL:
- Color primario: {colorPrimary}
- Color secundario: {colorSecondary}
- Tipografía títulos: {fontTitle}
- Tipografía cuerpo: {fontBody}
- Logo: disponible (será insertado automáticamente)

CLAIMS APROBADOS (USAR SOLO ESTOS):
{claims formateados por indicación}

INSIGHTS CIENTÍFICOS VALIDADOS:
{insights con referencias}

REGLAS ESTRICTAS:
- NO inventar datos, cifras o porcentajes
- NO usar superlativos sin respaldo ("el mejor", "el más efectivo")
- SIEMPRE incluir disclaimer farmacéutico
- Respetar límites de caracteres por bloque
- Usar los colores de marca exactos (no aproximaciones)
- Subject line: máximo 60 caracteres
- Preheader: máximo 100 caracteres

FORMATO DE RESPUESTA:
Devuelve un JSON que cumpla con AIMailingResponse.
Cada bloque en "blocks" debe cumplir con MailingBlockContent (el formato exacto del editor).
Las keys de "style" deben ser las keys exactas que el editor interpreta (ver sección 1.2, mapa C).

{
  "templateId": "sys-xxx",             // ID del template base seleccionado
  "projectName": "...",                // Nombre interno del email
  "subject": "...",                    // Subject line (max 60 chars)
  "emailSettings": {
    "preheaderText": "...",            // Texto preview (max 100 chars)
    "bodyBackground": "#f4f4f8",       // Color de fondo outer
    "containerWidth": 600,             // Ancho del email
    "borderRadius": 12                 // Bordes redondeados
  },
  "blocks": [                          // Array de MailingBlockContent
    {
      "id": "ai_header_1",
      "type": "header",
      "content": "...",                // Nombre de marca
      "imageUrl": "...",               // URL del logo
      "style": {                       // Keys exactas del editor
        "textAlign": "left",
        "headerDate": "__hide__"       // o texto de fecha o vacío para auto
      }
    },
    {
      "id": "ai_text_1",
      "type": "text",
      "content": "...",
      "style": {
        "headingLevel": "h2",          // '' | 'h1' | 'h2' | 'h3' | 'h4'
        "fontWeight": "bold",
        "accentBarColor": "#1A5276"    // Usa colorPrimary de la marca
      }
    },
    {
      "id": "ai_bullets_1",
      "type": "bullets",
      "content": "Punto 1\nPunto 2\nPunto 3",  // Un punto por línea, SIN viñetas
      "style": {
        "bulletStyle": "number",       // 'number' | 'bullet' | 'letter' | 'none'
        "bulletBadgeBg": "#1A5276"
      }
    },
    {
      "id": "ai_cta_1",
      "type": "cta",
      "content": "DESCUBRE MÁS",       // Etiqueta superior (vacío = sin etiqueta)
      "ctaText": "Ver más detalles",   // Texto del botón
      "ctaUrl": "https://...",         // URL del botón
      "style": {
        "bandBgColor": "#1A5276",      // Fondo de la banda
        "btnBgColor": "#ffffff",       // Fondo del botón
        "btnTextColor": "#1A5276"      // Texto del botón
      }
    },
    {
      "id": "ai_footer_1",
      "type": "footer",
      "content": "Material exclusivo para profesionales de la salud.",
      "socialLinks": [{"platform": "linkedin", "url": ""}],
      "style": {
        "footerQrUrl": "https://...",
        "footerCompanyInfo": "..."
      }
    }
  ],
  "reasoning": "..."                   // Explicación de por qué eligió este diseño
}
```

### 3.2 Prompt Específico por Tipo de Email

Para cada tipo de email, se agrega un prompt adicional:

| Tipo | Prompt Adicional |
|------|-----------------|
| **Promocional** | "Enfócate en el CTA principal. Usa hero image impactante. Máximo 3 bloques de contenido antes del CTA." |
| **Informativo** | "Estructura con bullets y datos clínicos. Tono profesional y objetivo. Incluye referencias." |
| **Newsletter** | "Formato multi-sección con separadores. 3-4 secciones temáticas. Títulos descriptivos." |
| **Invitación** | "Destacar fecha/hora/lugar. CTA urgente. Incluir speaker/ponente si se menciona." |
| **Científico** | "Priorizar datos duros. Incluir bloque de citas. Tono académico. Fuentes verificables." |
| **Aviso breve** | "Máximo 3 bloques. Directo al punto. Un solo CTA claro." |

### 3.3 Prompt para Generación de Imágenes

Cuando el email requiera imágenes (hero, producto, etc.):

```
GENERA una imagen para email farmacéutico:
- Marca: {brand.name}
- Molécula: {moleculeName}
- Color primario: {colorPrimary}
- Color secundario: {colorSecondary}
- Contexto: {userPrompt extracto relevante}
- Estilo: medical_photo | scientific_illustration | abstract_premium
- Formato: 600x300px (hero) / 280x280px (thumbnail)
- RESTRICCIONES: 
  - NO incluir texto en la imagen
  - NO incluir logos (se insertan por separado)
  - Profesional y apto para contexto médico
  - Sin personas reales identificables
```

---

## 4. ARQUITECTURA TÉCNICA

### 4.1 Nuevos Archivos a Crear

```
src/
  services/
    aiMailingContext.ts          ← NUEVO: Tipos + buildAIMailingContext()
    aiMailingGenerator.ts        ← NUEVO: Orquestador de generación
  components/
    mailing/
      AIMailingPanel.tsx          ← NUEVO: Panel/drawer "Crear con AI"
      AIMailingLoading.tsx        ← NUEVO: Animación de loading con pasos
```

### 4.2 Archivos a Modificar

```
src/pages/MailingEditor.tsx      ← Agregar botón "Crear con AI" en StepDesign
                                    + handler handleAIGenerated(response: AIMailingResponse)
                                    + mapee response.blocks → setBlocks()
                                    + mapee response.subject → setSubject()
                                    + mapee response.emailSettings → setEmailSettings()
                                    + mapee response.projectName → setProjectName()
                                    + salte a step='editor' con todo precargado
```

> **Punto clave**: La respuesta de la IA genera `MailingBlockContent[]` directamente.  
> El `handleSelectDesign()` existente ya hace `setBlocks(initialBlocks)` — el flujo AI  
> hará exactamente lo mismo: `setBlocks(response.blocks)` sin transformación.
>
> **NO se modifica `mailingService.ts`** — ese archivo se mantiene solo con CRUD +  
> `suggestBlockCopy()`. Toda la lógica de generación AI va en `aiMailingGenerator.ts`.

### 4.2.1 Matriz de Responsabilidades (SRP)

| Archivo | Responsabilidad Única | NO debe hacer |
|---------|----------------------|---------------|
| `aiMailingContext.ts` | Definir tipos + recopilar contexto desde Firebase | Llamar a IA, parsear respuestas, generar HTML |
| `aiMailingGenerator.ts` | Orquestar la generación: prompt → IA → parse → validate → apply styles | Acceder a Firebase directamente (usa context), UI |
| `AIMailingPanel.tsx` | UI del panel: formulario + loading + callback | Lógica de negocio, llamadas a Firebase |
| `MailingEditor.tsx` | Recibir `AIMailingResponse` y cargar en estado | Generar contenido, buildContext |
| `mailingService.ts` | CRUD de MailingProject + `suggestBlockCopy()` | Generación AI completa (eso es de aiMailingGenerator) |
| `generationService.ts` | Se reutiliza `validateCompliance()` | NO se modifica, solo se importa |
| `imageService.ts` | Se reutiliza `generateImage()` | NO se modifica, solo se importa |

### 4.3 Flujo de Datos

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  UI: Panel   │────▶│ aiMailingContext  │────▶│ aiMailing       │
│  "Crear AI"  │     │ .ts              │     │ Generator.ts    │
│              │     │                  │     │                 │
│ - brandId    │     │ buildContext()   │     │ generateEmail() │
│ - prompt     │     │ ├─ getBrand()   │     │ ├─ Gemini call  │
│ - tipo       │     │ ├─ getClaims()  │     │ ├─ Parse JSON   │
│ - opciones   │     │ ├─ getInsights()│     │ ├─ Gen images   │
│              │     │ ├─ getKB()      │     │ ├─ Map blocks   │
└─────────────┘     │ └─ getTemplates()│     │ └─ Return       │
                     └──────────────────┘     └─────────────────┘
                                                      │
                                                      ▼
                                              ┌─────────────────┐
                                              │ MailingEditor    │
                                              │ StepEditor       │
                                              │                  │
                                              │ Blocks cargados  │
                                              │ con contenido IA │
                                              │ + imágenes       │
                                              │ + subject        │
                                              │ + estilos marca  │
                                              └─────────────────┘
```

### 4.4 Modelo de IA Principal

- **Generación de estructura + contenido**: Gemini 2.5 Flash (con fallback a DeepSeek)
- **Generación de imágenes hero**: Gemini 2.0 Flash Exp (con fallback a DALL-E 3)
- **Análisis de marca**: Gemini 2.5 Flash (reutilizar `extractBrandDNA`)

### 4.5 Secuencia de Llamadas IA

```
1. buildAIMailingContext()                      → Recopila contexto (Firebase, NO IA)
2. generateEmailStructureAndContent()           → 1 llamada Gemini: elige template +
                                                   genera todos los bloques + subject
                                                   + emailSettings en UN solo JSON
3. generateHeroImage() [opcional, en paralelo]  → imageService.generateImage() (1 call)
4. validateCompliance() [reutilizada]           → generationService.validateCompliance()
5. applyBrandStylesToBlocks()                   → Post-proceso local (NO IA)
```

Total: **2-3 llamadas a IA** por generación (optimizado para velocidad).

> **Decisión de diseño**: Template selection + content generation se hace en UNA sola llamada
> a Gemini. El modelo recibe el catálogo de templates y elige el mejor + genera el contenido
> en una sola respuesta JSON. Esto reduce latencia y costo vs 2 llamadas separadas.
>
> **Reutilización**: `validateCompliance()` ya existe en `generationService.ts` y funciona
> igual para mailing — valida que los claims usados estén en la lista aprobada.

---

## 5. INTELIGENCIA DE MARCA

### 5.1 Detección Automática de Identidad

Cuando se selecciona una marca, el sistema debe:

| Elemento | Fuente | Cómo se usa |
|----------|--------|-------------|
| **Logo** | `brand.params.logoUrl` / `brand.params.logos[]` | Se inserta en bloque `header` y `footer` |
| **Colores** | `brand.params.colorPrimary/Secondary` | Se aplican a gradientes, CTAs, headers, accents |
| **Tipografías** | `brand.params.fontTitle/fontBody` | Se configuran como Google Fonts en el email |
| **QR** | `brand.params.qrImageUrl` | Se inserta en bloque `footer` |
| **Disclaimer** | `brand.params.disclaimerBadge` | Se muestra obligatoriamente en footer |
| **Claims** | `brand.params.claims[]` | Se usan como fuente exclusiva de copy |
| **Tono** | `brand.communicationTone` (de Brand DNA) | Se inyecta en el prompt para el estilo de redacción |
| **Assets** | `brand.params.assets[]` | Se ofrecen como opciones para imágenes del email |

### 5.2 Aplicación Inteligente de Estilos

El generador debe mapear los colores de marca usando las **keys exactas** del `style: Record<string, string>` que `MailingEditor.tsx` interpreta en su `EmailVisualPreview` y `BlockEditor`:

```typescript
// Lógica de aplicación de colores — usa las keys reales del editor
function applyBrandStylesToBlocks(
  blocks: AIGeneratedBlock[],
  brand: AIMailingContext['brand'],
): AIGeneratedBlock[] {
  return blocks.map((block) => {
    const s = { ...block.style };

    switch (block.type) {
      case 'header':
        // El header usa gradient automático via computedStyle (no necesita style override)
        // Solo configurar logo, posición y fecha
        if (!block.imageUrl) block.imageUrl = brand.logoUrl;
        break;

      case 'hero':
        // Overlay automático en EmailVisualPreview cuando hay heroTitle
        s.heroTitle = s.heroTitle || '';
        s.heroSubtitle = s.heroSubtitle || '';
        break;

      case 'text':
        // Títulos: usar colorPrimary + accentBar con colorPrimary
        if (s.fontWeight === 'bold' || s.headingLevel) {
          if (!s.color) s.color = brand.colorPrimary;
          if (!s.accentBarColor) s.accentBarColor = brand.colorPrimary;
        }
        break;

      case 'bullets':
        // Badge con colorPrimary, fondo item con lighten
        if (!s.bulletBadgeBg) s.bulletBadgeBg = brand.colorPrimary;
        // bulletItemBg se calcula auto en el editor via lightenHex(badgeBg, 0.96)
        break;

      case 'cta':
        // Banda con colorPrimary, botón blanco con texto colorPrimary
        if (!s.bandBgColor) s.bandBgColor = brand.colorPrimary;
        if (!s.btnBgColor) s.btnBgColor = '#ffffff';
        if (!s.btnTextColor) s.btnTextColor = brand.colorPrimary;
        break;

      case 'footer':
        // Footer usa dark gradient automático via computedStyle
        // QR desde brand
        if (brand.qrUrl && !s.footerQrUrl) s.footerQrUrl = brand.qrUrl;
        // Disclaimer
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
```

> **Nota**: El `computedStyle` del editor (`{ colorPrimary, colorSecondary, colorBackground, fontTitle, fontBody, logoUrl }`) se aplica automáticamente a los bloques que no tienen override. La IA solo necesita setear `style` cuando quiere un valor diferente al default de marca.

---

## 6. GENERACIÓN INTELIGENTE DE CONTENIDO

### 6.1 Estrategia de Contenido por Bloque

Cada bloque generado debe respetar la interfaz `MailingBlockContent` y las propiedades que el `BlockEditor` sabe editar:

| Bloque | `content` | Propiedades específicas | `style` keys clave |
|--------|-----------|-------------------------|---------------------|
| `header` | Nombre de marca o título corto | `imageUrl` (logo) | `logoX`, `logoY`, `headerDate`, `textAlign`, `textTransform` |
| `hero` | Leyenda/alt text | `imageUrl` (imagen hero) | `heroTitle`, `heroSubtitle`, `imgWidth`, `imgBorderRadius`, `imgShadow` |
| `text` (título) | Título corto (3-4 palabras) | — | `headingLevel` (h1-h4), `fontWeight`='bold', `accentBar`, `accentBarColor` |
| `text` (párrafo) | Párrafo informativo (40-80 palabras) | — | `fontSize`, `color`, `textAlign` |
| `image` | Leyenda debajo de la imagen | `imageUrl` | `imgWidth`, `imgHeight`, `imgObjectFit`, `imgAlign`, `imgBorderRadius`, `imgShadow`, `imgBorder` |
| `bullets` | Un punto por línea (sep: `\n`, sin viñetas) | — | `bulletStyle` (number/bullet/letter/none), `bulletBadgeBg`, `bulletItemBg` |
| `cta` | Etiqueta superior (o vacío) | `ctaText` (texto botón), `ctaUrl` | `bandBgColor`, `btnBgColor`, `btnTextColor`, `textAlign` |
| `quote` | Texto de la cita | `quoteAuthor` | `quoteIcon`, `quoteBg`, `quoteBorder`, `quoteAuthorColor` |
| `footer` | Disclaimer + texto legal | `socialLinks[]` | `footerQrUrl`, `footerQrLabel`, `footerCompanyInfo`, `socialBtnColor` |
| `columns` | `"Col izq\|\|\|Col der"` (separador: `\|\|\|`) | — | `headingLevel`, `accentBar` |
| `social` | Texto opcional (ej: "Síguenos") | `socialLinks[]` | `socialBtnStyle`, `socialBtnShape`, `socialBtnSize`, `socialBtnColor` |
| `video` | Título del video | `videoUrl`, `imageUrl` (thumbnail) | texto general |
| `spacer` | `''` (vacío) | — | `spacerHeight` ('8'-'120'), `spacerColor` |
| `divider` | `''` (vacío) | — | `dividerColor`, `dividerDotColor` |

Adicionalmente, **todos los bloques** (excepto spacer/divider) soportan:
- `backgroundColor`, `backgroundImage` — fondo personalizado del bloque
- `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` — espaciado interno (0-120px)

### 6.2 Límites de Caracteres por Bloque

Alineados con las validaciones del `suggestBlockCopy()` en `mailingService.ts` y los constraints del `BlockEditor`:

```typescript
const CHAR_LIMITS = {
  // Email metadata
  subject: 60,
  preheader: 100,

  // Header
  header_content: 30,            // Nombre de marca o título corto (MÁXIMO 3-4 palabras)

  // Hero
  hero_title: 60,                // heroTitle en style (MÁXIMO 4 palabras)
  hero_subtitle: 100,            // heroSubtitle en style

  // Text
  text_title: 40,                // Cuando headingLevel está definido (MÁXIMO 3 palabras)
  text_body: 300,                // Párrafo normal

  // Bullets
  bullet_item: 80,               // Cada línea del content
  bullet_max_items: 6,           // Máximo líneas en content

  // CTA
  cta_label: 40,                 // content (etiqueta superior, opcional)
  cta_text: 25,                  // ctaText (texto del botón, 2-4 palabras)

  // Quote
  quote_text: 200,               // content
  quote_author: 50,              // quoteAuthor

  // Footer
  footer_disclaimer: 500,        // content
  footer_company_info: 300,      // footerCompanyInfo en style

  // Columns
  column_text: 200,              // Cada lado del |||

  // Video
  video_title: 60,               // content

  // Social
  social_text: 60,               // content (texto opcional)
};
```

### 6.3 Validación Post-Generación

Después de que la IA genera el contenido, se ejecuta automáticamente:

1. **Compliance check**: Verificar que todo claim usado esté en la lista aprobada
2. **Longitud check**: Ningún bloque excede su límite de caracteres
3. **Brand consistency**: Colores y fonts coinciden con los de la marca
4. **Estructura check**: Tiene header, al menos 1 bloque de contenido, CTA, y footer
5. **Disclaimer check**: El footer incluye el disclaimer obligatorio

---

## 7. EXPERIENCIA DE USUARIO

### 7.1 Loading Inteligente

Mientras se genera, mostrar progreso real:

```
┌─────────────────────────────────────┐
│                                     │
│   ✨ Creando tu email...            │
│                                     │
│   ✅ Analizando identidad de marca  │
│   ✅ Seleccionando estructura       │
│   🔄 Generando contenido...        │
│   ⬜ Creando imágenes               │
│   ⬜ Validando compliance           │
│                                     │
│   ━━━━━━━━━━━━━━░░░░░ 60%         │
│                                     │
└─────────────────────────────────────┘
```

### 7.2 Preview Rápido

Antes de cargar el editor completo, mostrar un preview rápido del email generado con opción de:
- **"Usar este diseño"** → Carga en StepEditor
- **"Regenerar"** → Vuelve a generar con el mismo prompt
- **"Ajustar prompt"** → Vuelve al panel de entrada

### 7.3 Edición Post-Generación

Una vez en StepEditor, el usuario tiene control total:
- Editar cualquier bloque manualmente
- Usar "✨ Sugerir" para regenerar un bloque individual
- Reordenar bloques con drag-and-drop
- Agregar/eliminar bloques
- Subir imágenes propias
- Cambiar estilos

---

## 8. PROMPTS DE EJEMPLO

### Ejemplo 1: Email Promocional
```
Usuario: "Email para presentar los nuevos datos de eficacia de Omeprazol Pro 
en úlcera gástrica. Destacar la tasa de curación del 92% y el perfil de seguridad. 
Dirigido a gastroenterólogos."
```

### Ejemplo 2: Invitación a Evento
```
Usuario: "Invitación a webinar sobre manejo de ERGE con Omeprazol Pro. 
Fecha: 15 de marzo, 19:00h. Ponente: Dr. García. Incluir botón de registro."
```

### Ejemplo 3: Newsletter
```
Usuario: "Newsletter mensual con 3 secciones: nuevos datos clínicos de eficacia, 
próximo congreso de gastroenterología, y recordatorio de dosificación."
```

### Ejemplo 4: Prompt Mínimo
```
Usuario: "Email informativo sobre Omeprazol Pro"
→ La IA debe ser capaz de generar algo completo solo con esto, 
  usando los claims e insights disponibles de la marca.
```

---

## 9. FASES DE IMPLEMENTACIÓN

### Fase 1: Archivo de Contexto (Fundación)
**Prioridad**: 🔴 Alta  
**Esfuerzo**: Bajo

- [ ] Crear `src/services/aiMailingContext.ts`
- [ ] Implementar `buildAIMailingContext()` que recopile toda la info de marca
- [ ] Implementar `buildSystemPrompt()` especializado en mailing
- [ ] Tests unitarios para el constructor de contexto
- [ ] Documentar la estructura del contexto

### Fase 2: Generador de Email con IA
**Prioridad**: 🔴 Alta  
**Esfuerzo**: Medio

- [ ] Crear `src/services/aiMailingGenerator.ts`
- [ ] Implementar `selectBestTemplate()` — IA elige template óptimo
- [ ] Implementar `generateEmailBlocks()` — genera contenido por bloque
- [ ] Implementar `mapBrandStylesToBlocks()` — aplica colores/fonts
- [ ] Implementar integración con `imageService.generateImage()` para hero
- [ ] Implementar validación post-generación (compliance + estructura)
- [ ] Fallback Gemini → DeepSeek

### Fase 3: UI del Panel "Crear con AI"
**Prioridad**: 🔴 Alta  
**Esfuerzo**: Medio

- [ ] Crear componente `AIMailingPanel.tsx` (drawer/modal)
- [ ] Implementar selector de tipo de email (chips/tags)
- [ ] Implementar textarea con prompt libre
- [ ] Implementar opciones avanzadas (toggles)
- [ ] Implementar resumen visual de marca detectada
- [ ] Crear `AIMailingLoading.tsx` con progreso por pasos
- [ ] Integrar botón "✨ Crear con AI" en StepDesign de MailingEditor

### Fase 4: Integración con Editor
**Prioridad**: 🔴 Alta  
**Esfuerzo**: Bajo-Medio

- [ ] Mapear respuesta IA → `MailingBlockContent[]` (formato del editor)
- [ ] Cargar bloques generados directamente en StepEditor
- [ ] Pre-aplicar estilos de marca (colores, fonts) a cada bloque
- [ ] Insertar logo, QR y disclaimer automáticamente
- [ ] Cargar subject y preheader en los campos correspondientes
- [ ] Permitir "Regenerar todo" desde StepEditor

### Fase 5: Preview y Refinamiento
**Prioridad**: 🟡 Media  
**Esfuerzo**: Bajo

- [ ] Preview rápido antes de cargar en editor
- [ ] Opción "Regenerar" con variación
- [ ] Opción "Ajustar prompt" (volver al panel)
- [ ] Historial de generaciones (últimos 3 intentos)

### Fase 6: Mejoras Avanzadas
**Prioridad**: 🟢 Baja  
**Esfuerzo**: Medio-Alto

- [ ] Generación A/B de emails (3 variantes para elegir)
- [ ] Sugerencias proactivas de email ("¿Quieres crear un email sobre X?")
- [ ] Aprendizaje de preferencias (recordar qué estilos elige el usuario)
- [ ] Prompt por voz (reutilizar `useSpeechRecognition`)
- [ ] Galería de emails generados previamente como referencia

---

## 10. CONSIDERACIONES TÉCNICAS

### 10.1 Performance
- La generación completa no debe superar **15 segundos**
- Paralelizar: generación de contenido + generación de imagen hero
- Cachear el `AIMailingContext` si la marca no cambió (evitar re-queries a Firebase)
- Usar streaming de Gemini si es posible para mostrar progreso real

### 10.2 Costos de API
- Gemini 2.5 Flash: ~$0.001-0.003 por generación de texto
- Gemini 2.0 Flash Exp (imagen): gratis pero rate-limited
- DALL-E 3 (fallback imagen): ~$0.04-0.08 por imagen
- **Estimación por email completo**: $0.01-0.10 dependiendo de imágenes

### 10.3 Error Handling
- Si Gemini falla → fallback a DeepSeek (solo texto, no imagen)
- Si la generación de imagen falla → usar placeholder + permitir subir después
- Si el JSON de respuesta es inválido → parse flexible (mismo patrón de `tryParseSlotValues`)
- Si no hay claims → advertir al usuario pero permitir generar con texto genérico limitado

### 10.4 Seguridad y Compliance
- **NUNCA** exponer API keys al prompt del usuario
- **NUNCA** dejar que el modelo invente datos clínicos
- Siempre ejecutar `validateCompliance()` post-generación
- Marcar visualmente los bloques que contienen claims no verificados
- Log de auditoría: quién generó qué, con qué prompt, cuándo

### 10.5 Reutilización de Código Existente

| Qué se reutiliza | Desde | Cómo |
|-------------------|-------|------|
| `validateCompliance()` | `generationService.ts` | Import directo, misma firma |
| `generateImage()` | `imageService.ts` | Import directo para hero image |
| `getKnowledgeForBrand()` | `knowledgeService.ts` | Combina global + brand knowledge |
| `getInsights()` | `insightService.ts` | Filtra por status='approved' |
| `getBrand()` | `brandService.ts` | Datos completos de marca |
| `getSystemTemplates()` | `designTemplateService.ts` | Catálogo de templates |
| `suggestBlockCopy()` | `mailingService.ts` | Se mantiene intacta (bloques individuales) |
| Patrón Gemini API | `generationService.ts` | Misma inicialización GoogleGenerativeAI |
| Patrón DeepSeek fallback | `generationService.ts` | Misma lógica fetch + Bearer token |
| Patrón JSON parsing | `generationService.tryParseSlotValues()` | Adaptado para AIMailingResponse |

> **Lo que NO se reutiliza** (se crea nuevo):
> - `buildMailingSystemPrompt()` — El prompt de mailing es completamente distinto al de diseño gráfico
> - `parseAIMailingResponse()` — Parser específico para el formato AIMailingResponse
> - `applyBrandStylesToBlocks()` — Lógica de post-proceso específica para bloques de email

---

## 11. MÉTRICAS DE ÉXITO

| Métrica | Objetivo |
|---------|----------|
| Tiempo de generación | < 15 segundos |
| Tasa de uso (vs manual) | > 60% de emails creados con IA |
| Ediciones post-generación | < 3 bloques editados en promedio |
| Compliance score | > 95% de emails pasan validación |
| Satisfacción del usuario | El email generado es usable "as-is" en > 40% de casos |

---

## 12. RESUMEN EJECUTIVO

### Lo que se construye:
Un botón **"✨ Crear con AI"** en el paso 2 del Mailing Composer que permite generar un email completo con un solo prompt, nutriéndose automáticamente de toda la identidad de marca (logos, colores, tipografías, claims aprobados, insights científicos).

### Lo que NO es:
- No es un chatbot conversacional (es generación one-shot con edición posterior)
- No es un reemplazo del editor manual (es un acelerador)
- No es un generador de contenido libre (está restringido a claims aprobados)

### Diferenciador clave:
A diferencia de Mailchimp o herramientas genéricas, este sistema:
1. **Conoce la marca** — No pide colores ni logos, ya los tiene
2. **Respeta compliance** — Solo usa claims aprobados por regulatorio
3. **Tiene contexto científico** — Accede a insights validados con referencias
4. **Es editable** — El resultado no es final, es un punto de partida inteligente
5. **Es farmacéutico** — Sabe de disclaimers, regulación y tono médico
