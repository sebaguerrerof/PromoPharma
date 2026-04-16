# PharmaDesign AI 3.0 — Plan "CRM de Diseños" + Mailing First

## Visión

Transformar PharmaDesign de un "generador automático" a un **CRM de diseños** donde el usuario:
- Construye piezas **página por página** (como un puzzle)
- Elige y reutiliza **diseños existentes** (importados, creados, del sistema)
- Tiene **control total** sobre cada página antes de avanzar a la siguiente
- La IA **asiste** pero no impone — sugiere copy, variantes, layouts
- Empieza por **mailing** como primer tipo de pieza

---

## Estado actual del proyecto

### ✅ Lo que ya funciona
- Auth + Multi-tenant (Firebase)
- Moléculas → Indicaciones → Documentos → Insights (CRUD completo)
- Marcas + Brand Identity (colores, fonts, logos, claims, assets, QR)
- Knowledge Bank (materiales de referencia por marca)
- Chat IA con Gemini 2.5 Flash (generación de contenido)
- Canvas Editor WYSIWYG con 6 variantes visuales
- Exportación PPTX / PDF / JPG
- Análisis de diseño desde PDFs importados
- Brochure locked mode (mantener consistencia visual)

### 🔄 Lo que se mantiene sin cambios
- Módulo científico completo (moléculas, indicaciones, insights)
- Brand Identity y parámetros de marca
- Knowledge Bank
- Auth + seguridad multi-tenant
- Análisis de diseño (se mejora y conecta con Design Library)

### 🔀 Lo que evoluciona
- Templates: de 4 hardcoded → biblioteca creciente (Design Library)
- Generate.tsx: de generación automática → page builder controlado
- CanvasEditor: se adapta para editar bloques/páginas individuales

### 🆕 Lo que es nuevo
- Módulo de Mailing completo
- Design Library (CRM de diseños)
- Page Builder (puzzle página por página)

---

## Fases de implementación

---

### FASE 0 — Design Library (Base de datos de diseños)
> *Fundamento: tener dónde guardar y consultar diseños reutilizables*

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 0.1 | Definir tipo `DesignTemplate` + `DesignLayout` + `DesignBlock` en types/index.ts | ✅ Completada | Incluye DesignCategory, DesignSource, DesignBlockType |
| 0.2 | Crear `designTemplateService.ts` (CRUD Firestore + in-memory) | ✅ Completada | 12 system templates in-memory + CRUD Firestore para custom |
| 0.3 | Galería Elementor-style con 12 layouts de email + filtros por tags | ✅ Completada | 6 categorías (simple, visual, informativo, promocional, científico, newsletter) |
| 0.4 | Página `/designs` — galería de diseños por marca | ⬜ Pendiente | |
| 0.5 | Conectar análisis de PDF existente → guardar como `DesignTemplate` | ⬜ Pendiente | |

---

### FASE 1 — Mailing Composer (MVP)
> *Primer tipo de pieza: crear emails de marca*

#### 1A. Email básico con bloques editables

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 1.1 | Definir tipo `MailingProject` + `MailingBlock` en types/index.ts | ✅ Completada | MailingProject + MailingBlockContent + MailingStatus |
| 1.2 | Crear `mailingService.ts` (CRUD proyectos de mailing en Firestore) | ✅ Completada | CRUD + generateMailingHTML() |
| 1.3 | Página `/mailing` — lista de emails creados | ✅ Completada | Cards con status badge, delete, navegación |
| 1.4 | Página `/mailing/new` — Paso 1: seleccionar marca | ✅ Completada | Cards de marca con colores y fonts |
| 1.5 | `/mailing/new` — Paso 2: galería Elementor-style con filtros y hover | ✅ Completada | 12 system designs + custom designs + tag filters + hover overlay |
| 1.6 | `/mailing/new` — Paso 3: editor de bloques inline | ✅ Completada | Panel izq (bloques) + centro (preview) + der (editor) |
| 1.7 | Colores y fonts de la marca aplicados automáticamente al email | ✅ Completada | Hereda de Brand.params al crear |
| 1.8 | Logo de marca insertado automáticamente en header | ✅ Completada | logoUrl en style + auto-inject en header blocks + HTML export |
| 1.9 | Preview de email (desktop / mobile) | ✅ Completada | Toggle desktop/mobile con ancho dinámico |
| 1.10 | Export HTML básico (descarga) | ✅ Completada | HTML tables-based, inline CSS, compatible email clients |

#### 1B. IA asistente para copy

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 1.11 | Botón "Sugerir texto" en cada bloque de texto | ✅ Completada | "✨ Sugerir con IA" en BlockEditor para text/bullets/cta/header/hero/footer |
| 1.12 | Prompt IA con contexto: marca + claims + insights + bloque específico | ✅ Completada | suggestBlockCopy() en mailingService.ts — Gemini 2.5 Flash con claims + insights + knowledge |
| 1.13 | El usuario elige entre 2-3 variantes de copy sugeridas | ✅ Completada | 3 variantes (informativo/persuasivo/conciso) con cards clickeables |

#### 1C. Diseños de email importados

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 1.14 | Subir email HTML existente o screenshot → analizar layout | ✅ Completada | Upload JPG/PNG/PDF en StepDesign + analyzeEmailDesign() con Gemini |
| 1.15 | Guardar como DesignTemplate en la Library | ✅ Completada | Se guarda en Firestore como custom DesignTemplate source='imported' |
| 1.16 | Crear nuevo email basado en diseño importado | ✅ Completada | Diseños importados aparecen en tab "Mis diseños" y se usan igual |

---

### FASE 2 — Page Builder (Puzzle)
> *Extender el concepto a piezas multipágina (folletos, presentaciones)*

#### 2A. Creación página por página

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 2.1 | Refactorizar flujo de generación: una página a la vez | ⬜ Pendiente | |
| 2.2 | Selector de diseño base para cada página (desde Design Library) | ⬜ Pendiente | |
| 2.3 | Editor de contenido por página con IA opcional | ⬜ Pendiente | |
| 2.4 | Botón "Aprobar página" → avanzar a la siguiente | ⬜ Pendiente | |
| 2.5 | Botón "+ Añadir página" para seguir construyendo | ⬜ Pendiente | |
| 2.6 | Panel lateral con thumbnails de todas las páginas | ⬜ Pendiente | |

#### 2B. Reutilización de diseños

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 2.7 | Al crear página: elegir diseño de biblioteca o "mismo que página X" | ⬜ Pendiente | |
| 2.8 | Opción "diseño vacío" para empezar desde cero | ⬜ Pendiente | |

#### 2C. Guardar diseño como template

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 2.9 | Botón "Guardar como diseño" después de editar una página | ⬜ Pendiente | |
| 2.10 | Se guarda en Design Library para reutilización futura | ⬜ Pendiente | |

---

### FASE 3 — Mejoras de IA controlada
> *La IA asiste pero el usuario decide*

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 3.1 | Sugerencias de contenido bloque por bloque (botón "IA sugiere") | ⬜ Pendiente | |
| 3.2 | Variantes: 2-3 opciones de copy por bloque | ⬜ Pendiente | |
| 3.3 | Análisis de diseño mejorado (mejor extracción de layout desde PDF) | ⬜ Pendiente | |
| 3.4 | Variantes visuales: mostrar misma página en 3-4 estilos diferentes | ⬜ Pendiente | |

---

### FASE 4 — Export profesional + Integraciones
> *Output útil para el mundo real*

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 4.1 | Export email HTML responsive (tables-based, inline CSS) | ⬜ Pendiente | Compatible Gmail/Outlook |
| 4.2 | PDF alta resolución | ⬜ Pendiente | |
| 4.3 | PPTX editable con fonts embebidas | ⬜ Pendiente | |
| 4.4 | PNG/JPG con resolución configurable | ⬜ Pendiente | |
| 4.5 | Historial de versiones por pieza | ⬜ Pendiente | |

---

## Resumen de progreso

| Fase | Total tareas | ✅ Hechas | ⬜ Pendientes | Progreso |
|------|-------------|-----------|--------------|----------|
| Fase 0 — Design Library | 5 | 3 | 2 | 60% |
| Fase 1A — Mailing MVP | 10 | 10 | 0 | 100% |
| Fase 1B — IA copy | 3 | 3 | 0 | 100% |
| Fase 1C — Email importado | 3 | 3 | 0 | 100% |
| Fase 2A — Page Builder | 6 | 0 | 6 | 0% |
| Fase 2B — Reutilización | 2 | 0 | 2 | 0% |
| Fase 2C — Guardar diseño | 2 | 0 | 2 | 0% |
| Fase 3 — IA controlada | 4 | 0 | 4 | 0% |
| Fase 4 — Export | 5 | 0 | 5 | 0% |
| **TOTAL** | **40** | **19** | **21** | **48%** |

---

## Próximo paso

👉 **Próximo**: Fase 0.4 (página /designs — galería de diseños por marca) + Fase 2 (Page Builder)

---

## Leyenda

- ⬜ Pendiente
- 🔄 En progreso
- ✅ Completada
- ⛔ Bloqueada
