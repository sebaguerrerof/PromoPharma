# PromoPharma – Arquitectura Funcional y Diseño Técnico

> **Versión:** 0.4 – Discovery (Template-First + Modelo Jerárquico + Marcas & Campañas)  
> **Fecha:** 2026-02-09  
> **Autor:** AI Architect / Product Engineer  
> **Estado:** Propuesta revisada – modelo de Marca→Campaña integrado
>
> **Decisión clave v0.2:** El design system ya está resuelto por el laboratorio.
> Las plantillas son artefactos pre-diseñados. **La IA solo genera/reemplaza texto.**
>
> **Decisión clave v0.3:** El contenido científico se organiza jerárquicamente:
> **Molécula → Indicaciones → Documentos por indicación → Insights por indicación.**
> Cada insight generado por IA lleva **referencias parametrizadas** al documento fuente.
>
> **Decisión clave v0.4:** La generación se organiza alrededor de **Marcas** y **Campañas**.
> Una Marca agrupa identidad visual, materiales de referencia y (opcionalmente) una molécula.
> Una Campaña es un proyecto de generación dentro de una marca. Desktop-first.

---

## 1. ARQUITECTURA FUNCIONAL DE ALTO NIVEL

### 1.1 Visión de Módulos

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CAPA DE PRESENTACIÓN                        │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Portal   │  │  Panel Admin │  │  Panel   │  │  Chat AI      │  │
│  │  Usuario  │  │  Laboratorio │  │ Superadmin│  │  (Generación) │  │
│  └──────────┘  └──────────────┘  └──────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                    CAPA DE LÓGICA DE NEGOCIO                       │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ M1: Identidad  │  │ M2: Gestión de │  │ M3: Marcas y         │  │
│  │ y Acceso       │  │ Moléculas/     │  │ Parámetros de Marca  │  │
│  │ (IAM)          │  │ Productos      │  │ (incl. materiales    │  │
│  │                │  │                │  │  de referencia)      │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────┐  ┌──────────────────────┐    │
│  │ M4: Campañas y Generación de    │  │ M5: Administración   │    │
│  │ Materiales (Motor AI)           │  │ y Métricas           │    │
│  │                                  │  │ (Superadmin)         │    │
│  └──────────────────────────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                      CAPA DE SERVICIOS IA                          │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ S1: Análisis   │  │ S2: Extracción │  │ S3: Generación de    │  │
│  │ Documental     │  │ de Insights    │  │ Contenido Textual    │  │
│  │ (Ingest +      │  │ (NLP/LLM)      │  │ (Solo texto para     │  │
│  │  Parsing)      │  │                │  │  slots de plantilla) │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
│  ┌────────────────┐  ┌────────────────┐                            │
│  │ S4: Análisis   │  │ S5: Inyección  │                            │
│  │ de Tono        │  │ en Plantilla   │                            │
│  │ (Materiales    │  │ (Template      │                            │
│  │  Históricos)   │  │  Filling)      │                            │
│  └────────────────┘  └────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                     CAPA DE DATOS Y STORAGE                        │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ Base de Datos  │  │ Vector Store   │  │ Object Storage       │  │
│  │ Relacional     │  │ (Embeddings    │  │ (Documentos, Assets, │  │
│  │ (Usuarios,     │  │  documentales) │  │  Materiales)         │  │
│  │  Config, etc.) │  │                │  │                      │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Descripción de Módulos

#### M1: Identidad y Acceso (IAM)
| Aspecto | Detalle |
|---------|---------|
| **Función** | Autenticación corporativa, gestión de roles, control de acceso por laboratorio |
| **Roles** | Usuario corporativo (marketing/científico), Admin laboratorio, Superadmin |
| **Aislamiento** | Cada laboratorio es un **tenant** aislado; los usuarios solo ven datos de su organización |
| **Requisito clave** | Login corporativo (implica integración con IdP empresarial) |

#### M2: Gestión de Contenido Científico (Moléculas → Indicaciones)

> **Actualizado v0.3:** El modelo de datos es jerárquico. El usuario no sube documentos
> directamente a la molécula, sino a una **indicación** dentro de la molécula.

| Aspecto | Detalle |
|---------|---------|
| **Función** | Gestión del contenido científico con estructura jerárquica: Molécula → Indicaciones → Documentos → Insights |
| **Jerarquía de datos** | Ver modelo jerárquico detallado abajo |
| **Flujo de usuario** | (1) Crear molécula → (2) Crear indicaciones dentro de la molécula → (3) Subir documentos científicos por indicación → (4) IA genera insights por indicación → (5) Usuario valida insights |
| **Output AI** | Beneficios, usos principales, mensajes clave, contraindicaciones, etc. — **por indicación**, no por molécula genérica |
| **Validación** | El usuario **debe** validar manualmente cada insight. La validación queda **ligada a la molécula e indicación** |
| **Referencias** | **Requisito crítico:** Cada insight generado lleva un **registro parametrizado de referencias** que indica exactamente de dónde se obtuvo la información (documento, página, sección) |

**Modelo jerárquico de contenido científico:**

```
  ┌─────────────────────────────────────────────────────────┐
  │  MOLÉCULA / MARCA                                       │
  │  Ej: "Pregabalina" o "Lyrica®"                          │
  │  [Botón +] → Crea nueva molécula                        │
  │                                                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  INDICACIÓN 1: "Dolor neuropático"                │  │
  │  │  ┌─────────────────────────────────────────────┐  │  │
  │  │  │  Documentos científicos:                    │  │  │
  │  │  │  📄 estudio_fase3_neuropatia_2024.pdf       │  │  │
  │  │  │  📄 guia_tratamiento_dolor_neuro.pdf        │  │  │
  │  │  │  📄 meta_analisis_pregabalina_neuro.pdf     │  │  │
  │  │  └─────────────────────────────────────────────┘  │  │
  │  │  ┌─────────────────────────────────────────────┐  │  │
  │  │  │  Insights generados (pendientes/validados): │  │  │
  │  │  │  ✅ "Reducción del 50% del dolor en 67%     │  │  │
  │  │  │      de pacientes" [REF: doc1, p.12, §3.2]  │  │  │
  │  │  │  ✅ "Inicio de acción en 1 semana"          │  │  │
  │  │  │      [REF: doc2, p.8, §Results]              │  │  │
  │  │  │  ⏳ "Perfil de seguridad favorable vs..."    │  │  │
  │  │  │      [REF: doc3, p.22, Table 4]              │  │  │
  │  │  └─────────────────────────────────────────────┘  │  │
  │  └───────────────────────────────────────────────────┘  │
  │                                                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  INDICACIÓN 2: "Epilepsia – terapia adjunta"      │  │
  │  │  ┌─────────────────────────────────────────────┐  │  │
  │  │  │  Documentos científicos:                    │  │  │
  │  │  │  📄 ensayo_epilepsia_adultos_2023.pdf       │  │  │
  │  │  │  📄 revision_sistematica_epilepsia.pdf      │  │  │
  │  │  └─────────────────────────────────────────────┘  │  │
  │  │  ┌─────────────────────────────────────────────┐  │  │
  │  │  │  Insights generados:                        │  │  │
  │  │  │  ✅ "Reducción ≥50% en frecuencia de..."    │  │  │
  │  │  │      [REF: doc1, p.18, §Primary endpoint]   │  │  │
  │  │  │  ...                                        │  │  │
  │  │  └─────────────────────────────────────────────┘  │  │
  │  └───────────────────────────────────────────────────┘  │
  │                                                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  INDICACIÓN 3: "Trastorno de ansiedad general."   │  │
  │  │  ...                                              │  │
  │  └───────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────┘
```

**¿Por qué esta jerarquía es importante?**
- Una misma molécula puede tener múltiples indicaciones aprobadas con evidencia científica diferente.
- Los materiales promocionales se crean **por indicación**, no por molécula genérica.
- Las referencias deben ser precisas: un claim sobre "dolor neuropático" no puede citar un estudio de "epilepsia".
- En la generación (S3), el contexto RAG se filtra por **molécula + indicación**, no solo por molécula.

#### M3: Marcas y Parámetros de Marca

> **Actualizado v0.4:** La **Marca** es la entidad central del módulo de generación.
> Agrupa identidad visual, materiales de referencia y opcionalmente una molécula.
> Los materiales históricos se gestionan dentro de cada marca (antes M4 separado).

| Aspecto | Detalle |
|---------|---------|
| **Función** | Gestión de marcas como entidad organizadora de la generación. Cada marca agrupa su identidad visual, materiales de referencia y, opcionalmente, su conexión con una molécula del módulo científico (M2). |
| **Flujo de creación** | (1) [+] Crear nueva marca → (2) Nombre de marca → (3) ¿Asociar a molécula? (Sí → seleccionar molécula existente en M2; No → sin vínculo) → (4) Configurar parámetros de marca → (5) Subir materiales históricos de referencia |
| **Asociación a molécula** | **Opcional.** Si se asocia, la molécula debe existir previamente en M2. Esto permite que las campañas de esta marca accedan a los insights validados y las indicaciones de esa molécula. Si no se asocia, la marca funciona sin base científica (ej: marca institucional). |
| **Parámetros de marca** | Tipografías/fuentes, colores primarios de la marca, QR vinculado al prospecto de la marca — todo configurado dentro de la herramienta por el usuario |
| **Materiales históricos** | Dentro de cada marca se suben materiales previos ya aprobados (PDF, PPT, JPG). Sirven como referencia de tono y estilo para la IA. Aparecen como **materiales seleccionables** al crear una campaña — el usuario elige cuáles usar como referencia. |
| **Plantillas** | Plantillas pre-diseñadas con slots de texto. Cada plantilla define zonas editables (título, cuerpo, bullets, disclaimer, etc.) y zonas fijas (layout, logos, imágenes). Disponibles para selección al crear campañas. |
| **Análisis AI de materiales** | Contenido **textual únicamente** → extracción de tono, registro y vocabulario. No se requiere análisis visual porque el diseño ya está resuelto en las plantillas. La IA replica tono y estilo de redacción; **no inventa contenido nuevo** a partir de estos materiales. |

**Vista de marca una vez creada:**

```
  ┌─────────────────────────────────────────────────────────────┐
  │  MARCA: "Lyrica®"                                          │
  │  Molécula asociada: Pregabalina (M2)                       │
  │                                                             │
  │  ┌─ Parámetros de marca ─────────────────────────────────┐  │
  │  │ Tipografías: Helvetica Neue (títulos), Open Sans (cuerpo)│
  │  │ Colores primarios: #1A3C7B (azul), #F5A623 (dorado)  │  │
  │  │ QR: → https://lyrica.lab.com/prospecto               │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Indicaciones (de M2) ────────────────────────────────┐  │
  │  │ • Dolor neuropático (8 insights validados)            │  │
  │  │ • Epilepsia – terapia adjunta (5 insights validados)  │  │
  │  │ • Trastorno de ansiedad generalizada (3 insights val.)│  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Materiales de referencia ────────────────────────────┐  │
  │  │ 📄 folleto_neuro_2024_aprobado.pdf       [Procesado]  │  │
  │  │ 📄 email_epilepsia_Q2.pptx               [Procesado]  │  │
  │  │ 📄 banner_congreso_2023.jpg               [Procesado]  │  │
  │  │                                                        │  │
  │  │ [+ Subir material de referencia]                       │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Campañas ────────────────────────────────────────────┐  │
  │  │ 📋 Campaña: "Folleto neurólogos Q3" → 2 materiales    │  │
  │  │ 📋 Campaña: "Email lanzamiento"     → 1 material      │  │
  │  │                                                        │  │
  │  │ [+ Crear nueva campaña]                                │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
```

#### M4: Campañas y Generación de Materiales (Motor AI)

> **Actualizado v0.4:** Una **Campaña** es un proyecto de generación que vive dentro
> de una marca. Hereda los parámetros de la marca y permite al usuario seleccionar
> qué materiales de referencia e indicaciones usar.

| Aspecto | Detalle |
|---------|---------|
| **Función** | Creación de campañas dentro de una marca. Cada campaña es un proyecto de generación de material promocional con contexto específico. |
| **Flujo de creación** | (1) Dentro de una marca → [+] Crear nueva campaña → (2) Se muestran los parámetros de marca ya configurados (fuentes, colores, materiales de referencia) → (3) Usuario confirma si desea mantenerlos → (4) Selección de plantilla → (5) Selección de indicaciones (si la marca tiene molécula asociada) → (6) Selección de materiales de referencia a usar → (7) Prompt conversacional con la IA |
| **Contexto heredado** | La campaña hereda de la marca: tipografías, colores, QR, y la lista de materiales de referencia disponibles. El usuario decide cuáles aplicar a esta campaña específica. |
| **Prompt del usuario** | Instrucción en lenguaje natural: "Quiero un folleto de 2 páginas, usando los materiales de referencia 1 y 3, relacionado a las indicaciones 1 y 4" |
| **Lo que genera la IA** | **Solo texto:** títulos, cuerpos, bullets, callouts, etc. adaptados a cada slot de la plantilla seleccionada |
| **Lo que NO genera la IA** | Diseño, layout, colores, tipografías, imágenes — todo eso viene de la plantilla pre-diseñada + parámetros de marca |
| **Fuentes permitidas** | Solo insights validados de las indicaciones seleccionadas + tono de materiales de referencia seleccionados |
| **Formatos de salida** | PDF, PPTX, JPG — según el formato nativo de la plantilla |

#### M5: Administración y Métricas (Superadmin)
| Aspecto | Detalle |
|---------|---------|
| **Función** | Dashboard global de la plataforma |
| **Métricas** | Por cliente, uso de IA, tipos de materiales generados |
| **Alcance** | Solo accesible por Superadmin (propietarios de la plataforma) |

---

## 2. FLUJOS DE IA – DEFINICIÓN DETALLADA

### 2.1 Flujo S1: Análisis Documental (Ingesta y Parsing)

> **Actualizado v0.3:** Los documentos se asocian a una **indicación** específica
> dentro de una molécula, no a la molécula genérica.

```
  Documento subido           Preprocesamiento              Almacenamiento
  (PDF, guía, paper)   →    ┌─────────────────┐     →    ┌──────────────┐
  asociado a una             │ • Extracción de │          │ Object Store │
  INDICACIÓN específica      │   texto (OCR si │          │ (archivo     │
                             │   es escaneado) │          │  original)   │
                             │ • Detección de  │          ├──────────────┤
                             │   estructura    │          │ Vector Store │
                             │   (secciones,   │          │ (chunks +    │
                             │   tablas, refs)  │          │  embeddings) │
                             │ • Chunking      │          └──────────────┘
                             │   semántico     │
                             └─────────────────┘
```

**Detalle del proceso:**

1. **Recepción:** El usuario carga documentos asociados a una **indicación** dentro de una molécula (ej: documento sobre "dolor neuropático" dentro de "Pregabalina").
2. **Parsing:** Extracción de texto plano. Si el PDF es escaneado o basado en imagen, se requiere OCR.
3. **Detección de estructura:** Identificar secciones semánticas (título, abstract, metodología, resultados, etc.), tablas y referencias.
4. **Chunking semántico:** Dividir el documento en fragmentos de tamaño controlado que preserven coherencia temática.
5. **Generación de embeddings:** Cada chunk se convierte en un vector numérico y se almacena en un Vector Store.
6. **Metadata obligatoria:** Cada chunk conserva trazabilidad a:
   - **tenant_id** (laboratorio)
   - **molécula_id**
   - **indicación_id** ← nuevo en v0.3
   - **documento_id** (archivo fuente)
   - **página** y **sección** del documento original

**Restricción crítica:** Solo se indexan documentos explícitamente subidos por el usuario para esa indicación. No se incorporan fuentes externas. Los chunks de una indicación no se mezclan con los de otra.

---

### 2.2 Flujo S2: Extracción de Insights por Indicación (NLP/LLM)

> **Actualizado v0.3:** La extracción opera **por indicación**, no por molécula.
> Cada insight generado lleva un **registro parametrizado de referencias**.

```
  Documentos de una        Prompt estructurado          Insights candidatos
  INDICACIÓN         →    ┌─────────────────────┐  →  ┌───────────────────────┐
  (via Vector Store)      │ LLM con instrucción: │     │ Insight 1:            │
                          │ "De ESTAS fuentes,   │     │  texto: "Reducción…"  │
                          │  genera información  │     │  tipo: beneficio      │
                          │  relevante para la   │     │  ┌─ REFERENCIAS ────┐ │
                          │  indicación X:       │     │  │ doc: estudio.pdf  │ │
                          │  - Beneficios        │     │  │ pág: 12           │ │
                          │  - Usos principales  │     │  │ sección: §3.2     │ │
                          │  - Mensajes clave    │     │  │ cita textual: "…" │ │
                          │  - Contraindicac.    │     │  └───────────────────┘ │
                          │  - Otros relevantes" │     │                       │
                          │                      │     │ Insight 2: …          │
                          │ Técnica: RAG sobre   │     │  ┌─ REFERENCIAS ────┐ │
                          │ chunks de ESTA       │     │  │ …                 │ │
                          │ indicación           │     │  └───────────────────┘ │
                          └─────────────────────┘     └───────────┬───────────┘
                                                                  │
                                                                  ▼
                                                       ┌───────────────────┐
                                                       │ 🛑 VALIDACIÓN     │
                                                       │    HUMANA         │
                                                       │    OBLIGATORIA    │
                                                       │                   │
                                                       │ Insight queda     │
                                                       │ LIGADO a la       │
                                                       │ molécula +        │
                                                       │ indicación        │
                                                       └───────────────────┘
```

**Detalle del proceso:**

1. **Retrieval (RAG):** Se recuperan los chunks del Vector Store filtrando por **molécula + indicación** específica.
2. **Prompt estructurado al LLM:** Con instrucciones explícitas de:
   - Extraer **solo** de las fuentes provistas para esa indicación.
   - Generar información relevante categorizada: beneficios, usos principales, mensajes clave, contraindicaciones, y cualquier dato relevante solicitado por el usuario.
   - **Para cada insight, generar un registro de referencia parametrizado** (ver sistema de referencias abajo).
   - No agregar conocimiento externo ni inferencias no soportadas por las fuentes.
3. **Output:** Lista estructurada de insights candidatos. **Cada insight incluye:**
   - Texto del insight
   - Categoría (beneficio / uso principal / mensaje clave / contraindicación / otro)
   - **Bloque de referencias** con: documento fuente, página, sección, y cita textual exacta
4. **Validación humana:** El usuario revisa cada insight junto con sus referencias. Puede:
   - **Aprobar** → el insight queda ligado a la molécula + indicación como conocimiento validado.
   - **Editar** → ajustar el texto manteniendo las referencias.
   - **Rechazar** → el insight se descarta.
5. **Persistencia:** Los insights validados quedan asociados a la indicación, no a la molécula en general.

**El knowledge base validado está organizado por: Molécula → Indicación → Insights validados (con referencias).**

#### Sistema de Referencias Parametrizado

> **Requisito explícito v0.3:** El sistema DEBE almacenar de dónde obtuvo cada
> pieza de información. Esto es esencialmente un sistema de citación estructurada.

Cada insight generado por la IA lleva un objeto de referencia con la siguiente estructura:

```
┌─────────────────────────────────────────────────────────────────┐
│  REFERENCIA PARAMETRIZADA                                       │
├──────────────────┬──────────────────────────────────────────────┤
│ documento_id     │ ID interno del documento fuente              │
│ documento_nombre │ "estudio_fase3_neuropatia_2024.pdf"          │
│ pagina           │ 12                                           │
│ seccion          │ "§3.2 – Resultados primarios"                │
│ cita_textual     │ "El 67% de los pacientes reportó una         │
│                  │  reducción ≥50% en la escala EVA (p<0.001)"  │
│ tipo_documento   │ ensayo clínico / meta-análisis / guía / etc. │
│ fecha_documento  │ 2024-03-15 (si disponible)                   │
└──────────────────┴──────────────────────────────────────────────┘
```

**Ejemplo de insight con sus referencias:**

```json
{
  "insight": {
    "texto": "Pregabalina logra una reducción ≥50% del dolor neuropático en el 67% de los pacientes",
    "categoria": "beneficio",
    "molecula": "Pregabalina",
    "indicacion": "Dolor neuropático",
    "estado": "validado",
    "validado_por": "usuario@lab.com",
    "fecha_validacion": "2026-02-09",
    "referencias": [
      {
        "documento_id": "doc-abc123",
        "documento_nombre": "estudio_fase3_neuropatia_2024.pdf",
        "pagina": 12,
        "seccion": "§3.2 – Resultados primarios",
        "cita_textual": "El 67% de los pacientes reportó una reducción ≥50% en la escala EVA (p<0.001)",
        "tipo_documento": "ensayo_clinico_fase3"
      },
      {
        "documento_id": "doc-def456",
        "documento_nombre": "meta_analisis_pregabalina_2023.pdf",
        "pagina": 28,
        "seccion": "§Discussion",
        "cita_textual": "Consistent with phase III data, pooled analysis confirmed ≥50% pain reduction in 63-71% of patients",
        "tipo_documento": "meta_analisis"
      }
    ]
  }
}
```

**¿Por qué este sistema es crítico?**
- **Regulatorio:** En farmacéutica, cada claim promocional debe poder rastrearse a evidencia científica específica. Sin referencias, el material es indefendible ante auditoría.
- **Confianza del usuario:** El usuario que valida un insight necesita ver exactamente de dónde viene para tomar una decisión informada.
- **Trazabilidad end-to-end:** Cuando se genera un material final, cada frase debería poder rastrearse: material → insight validado → referencia → documento → página.

---

### 2.3 Flujo S3: Generación de Contenido Textual (Template-First)

> **Principio clave:** El design system ya está resuelto. Las plantillas son artefactos
> pre-diseñados por el equipo de diseño del laboratorio. **La IA solo genera texto
> para rellenar los slots definidos en cada plantilla.**
>
> **Actualizado v0.4:** La generación ocurre dentro del contexto de una **Campaña**,
> que hereda los parámetros de su **Marca** padre.

```
  Campaña creada            Contexto heredado           Selección
  dentro de una marca  →   de la marca           →    de plantilla
                           ┌──────────────────┐        ┌──────────────┐
  "Campaña: Folleto        │ • Tipografías    │        │ • Folleto 2p │
   neurólogos Q3"          │ • Colores        │        │ • Email      │
                           │ • QR prospecto   │        │ • Banner     │
  Marca: "Lyrica®"        │ • Materiales de  │        │ • Slide deck │
  Molécula: Pregabalina    │   referencia     │        └──────┬───────┘
                           │   seleccionados  │               │
                           └──────────────────┘               │
                                                              ▼
                                                   ┌──────────────────────┐
                                                   │ Plantilla: Folleto   │
                                                   │ 2 páginas             │
                                                   │                      │
                                                   │ Slots definidos:     │
                                                   │ ┌─ titulo_principal  │
                                                   │ ├─ subtitulo         │
                                                   │ ├─ cuerpo_1 (300ch) │
                                                   │ ├─ cuerpo_2 (300ch) │
                                                   │ ├─ bullets (5 items) │
                                                   │ ├─ callout           │
                                                   │ └─ disclaimer (fijo) │
                                                   └──────────┬───────────┘
                                                              │
                                                              ▼
                          Chat AI iterativo         Textos generados
                         ┌─────────────────────┐   ┌──────────────────────┐
  "Destaca eficacia      │ Contexto inyectado:  │   │ titulo_principal:    │
   en mayores,           │ • Insights validados │ → │  "Eficacia probada…" │
   indicaciones          │   de las INDICACIONES│   │ subtitulo:           │
   1 y 4"           →   │   SELECCIONADAS      │   │  "Para el paciente…" │
                         │ • Tono de materiales │   │ cuerpo_1:            │
                         │   de referencia      │   │  "En ensayos clín…"  │
                         │   SELECCIONADOS      │   │ bullets:             │
                         │ • Parámetros de marca│   │  ["Reducción de…",   │
                         │   (fuentes, colores) │   │   "Perfil de seg…"]  │
                         │ • ESQUEMA DE SLOTS   │   │ callout:             │
                         │   (nombre, tipo,     │   │  "9 de 10 médicos…"  │
                         │    límite chars)     │   └──────────┬───────────┘
                         │                      │              │
                         │ Restricciones:       │              │
                         │ • NO inventar claims │              │
                         │ • NO salir de fuentes│              │
                         │ • Respetar límites   │              │
                         │   de cada slot       │              │
                         └─────────────────────┘              │
                                                              ▼
                                                   ┌──────────────────────┐
                                                   │ ⚠ USUARIO REVISA     │
                                                   │   textos generados   │
                                                   │                      │
                                                   │ ¿Ajustes? → Iterar   │
                                                   │ ¿OK? → Inyectar en   │
                                                   │         plantilla    │
                                                   └──────────┬───────────┘
                                                              │
                                                              ▼
                                                   ┌──────────────────────┐
                                                   │ S5: Inyección en     │
                                                   │ plantilla → Descarga │
                                                   │ PDF / PPTX / JPG     │
                                                   └──────────────────────┘
```

**Detalle del proceso:**

1. **Contexto de campaña:** La campaña ya tiene definido: marca padre (con sus parámetros), molécula asociada (si aplica), indicaciones seleccionadas, y materiales de referencia seleccionados.
2. **Selección de plantilla:** El usuario elige entre las plantillas pre-diseñadas disponibles para su laboratorio.
3. **El sistema presenta los slots de la plantilla:** Cada slot tiene un nombre, tipo (título/cuerpo/bullet/callout), límite de caracteres y restricciones.
4. **Prompt del usuario:** Instrucción en lenguaje natural vía chat (ej: "Destaca eficacia en pacientes mayores, usando las indicaciones 1 y 4, tono técnico").
5. **Composición del contexto al LLM:**
   - **Insights validados** filtrados por las **indicaciones seleccionadas** en la campaña (solo los aprobados en S2, con sus referencias).
   - **Tono y vocabulario** extraídos de los **materiales de referencia seleccionados** en la campaña (S4).
   - **Parámetros de marca** (tipografías, colores) — para contexto del LLM sobre la identidad visual.
   - **Esquema de slots** de la plantilla: el LLM sabe exactamente qué piezas de texto debe generar y con qué restricciones (longitud, tipo).
6. **El LLM genera un JSON estructurado** con el texto para cada slot:
   ```json
   {
     "titulo_principal": "Eficacia probada en el paciente mayor",
     "subtitulo": "Resultados sostenidos a 12 meses",
     "cuerpo_1": "En ensayos clínicos controlados...",
     "bullets": ["Reducción del 45% en...", "Perfil de seguridad..."],
     "callout": "9 de 10 médicos recomiendan..."
   }
   ```
7. **Revisión por el usuario:** Ve los textos generados (idealmente en preview sobre la plantilla). Puede:
   - Editar directamente el texto de un slot.
   - Pedir al chat que regenere un slot específico ("el callout debería ser más impactante").
   - Pedir ajustes globales ("todo más formal").
8. **Inyección y exportación (S5):** Los textos aprobados se inyectan en la plantilla y se exporta el archivo final.

**Restricción explícita:** El LLM **nunca genera claims médicos** que no estén respaldados por los insights validados. Cada afirmación debe ser trazable a un insight validado → referencia parametrizada → documento fuente → página y sección.

**Ventajas de este enfoque:**
- **Calidad visual garantizada:** El output siempre respeta el design system porque el diseño no se genera, se usa tal cual.
- **Problema acotado para la IA:** Generar texto para slots definidos es mucho más controlable que generar diseño + texto.
- **Consistencia de marca al 100%:** Imposible que la IA rompa la identidad visual.
- **Iteración rápida:** Cambiar un texto es instantáneo; no hay que re-renderizar layouts complejos.

---

### 2.4 Flujo S4: Análisis de Tono y Estilo Textual (Materiales de Referencia)

> **Nota v0.2:** Con el enfoque Template-First, el análisis visual de materiales históricos
> **ya no es necesario** — el diseño está resuelto en las plantillas. Este flujo se simplifica
> a análisis exclusivamente textual.
>
> **Nota v0.4:** Los materiales de referencia ahora se gestionan **dentro de cada marca** (M3).
> El análisis de tono se ejecuta sobre los materiales subidos a la marca.

```
  Material histórico       Análisis textual           Perfil de tono
  (PDF, PPT, JPG)    →   ┌─────────────────────┐  →  ┌──────────────────┐
                          │ Extracción de texto  │     │ • Tono           │
                          │ de los materiales    │     │   (formal/       │
                          │                      │     │    cercano)      │
                          │ Análisis:            │     │ • Registro       │
                          │ • Tono y registro    │     │   (técnico/      │
                          │ • Vocabulario        │     │    divulgativo)  │
                          │   recurrente         │     │ • Vocabulario    │
                          │ • Patrones de        │     │   preferido      │
                          │   estructura textual │     │ • Patrones de    │
                          │ • Longitud típica    │     │   fraseo         │
                          │   de frases          │     │                  │
                          │ • Nivel técnico      │     │ SOLO para guiar  │
                          │                      │     │ la REDACCIÓN,    │
                          └─────────────────────┘     │ NO el contenido  │
                                                      └──────────────────┘
```

**Detalle:**

1. **Ingesta:** Los materiales históricos se procesan para extraer **solo texto** (no se requiere análisis visual).
2. **Análisis textual:** Se identifica tono (formal/cercano), registro (técnico/divulgativo), vocabulario recurrente, longitud típica de frases y nivel de tecnicismo.
3. **Resultado:** Un "perfil de tono" por laboratorio (y opcionalmente por audiencia o tipo de material) que guía al LLM en la redacción.

**Restricción explícita:** El contenido de los materiales históricos **no se usa como fuente de claims**. Solo se usa para replicar el estilo de redacción.

**Simplificación v0.2:** Al no necesitar análisis visual, este flujo es significativamente más simple y confiable. Se elimina la dependencia de tecnologías de computer vision para análisis de layout.

---

### 2.5 Flujo S5: Inyección en Plantilla (Template Filling)

> **Nota v0.2:** Este servicio es ahora mucho más simple. No hay "renderizado" complejo
> ni composición de layout. Es una **inyección de texto en slots predefinidos** de una plantilla.

```
  Textos aprobados         Inyección en plantilla      Archivo final
  (JSON de slots)    →    ┌─────────────────────┐  →  ┌──────────────┐
                          │ 1. Abrir plantilla   │     │ PDF / PPTX / │
                          │    (archivo base)    │     │ JPG          │
                          │ 2. Para cada slot:   │     │              │
                          │    → Insertar texto  │     │ Idéntico al  │
                          │      en la zona      │     │ design system│
                          │      correspondiente │     │ del lab      │
                          │ 3. Exportar en       │     └──────────────┘
                          │    formato nativo    │
                          └─────────────────────┘
```

**Este servicio no involucra IA.** Es un motor de template filling determinista que:
1. Toma la plantilla pre-diseñada (archivo PPTX, HTML, o formato intermedio).
2. Inyecta el texto aprobado en cada slot según su identificador.
3. Los elementos fijos (logos, colores, imágenes, QR, disclaimers) ya están en la plantilla.
4. Exporta al formato final.

**Tecnología probable:** Manipulación programática de archivos PPTX (python-pptx), HTML-to-PDF (para folletos/banners), o similar. No se requiere IA generativa de imágenes ni layout engines complejos.

---

## 3. PUNTOS CRÍTICOS DE VALIDACIÓN HUMANA

A continuación se identifican los **7 puntos** donde la intervención humana es obligatoria o altamente recomendada, según lo descrito en los requisitos:

| # | Punto de validación | Módulo | Rol responsable | Tipo |
|---|---------------------|--------|-----------------|------|
| **V1** | Validación de insights extraídos por IA **por indicación**, incluyendo revisión de las referencias parametrizadas que respaldan cada insight | M2 / S2 | Usuario corporativo (marketing/científico) | **OBLIGATORIO** (explícito en requisitos) |
| **V2** | Aprobación de parámetros de marca, plantillas y lineamientos regulatorios | M3 | Admin de laboratorio | **OBLIGATORIO** (explícito en requisitos) |
| **V3** | Revisión iterativa del material generado durante la conversación con el chat AI en una campaña | M4 / S3 | Usuario corporativo | **OBLIGATORIO** (implícito: el usuario ajusta iterativamente) |
| **V4** | Revisión final antes de exportar/descargar el material de una campaña | M4 / S5 | Usuario corporativo | **RECOMENDADO** — ver pregunta abierta PA-3 |
| **V5** | Revisión del historial de materiales generados | M5 | Admin de laboratorio | **OBLIGATORIO** (explícito en requisitos) |
| **V6** | Verificación de que el perfil de tono extraído de materiales de referencia de la marca es correcto | M3 / S4 | Usuario corporativo / Admin | **RECOMENDADO** — ver pregunta abierta PA-6 |
| **V7** | Aprobación de plantillas y definición de sus slots de texto | M3 | Admin de laboratorio | **OBLIGATORIO** — las plantillas son el artefacto central del enfoque Template-First |

### Notas sobre validación:

- **V1 es el punto más crítico del sistema.** Si un insight incorrecto pasa la validación, todos los materiales que lo usen contendrán información potencialmente errónea o no respaldada. Se recomienda que este punto incluya:
  - Visualización de las **referencias parametrizadas** junto al insight: documento fuente, página, sección y cita textual exacta.
  - Posibilidad de **verificar la cita** navegando al punto exacto del documento original.
  - Posibilidad de editar el insight antes de aprobarlo.
  - Marca de estado clara: `pendiente → aprobado / rechazado`.
  - El insight aprobado queda **ligado a la molécula + indicación**, no flotando sin contexto.

- **V3 es inherente al flujo conversacional**, pero debería registrarse cada versión generada con su timestamp para auditoría. Los textos generados heredan las referencias de los insights que utilizaron.

---

## 4. ANÁLISIS DE RIESGOS

### 4.1 Riesgos Regulatorios

| ID | Riesgo | Severidad | Mitigación propuesta |
|----|--------|-----------|---------------------|
| **R-REG-1** | **Generación de claims no respaldados:** El LLM podría generar afirmaciones médicas que no están en los documentos fuente (alucinación). | 🔴 Crítica | Arquitectura RAG estricta + restricciones en system prompt + trazabilidad obligatoria de cada claim a un insight validado. Considerar un paso de verificación automatizada post-generación (¿cada afirmación tiene respaldo en los insights validados?). |
| **R-REG-2** | **Omisión de contraindicaciones o warnings obligatorios:** El material generado podría omitir información de seguridad requerida por normativa. | 🔴 Crítica | Las contraindicaciones validadas en V1 deberían marcarse como **contenido obligatorio** que el motor de generación incluye siempre (no opcional para el LLM). Las plantillas deberían tener secciones fijas para disclaimers. |
| **R-REG-3** | **Variación regulatoria por geografía:** Las regulaciones de materiales promocionales farmacéuticos varían significativamente entre países y regiones. | 🟡 Alta | Ver pregunta abierta PA-1. |
| **R-REG-4** | **Ausencia de flujo de aprobación regulatoria formal:** El requisito describe validación manual del usuario, pero no menciona un flujo de aprobación médico-legal-regulatorio antes de distribución. | 🟡 Alta | Ver pregunta abierta PA-2. |

### 4.2 Riesgos de Control de Fuente

| ID | Riesgo | Severidad | Mitigación propuesta |
|----|--------|-----------|---------------------|
| **R-SRC-1** | **Contaminación entre tenants:** Que información de un laboratorio se filtre al contexto de otro. | 🔴 Crítica | Aislamiento estricto a nivel de tenant en Vector Store y Object Storage. Cada query RAG filtra obligatoriamente por tenant_id. Tests de penetración específicos para data isolation. |
| **R-SRC-2** | **Conocimiento del LLM base filtrándose:** Los LLMs tienen conocimiento preentrenado sobre fármacos. El sistema podría generar contenido basado en el conocimiento general del modelo, no en los documentos del laboratorio. | 🔴 Crítica | System prompt con instrucción explícita de usar **exclusivamente** el contexto provisto. Considerar técnicas de detección de respuestas que no tienen grounding en los documentos. Posible verificación post-generación. |
| **R-SRC-3** | **Pérdida de trazabilidad:** No poder rastrear qué fuente respalda cada afirmación del material final. | 🟡 Alta | **Mitigado significativamente en v0.3** con el sistema de referencias parametrizadas. Cada insight lleva documento, página, sección y cita textual. Cadena completa: material → slot → insight validado → referencia → documento → página. Log de auditoría completo. |
| **R-SRC-4** | **Documentos fuente desactualizados:** El usuario podría generar materiales basados en documentos que ya no están vigentes. | 🟡 Media | Considerar metadatos de vigencia en los documentos. Ver pregunta abierta PA-4. |

### 4.3 Riesgos Técnicos

| ID | Riesgo | Severidad | Mitigación propuesta |
|----|--------|-----------|---------------------|
| **R-TEC-1** | **Calidad del OCR en documentos escaneados:** PDFs basados en imagen pueden tener errores de extracción que propaguen información incorrecta. | 🟡 Alta | Pipeline de calidad post-OCR. Considerar mostrar al usuario el texto extraído para validación en documentos con baja confianza OCR. |
| **R-TEC-2** | ~~**Renderizado fiel a reglas de marca.**~~ **MITIGADO por enfoque Template-First.** El design system está pre-resuelto en la plantilla. El único riesgo residual es que un texto excesivamente largo desborde un slot. | 🟢 Baja | Validar longitud de texto vs. límite del slot antes de inyectar. Truncar o advertir al usuario si hay overflow. |
| **R-TEC-3** | **Escalabilidad del Vector Store por tenant:** A medida que un laboratorio acumula documentos y moléculas, el volumen de embeddings crece. | 🟡 Media | Particionamiento por tenant + molécula. Estrategia de indexado eficiente. |
| **R-TEC-4** | ~~**Limitaciones del análisis visual de materiales históricos.**~~ **ELIMINADO por enfoque Template-First.** Ya no se requiere análisis visual, solo análisis textual de tono/estilo que es un problema bien resuelto por LLMs actuales. | 🟢 Eliminado | N/A |

### 4.4 Riesgos de Producto

| ID | Riesgo | Severidad | Mitigación propuesta |
|----|--------|-----------|---------------------|
| **R-PRD-1** | ~~**Expectativas de calidad visual.**~~ **ELIMINADO por enfoque Template-First.** La calidad visual es idéntica al design system del laboratorio porque el diseño no se genera, se usa tal cual. El output es pieza final, no borrador. | 🟢 Eliminado | N/A |
| **R-PRD-2** | **Sobrecarga de validación:** Si el usuario debe validar cada insight de cada documento de cada molécula, el proceso podría volverse tedioso y contraproducente. | 🟡 Media | UX de validación eficiente: aprobación en batch, vistas de confianza/prioridad, pero sin sacrificar la rigurosidad. |

---

## 5. PREGUNTAS ABIERTAS

Las siguientes preguntas **deben resolverse antes de la implementación** o durante las primeras iteraciones de diseño detallado:

### Regulatorias y de Cumplimiento

| ID | Pregunta | Impacto |
|----|----------|---------|
| **PA-1** | **¿En qué jurisdicciones/países operarán los laboratorios clientes?** Las regulaciones de promoción farmacéutica (ej: FDA 21 CFR en US, regulaciones EMA en EU, COFEPRIS en MX) varían drásticamente. ¿El sistema necesita contemplar reglas regulatorias por geografía? | Afecta: M3, S3, plantillas de disclaimer, contenido obligatorio |
| **PA-2** | **¿Existe un flujo de aprobación regulatoria formal antes de la distribución del material?** (Ej: revisión MLR – Medical, Legal, Regulatory). ¿El sistema debe soportar un workflow de aprobación multi-paso, o la validación iterativa en el chat es suficiente? | Afecta: M4, posiblemente un módulo nuevo de workflow de aprobación |
| **PA-3** | **¿Se requiere una "aprobación final" explícita antes de la exportación, o el acto de descargar es implícitamente la aprobación?** | Afecta: V4, auditoría, trazabilidad |

### Funcionales

| ID | Pregunta | Impacto |
|----|----------|---------|
| **PA-4** | **¿Los documentos científicos subidos tienen fecha de vigencia?** ¿Qué pasa cuando un documento se actualiza o se retira? ¿Los materiales generados previamente con esa fuente deben marcarse? | Afecta: M2, M3 (materiales de referencia), trazabilidad |
| **PA-5** | ~~¿Cuál es el nivel de calidad visual esperado?~~ **RESUELTO:** Calidad idéntica al design system del laboratorio. Las plantillas son pre-diseñadas, la IA solo inyecta texto. El output es una pieza final. | ~~Afecta: S3, S5~~ → Resuelto |
| **PA-6** | **¿Cómo se valida que el perfil de tono extraído de materiales históricos es correcto?** ¿El usuario ve un resumen del "perfil de tono" (ej: "tono formal, registro técnico, frases cortas") y lo aprueba? Ahora es solo análisis textual, no visual. | Afecta: S4, V6, UX |
| **PA-7** | **¿Cómo sube el laboratorio sus plantillas?** Con el enfoque Template-First, las plantillas son el artefacto central. ¿En qué formato se suben? (PPTX con placeholders, HTML+CSS, Figma export, etc.). ¿Quién define los slots de texto dentro de la plantilla? ¿El admin del laboratorio vía UI, o se requiere configuración técnica? | Afecta: M3, M4, S5, onboarding de clientes |
| **PA-8** | **¿El chat AI de generación mantiene historial entre sesiones?** ¿El usuario puede retomar una campaña días después y continuar la conversación, o cada sesión es independiente? | Afecta: M4, almacenamiento, UX |
| **PA-9** | ~~¿Puede un material referenciar múltiples moléculas/productos, o siempre es 1:1?~~ **PARCIALMENTE RESUELTO en v0.4:** La asociación marca→molécula es 1:1 o ninguna. Si se necesitan materiales que combinen moléculas, se necesitaría crear una marca sin molécula y usar insights manualmente. **Pendiente confirmar si esto es suficiente.** | Afecta: M3, M4, contexto RAG |
| **PA-10** | **¿Las imágenes son fijas en la plantilla o intercambiables?** Con el enfoque Template-First, ¿las imágenes ya están embebidas en cada plantilla (fijas)? ¿O existen "slots de imagen" donde el usuario puede elegir de un banco aprobado? Si hay slots de imagen, ¿la IA sugiere cuál usar, o es selección manual? | Afecta: M3, S5, complejidad de slots |

### Técnicas

| ID | Pregunta | Impacto |
|----|----------|---------|
| **PA-11** | **¿Qué proveedor(es) de LLM se contemplan?** (OpenAI, Azure OpenAI, Anthropic, modelo on-premise, etc.). ¿Existen restricciones de soberanía de datos que impidan enviar documentos farmacéuticos a APIs cloud? | Afecta: toda la capa de servicios IA, costos, latencia, compliance |
| **PA-12** | **¿Cuál es el volumen esperado?** (Número de laboratorios, usuarios por laboratorio, documentos por molécula, materiales generados por mes). | Afecta: arquitectura de infraestructura, costos, escalabilidad |
| **PA-13** | **¿El sistema debe funcionar como SaaS multi-tenant, o existe la posibilidad de despliegues on-premise por laboratorio?** | Afecta: arquitectura completa, modelos de datos, estrategia IAM |
| **PA-14** | **¿Qué nivel de auditoría y logging se requiere?** ¿Se necesita registrar cada prompt enviado al LLM, cada respuesta, cada versión de material? ¿Por cuánto tiempo? | Afecta: almacenamiento, costos, compliance |

### De Producto / UX

| ID | Pregunta | Impacto |
|----|----------|---------|
| **PA-15** | **¿El usuario ve una preview de la plantilla con los textos inyectados en tiempo real?** Con el enfoque Template-First, una preview sería natural: el usuario ve la plantilla real con los textos generados ya insertados. ¿Se requiere esta preview en vivo, o basta con ver los textos como lista y previsualizar al final? | Afecta: M4, complejidad de frontend |
| **PA-16** | **¿Existen integraciones con sistemas externos?** (DAM – Digital Asset Management, CRM, sistemas de aprobación regulatoria existentes del laboratorio). | Afecta: arquitectura de integración, nuevos módulos |

---

## 6. DIAGRAMA DE FLUJO END-TO-END

> **Actualizado v0.4:** El flujo ahora refleja las dos fases claras: (1) Setup científico
> (Molécula → Indicaciones) y (2) Setup de marca + generación (Marca → Campaña).

```
                     FASE 1: SETUP CIENTÍFICO (una vez por molécula + indicación)
                     ═══════════════════════════════════════════════════════════

  ┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ Login    │ ──→ │ [+] Crear    │ ──→ │ Crear        │ ──→ │ Subir docs   │
  │ corp.    │     │ molécula     │     │ indicaciones │     │ científicos  │
  │          │     │              │     │ dentro de la │     │ POR INDICACIÓN│
  └──────────┘     └──────────────┘     │ molécula     │     │ (PDF, papers)│
                                        └──────────────┘     └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │ IA extrae    │
                                                              │ insights POR │
                                                              │ INDICACIÓN   │
                                                              │ (S1 + S2)    │
                                                              │              │
                                                              │ Con REFS     │
                                                              │ parametriz.  │
                                                              └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │ 🛑 USUARIO   │
                                                              │ VALIDA cada  │
                                                              │ insight +    │
                                                              │ revisa refs  │
                                                              │ (V1)         │
                                                              └──────┬───────┘
                                                                     │
                     ┌───────────────────────────────────────────────┘
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ Knowledge Base VALIDADO                                │
  │ Organizado por: Molécula → Indicación → Insights      │
  │ Cada insight con referencias parametrizadas            │
  └────────────────────────────────────────────────────────┘


                     FASE 2: SETUP DE MARCA (una vez por marca)
                     ══════════════════════════════════════════

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │ [+] Crear nueva  │ ──→ │ ¿Asociar a       │ ──→ │ Configurar       │
  │ marca            │     │ molécula?        │     │ parámetros:      │
  │                  │     │                  │     │ • Tipografías    │
  │ Nombre: Lyrica®  │     │ Sí → Pregabalina │     │ • Colores        │
  │                  │     │ No → sin vínculo │     │ • QR prospecto   │
  └──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                             │
                                                             ▼
                                                    ┌──────────────────┐
                                                    │ Subir materiales │
                                                    │ de referencia    │
                                                    │ (PDF, PPT, JPG)  │
                                                    │                  │
                                                    │ IA extrae tono   │
                                                    │ y estilo (S4)    │
                                                    └────────┬─────────┘
                                                             │
                                                             ▼
                                                    ┌──────────────────┐
                                                    │ MARCA LISTA      │
                                                    │ Con: parámetros, │
                                                    │ indicaciones (de │
                                                    │ M2), materiales  │
                                                    │ de referencia    │
                                                    └──────────────────┘


                     FASE 3: GENERACIÓN (cada campaña)
                     ═════════════════════════════════

                          ┌──────────────────────────────────┐
                          │ Dentro de marca Lyrica®:          │
                          │ [+] Crear nueva campaña           │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ Se muestran parámetros de marca:  │
                          │ • Fuentes: Helvetica / Open Sans  │
                          │ • Colores: #1A3C7B / #F5A623      │
                          │ • Materiales de referencia: 3 docs │
                          │                                    │
                          │ ¿Mantener? [Sí] [Ajustar]         │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ Seleccionar plantilla             │
                          │ Seleccionar indicaciones          │
                          │ (ej: "indicaciones 1 y 4")        │
                          │ Seleccionar materiales de ref.    │
                          │ (ej: "folleto aprobado + email")  │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ Chat AI: prompt del usuario       │
                          │ "Quiero un folleto de 2 páginas,  │
                          │  usando los materiales 1 y 3,     │
                          │  indicaciones 1 y 4"              │
                          │                                    │
                          │ + contexto: insights validados    │
                          │   de ESA indicación + tono + slots│
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ IA genera textos para slots (S3) │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ 🛑 Usuario revisa (V3)           │
                          │ ¿Ajustes? ──→ Sí ──→ Iterar     │
                          │              └─→ No              │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ Inyección en plantilla (S5)      │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │ Descarga: PDF / PPTX / JPG       │
                          │ (con metadatos de trazabilidad   │
                          │  y referencias parametrizadas)   │
                          └──────────────────────────────────┘
```

---

## 7. RESUMEN DE DECISIONES ARQUITECTÓNICAS IMPLÍCITAS

Basado en los requisitos proporcionados, las siguientes decisiones se derivan naturalmente (no son asumidas):

| Decisión | Justificación |
|----------|---------------|
| **Arquitectura RAG (Retrieval-Augmented Generation)** | El sistema debe generar contenido basado exclusivamente en documentos del laboratorio, no en el conocimiento general del LLM. RAG es el patrón estándar para esto. |
| **Multi-tenancy** | Múltiples laboratorios con aislamiento de datos es inherente al modelo de roles (admin por laboratorio, superadmin global). |
| **Modelo jerárquico Molécula → Indicación** | Una molécula tiene múltiples indicaciones. Los documentos, insights y referencias se organizan por indicación. El contexto RAG filtra por molécula + indicación. |
| **Referencias parametrizadas obligatorias** | Cada insight generado por IA lleva un registro estructurado de dónde se obtuvo la información (documento, página, sección, cita textual). Esto es requisito regulatorio y de confianza. |
| **Template-First: la IA solo genera texto** | El design system está resuelto por el laboratorio en plantillas pre-diseñadas. La IA genera exclusivamente contenido textual para slots definidos. Un motor de template filling (no IA) inyecta los textos en la plantilla. Esto elimina riesgos de calidad visual y acota el problema de la IA a lo que mejor hace: generar texto. |
| **Marca como entidad central de generación** | La Marca agrupa identidad visual (parámetros), materiales de referencia y opcionalmente una molécula. Las Campañas son proyectos de generación dentro de una marca, heredando su contexto. Esto evita que el usuario reconfigure parámetros en cada generación. |
| **Campaña: proyecto de generación contextualizado** | Cada campaña hereda los parámetros de su marca y permite al usuario seleccionar qué indicaciones y materiales de referencia usar. El prompt se ejecuta con todo este contexto pre-cargado. |
| **Asociación molécula-marca opcional** | No todas las marcas necesitan una base científica (ej: marca institucional). Si se asocia, la molécula debe existir previamente en M2 y la marca puede acceder a sus indicaciones e insights validados. |
| **Almacenamiento dual: relacional + vectorial** | Datos estructurados (usuarios, config, proyectos) en BD relacional; embeddings documentales en Vector Store. |
| **Validación humana como requisito hard, no soft** | Explícito en los requisitos: "El usuario valida manualmente la información generada". No es un nice-to-have. |

---

> **Siguiente paso recomendado:** Resolver las preguntas abiertas (sección 5) con los stakeholders antes de avanzar al diseño técnico detallado (elección de stack, modelo de datos, diseño de API, estimación de esfuerzo).

---

## APÉNDICE A: CONCEPTO DE PLANTILLA CON SLOTS

Para clarificar el artefacto central del enfoque Template-First:

```
┌─────────────────────────────────────────────┐
│  PLANTILLA: "Folleto 2 páginas – Médicos"   │
│  Laboratorio: LabX                          │
│  Formato nativo: PPTX                       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ PÁGINA 1 ────────────────────────────┐  │
│  │                                       │  │
│  │  [LOGO LabX]           ← FIJO         │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: titulo_principal          │  │  │
│  │  │ Tipo: título                    │  │  │
│  │  │ Max: 60 caracteres              │  │  │
│  │  │ Font/color: definido en plantilla│  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: subtitulo                 │  │  │
│  │  │ Tipo: subtítulo                 │  │  │
│  │  │ Max: 90 caracteres              │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  │  [IMAGEN]               ← FIJO       │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: cuerpo_1                  │  │  │
│  │  │ Tipo: párrafo                   │  │  │
│  │  │ Max: 300 caracteres             │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: bullets                   │  │  │
│  │  │ Tipo: lista                     │  │  │
│  │  │ Items: 3-5                      │  │  │
│  │  │ Max por item: 80 caracteres     │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ PÁGINA 2 ────────────────────────────┐  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: cuerpo_2                  │  │  │
│  │  │ Tipo: párrafo                   │  │  │
│  │  │ Max: 400 caracteres             │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ SLOT: callout                   │  │  │
│  │  │ Tipo: destacado                 │  │  │
│  │  │ Max: 120 caracteres             │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │                                       │  │
│  │  [QR Code]              ← FIJO       │  │
│  │  [Disclaimer legal]     ← FIJO       │  │
│  │  [LOGO LabX]            ← FIJO       │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
├─────────────────────────────────────────────┤
│  Elementos FIJOS (no genera la IA):         │
│  • Layout completo y grid                   │
│  • Colores, tipografías, estilos            │
│  • Logos y posición                         │
│  • Imágenes                                 │
│  • QR codes                                 │
│  • Disclaimer legal                         │
│                                             │
│  Elementos DINÁMICOS (genera la IA):        │
│  • titulo_principal                         │
│  • subtitulo                                │
│  • cuerpo_1, cuerpo_2                       │
│  • bullets                                  │
│  • callout                                  │
└─────────────────────────────────────────────┘
```

Este modelo convierte el problema de "generar un material promocional" en el problema mucho
más acotado de **"generar texto optimizado para N slots con restricciones conocidas"** — que
es exactamente lo que los LLMs hacen mejor.

---

## APÉNDICE B: IMPACTO DEL ENFOQUE TEMPLATE-FIRST

### Lo que se simplifica

| Área | Antes (v0.1) | Ahora (v0.2 Template-First) |
|------|-------------|---------------------------|
| **S3: Generación** | LLM genera texto + estructura de layout | LLM genera solo texto para slots predefinidos con restricciones claras (formato JSON) |
| **S4: Análisis históricos** | Análisis textual + visual (computer vision) | Solo análisis textual de tono y estilo |
| **S5: Renderizado** | Motor de composición complejo (aplicar colores, tipografías, posicionar logos, etc.) | Template filling determinista: inyectar texto en slots |
| **Riesgo visual** | Alto (¿la IA generará diseño de calidad profesional?) | Eliminado (el diseño ya existe) |
| **Consistencia de marca** | Dependía de que la IA respetara reglas complejas | Garantizada por construcción |
| **Complejidad técnica** | Alta (layout engine + rendering pipeline) | Baja (string replacement en archivos PPTX/HTML) |

### Lo que se traslada al cliente (laboratorio)

| Responsabilidad | Quién |
|----------------|-------|
| Diseñar las plantillas con su design system | Equipo de diseño del laboratorio |
| Definir los slots de texto (nombre, tipo, límites) | Admin del laboratorio (con soporte de la plataforma) |
| Mantener las plantillas actualizadas | Admin del laboratorio |

### Nueva pregunta clave que surge

| ID | Pregunta | Impacto |
|----|----------|---------|
| **PA-17** | **¿Cuántas plantillas tendrá típicamente un laboratorio?** Si son pocas (5-15), el onboarding puede incluir configuración asistida. Si son muchas (50+), se necesita un editor de plantillas self-service robusto. | Afecta: M3, onboarding, pricing |
| **PA-18** | **¿En qué formato técnico se definen las plantillas?** Opciones: (a) PPTX con text placeholders nativos, (b) HTML/CSS con variables, (c) formato propietario con editor visual en la plataforma. Cada opción tiene trade-offs de flexibilidad vs. complejidad. | Afecta: M3, S5, stack técnico |
| **PA-19** | **¿Se cobra por plantilla o es ilimitado?** El modelo de plantillas podría ser un eje de pricing. | Afecta: modelo de negocio |

---

## APÉNDICE C: CADENA DE TRAZABILIDAD COMPLETA

> **Agregado v0.3:** Este apéndice muestra cómo se mantiene la trazabilidad
> end-to-end desde el material final hasta el documento científico original.
>
> **Actualizado v0.4:** La cadena ahora incluye la marca y campaña como contexto.

```
┌─────────────────────────────────────────────────────────────────────┐
│  MATERIAL FINAL (PDF/PPTX descargado)                              │
│  Campaña: "Folleto neurólogos Q3"                                  │
│  Marca: Lyrica® │ Molécula: Pregabalina                            │
│                                                                     │
│  Slot: cuerpo_1                                                     │
│  Texto: "Pregabalina logra una reducción ≥50% del dolor            │
│          neuropático en el 67% de los pacientes"                    │
│                                                                     │
│  ↓ ¿De dónde viene este texto?                                     │
├─────────────────────────────────────────────────────────────────────┤
│  INSIGHT VALIDADO #42                                               │
│  Texto: "Reducción ≥50% del dolor neuropático en 67%               │
│          de pacientes"                                              │
│  Categoría: beneficio                                               │
│  Molécula: Pregabalina                                              │
│  Indicación: Dolor neuropático                                      │
│  Estado: ✅ validado por usuario@lab.com (2026-02-09)               │
│                                                                     │
│  ↓ ¿De dónde se extrajo este insight?                               │
├─────────────────────────────────────────────────────────────────────┤
│  REFERENCIA PARAMETRIZADA                                           │
│  Documento: estudio_fase3_neuropatia_2024.pdf (doc-abc123)         │
│  Página: 12                                                         │
│  Sección: §3.2 – Resultados primarios                               │
│  Cita textual: "El 67% de los pacientes reportó una reducción       │
│                 ≥50% en la escala EVA (p<0.001)"                    │
│  Tipo: ensayo clínico fase 3                                        │
│                                                                     │
│  ↓ ¿Dónde está ese documento?                                      │
├─────────────────────────────────────────────────────────────────────┤
│  DOCUMENTO ORIGINAL                                                 │
│  Archivo: estudio_fase3_neuropatia_2024.pdf                        │
│  Almacenado en: Object Storage (tenant: LabX)                      │
│  Subido por: investigador@lab.com                                   │
│  Fecha de carga: 2026-01-15                                         │
│  Asociado a: Pregabalina → Dolor neuropático                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Esta cadena permite que cualquier auditor (interno o regulatorio) pueda:**
1. Tomar cualquier frase del material final.
2. Identificar qué insight validado la respalda.
3. Ver exactamente de qué documento, página y sección se extrajo.
4. Acceder al documento original para verificar la cita.
5. Saber quién validó el insight y cuándo.

---

## APÉNDICE D: FLUJO DE USUARIO – MÓDULO DE CONTENIDO CIENTÍFICO (UX)

> **Agregado v0.3:** Detalle de la experiencia de usuario paso a paso
> para el módulo de gestión de contenido científico (M2).

```
  ┌─────────────────────────────────────────────────────────────┐
  │  PANTALLA: Mis Moléculas                                    │
  │                                                             │
  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
  │  │ Pregaba-  │  │ Duloxe-   │  │ Gabapen-  │  │  [+]    │ │
  │  │ lina      │  │ tina      │  │ tina      │  │ Nueva   │ │
  │  │ 3 indic.  │  │ 2 indic.  │  │ 1 indic.  │  │molécula │ │
  │  └─────┬─────┘  └───────────┘  └───────────┘  └─────────┘ │
  └────────│────────────────────────────────────────────────────┘
           │ click
           ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PANTALLA: Pregabalina – Indicaciones                       │
  │                                                             │
  │  ┌───────────────────┐  ┌───────────────────┐  ┌─────────┐│
  │  │ Dolor neuropático │  │ Epilepsia –       │  │  [+]    ││
  │  │ 3 docs │ 8 insights│  │ terapia adjunta   │  │ Nueva   ││
  │  │ ✅ 6 validados     │  │ 2 docs │ 5 insights│  │indicac. ││
  │  │ ⏳ 2 pendientes    │  │ ✅ 5 validados     │  │         ││
  │  └─────────┬─────────┘  └───────────────────┘  └─────────┘│
  └────────────│────────────────────────────────────────────────┘
               │ click
               ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PANTALLA: Dolor neuropático – Contenido científico         │
  │                                                             │
  │  ┌─ Documentos ──────────────────────────────────────────┐  │
  │  │ 📄 estudio_fase3_neuropatia_2024.pdf     [Procesado]  │  │
  │  │ 📄 guia_tratamiento_dolor_neuro.pdf      [Procesado]  │  │
  │  │ 📄 meta_analisis_pregabalina_neuro.pdf   [Procesando] │  │
  │  │                                                        │  │
  │  │ [+ Subir documento]                                    │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Insights generados ─────────────────────────────────┐  │
  │  │                                                       │  │
  │  │ ✅ Beneficio: "Reducción ≥50% del dolor en 67%..."    │  │
  │  │    REF: estudio_fase3, p.12, §3.2                     │  │
  │  │    Validado por: usuario@lab.com (2026-02-09)         │  │
  │  │                                                       │  │
  │  │ ✅ Beneficio: "Inicio de acción en 1 semana"          │  │
  │  │    REF: guia_tratamiento, p.8, §Results               │  │
  │  │    Validado por: usuario@lab.com (2026-02-09)         │  │
  │  │                                                       │  │
  │  │ ⏳ Beneficio: "Perfil de seguridad favorable vs..."   │  │
  │  │    REF: meta_analisis, p.22, Table 4                  │  │
  │  │    [✅ Aprobar]  [✏️ Editar]  [❌ Rechazar]           │  │
  │  │                                                       │  │
  │  │ ⏳ Uso principal: "Dolor neuropático periférico       │  │
  │  │    y central en adultos"                              │  │
  │  │    REF: guia_tratamiento, p.3, §Indications           │  │
  │  │    [✅ Aprobar]  [✏️ Editar]  [❌ Rechazar]           │  │
  │  │                                                       │  │
  │  │ [🤖 Generar más insights]  [✅ Aprobar todos]         │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
```

**Flujo paso a paso:**

| Paso | Acción del usuario | Respuesta del sistema |
|------|-------------------|----------------------|
| 1 | Click en **[+] Nueva molécula** | Formulario: nombre de molécula/marca |
| 2 | Escribe "Pregabalina" y guarda | Se crea la ficha. Pantalla vacía de indicaciones |
| 3 | Click en **[+] Nueva indicación** | Formulario: nombre de la indicación |
| 4 | Escribe "Dolor neuropático" y guarda | Se crea la indicación. Pantalla vacía de documentos |
| 5 | Click en **[+ Subir documento]** | Selector de archivos (PDF, papers) |
| 6 | Sube 3 PDFs | Pipeline S1 procesa los documentos (parsing, chunking, embeddings) |
| 7 | Documentos procesados → Click **[🤖 Generar insights]** | Pipeline S2 ejecuta RAG + LLM sobre los documentos de ESTA indicación |
| 8 | Sistema muestra insights candidatos con referencias | El usuario ve cada insight + de dónde se extrajo |
| 9 | Por cada insight: **Aprobar / Editar / Rechazar** | Los aprobados pasan al knowledge base validado, ligados a Pregabalina → Dolor neuropático |
| 10 | Repite pasos 3-9 para otras indicaciones | Cada indicación tiene su propia base de conocimiento |

---

## APÉNDICE E: FLUJO DE USUARIO – MARCAS Y CAMPAÑAS (UX)

> **Agregado v0.4:** Detalle de la experiencia de usuario paso a paso
> para la creación de marcas (M3) y campañas (M4). **Desktop-first.**

### E.1 Pantalla: Mis Marcas

```
  ┌─────────────────────────────────────────────────────────────┐
  │  PANTALLA: Mis Marcas                                       │
  │                                                             │
  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐ │
  │  │ Lyrica®       │  │ Duloxetina    │  │     [+]         │ │
  │  │ Molécula:     │  │ Molécula:     │  │  Crear nueva    │ │
  │  │ Pregabalina   │  │ Duloxetina    │  │  marca          │ │
  │  │ 3 campañas    │  │ 1 campaña     │  │                 │ │
  │  └───────┬───────┘  └───────────────┘  └─────────────────┘ │
  └──────────│──────────────────────────────────────────────────┘
             │ click
             ▼
```

### E.2 Flujo: Crear Nueva Marca

```
  ┌─────────────────────────────────────────────────────────────┐
  │  PASO 1: Nombre de la marca                                 │
  │                                                             │
  │  Nombre: [____________________]                             │
  │                                                             │
  │  ¿Asociar a una molécula del módulo científico?             │
  │  ○ Sí → [Seleccionar molécula ▼] (solo moléculas de M2)    │
  │  ○ No → La marca funciona sin base científica               │
  │                                                             │
  │  [Siguiente →]                                              │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PASO 2: Parámetros de marca                                │
  │                                                             │
  │  Tipografías:                                               │
  │  ┌─ Títulos: [Subir fuente o seleccionar ▼]                │
  │  └─ Cuerpo:  [Subir fuente o seleccionar ▼]                │
  │                                                             │
  │  Colores primarios:                                         │
  │  ┌─ Color 1: [#______] 🎨                                  │
  │  └─ Color 2: [#______] 🎨                                  │
  │                                                             │
  │  QR vinculado al prospecto:                                 │
  │  └─ URL: [https://____________________]                    │
  │                                                             │
  │  [Siguiente →]                                              │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PASO 3: Materiales de referencia (opcional)                │
  │                                                             │
  │  Subir materiales previos ya aprobados para que la IA       │
  │  aprenda el tono y estilo de redacción de esta marca.       │
  │                                                             │
  │  📄 (arrastrar archivos o click para subir)                 │
  │  Formatos: PDF, PPT, JPG                                   │
  │                                                             │
  │  [Crear marca] [← Atrás]                                   │
  └─────────────────────────────────────────────────────────────┘
```

### E.3 Pantalla: Detalle de Marca

```
  ┌─────────────────────────────────────────────────────────────┐
  │  MARCA: "Lyrica®"                                          │
  │  Molécula asociada: Pregabalina                             │
  │                                                             │
  │  ┌─ Parámetros ──────────────────────────────────────────┐  │
  │  │ Tipografías: Helvetica Neue / Open Sans               │  │
  │  │ Colores: #1A3C7B, #F5A623                              │  │
  │  │ QR: lyrica.lab.com/prospecto              [Editar ✏️] │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Indicaciones (del módulo científico) ────────────────┐  │
  │  │ • Dolor neuropático       → 8 insights ✅             │  │
  │  │ • Epilepsia (adjunta)     → 5 insights ✅             │  │
  │  │ • Ansiedad generalizada   → 3 insights ✅             │  │
  │  │                                                        │  │
  │  │ (Las indicaciones se gestionan en el módulo M2)        │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Materiales de referencia ────────────────────────────┐  │
  │  │ ☐ 📄 folleto_neuro_2024_aprobado.pdf    [Procesado]   │  │
  │  │ ☐ 📄 email_epilepsia_Q2.pptx            [Procesado]   │  │
  │  │ ☐ 📄 banner_congreso_2023.jpg            [Procesado]   │  │
  │  │                                                        │  │
  │  │ [+ Subir material de referencia]                       │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  ┌─ Campañas ────────────────────────────────────────────┐  │
  │  │ 📋 "Folleto neurólogos Q3"  │ 2 materiales │ Activa   │  │
  │  │ 📋 "Email lanzamiento"      │ 1 material   │ Cerrada  │  │
  │  │ 📋 "Banner congreso XXII"   │ 1 material   │ Activa   │  │
  │  │                                                        │  │
  │  │ [+ Crear nueva campaña]                                │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
```

### E.4 Flujo: Crear Nueva Campaña (dentro de una marca)

```
  ┌─────────────────────────────────────────────────────────────┐
  │  NUEVA CAMPAÑA – Marca: Lyrica®                             │
  │                                                             │
  │  PASO 1: Confirmar parámetros de marca                      │
  │                                                             │
  │  Los siguientes parámetros vienen de tu marca:              │
  │  ┌──────────────────────────────────────────────────────┐   │
  │  │ Tipografías: Helvetica Neue / Open Sans              │   │
  │  │ Colores: #1A3C7B, #F5A623                             │   │
  │  │ QR: lyrica.lab.com/prospecto                          │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                             │
  │  ¿Mantener estos parámetros para esta campaña?              │
  │  [✅ Sí, mantener]  [✏️ Ajustar para esta campaña]         │
  │                                                             │
  │  [Siguiente →]                                              │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PASO 2: Seleccionar plantilla                              │
  │                                                             │
  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
  │  │ Folleto   │  │ Email     │  │ Banner    │  │ Slide   │ │
  │  │ 2 páginas │  │ campaña   │  │ congreso  │  │ deck    │ │
  │  │ 8 slots   │  │ 4 slots   │  │ 3 slots   │  │ 12 slots│ │
  │  └─────┬─────┘  └───────────┘  └───────────┘  └─────────┘ │
  │        ↓ seleccionado                                       │
  │                                                             │
  │  [Siguiente →]                                              │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PASO 3: Seleccionar indicaciones y materiales de referencia│
  │                                                             │
  │  Indicaciones disponibles (de Pregabalina):                 │
  │  ☑ Dolor neuropático (8 insights validados)                 │
  │  ☐ Epilepsia – terapia adjunta (5 insights)                 │
  │  ☑ Trastorno de ansiedad generalizada (3 insights)          │
  │                                                             │
  │  Materiales de referencia de la marca:                      │
  │  ☑ folleto_neuro_2024_aprobado.pdf                          │
  │  ☐ email_epilepsia_Q2.pptx                                  │
  │  ☑ banner_congreso_2023.jpg                                  │
  │                                                             │
  │  [Crear campaña →]                                          │
  └─────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  CAMPAÑA: "Folleto neurólogos Q3"                           │
  │  Marca: Lyrica® │ Plantilla: Folleto 2p │ Desktop          │
  │                                                             │
  │  ┌─ Chat AI ─────────────────────────────────────────────┐  │
  │  │                                                        │  │
  │  │  Usuario: "Quiero un folleto de 2 páginas para         │  │
  │  │  neurólogos, destacando eficacia en dolor neuropático  │  │
  │  │  y ansiedad. Tono técnico pero accesible."             │  │
  │  │                                                        │  │
  │  │  🤖 IA genera textos para los 8 slots:                 │  │
  │  │  ┌─────────────────────────────────────────────────┐   │  │
  │  │  │ titulo_principal: "Eficacia dual demostrada…"   │   │  │
  │  │  │ subtitulo: "Dolor neuropático y ansiedad…"      │   │  │
  │  │  │ cuerpo_1: "En ensayos clínicos controlados…"    │   │  │
  │  │  │ bullets: ["Reducción ≥50%…", "Inicio de…"]      │   │  │
  │  │  │ callout: "Doble beneficio en un solo…"          │   │  │
  │  │  │ …                                                │   │  │
  │  │  └─────────────────────────────────────────────────┘   │  │
  │  │                                                        │  │
  │  │  Usuario: "El callout debería ser más impactante"      │  │
  │  │  🤖 IA regenera callout: "9 de 10 neurólogos…"        │  │
  │  │                                                        │  │
  │  │  [✅ Aprobar y generar material]                       │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                             │
  │  → S5: Inyección en plantilla → Descarga PDF/PPTX          │
  └─────────────────────────────────────────────────────────────┘
```

### E.5 Flujo paso a paso: Marca → Campaña

| Paso | Acción del usuario | Respuesta del sistema |
|------|-------------------|----------------------|
| 1 | Click en **[+] Crear nueva marca** | Formulario: nombre + ¿asociar a molécula? |
| 2 | Escribe "Lyrica®", asocia a Pregabalina | Se crea la marca vinculada a la molécula |
| 3 | Configura parámetros (fuentes, colores, QR) | Se guardan como parámetros de marca |
| 4 | Sube 3 materiales de referencia | Pipeline S4 extrae tono y estilo de cada material |
| 5 | Entra a la marca → ve indicaciones de Pregabalina | Sistema muestra indicaciones con sus insights validados (de M2) |
| 6 | Click en **[+] Crear nueva campaña** | Wizard de campaña: paso 1 confirmar parámetros |
| 7 | Confirma parámetros de marca | Paso 2: seleccionar plantilla |
| 8 | Selecciona "Folleto 2 páginas" | Paso 3: seleccionar indicaciones y materiales de referencia |
| 9 | Marca indicaciones 1 y 3, materiales 1 y 3 | Se crea la campaña con el contexto seleccionado |
| 10 | Escribe prompt en el chat AI | S3 genera textos para los slots de la plantilla, usando insights de las indicaciones seleccionadas + tono de los materiales seleccionados |
| 11 | Revisa textos, pide ajustes | IA regenera slots específicos o ajusta tono |
| 12 | Aprueba textos finales | S5 inyecta textos en plantilla → descarga PDF/PPTX/JPG |
