import { createMolecule, createIndication } from '@/services/moleculeService';
import { createInsight } from '@/services/insightService';
import { createBrand } from '@/services/brandService';
import { seedTemplates } from '@/services/templateService';
import type { InsightCategory, InsightReference } from '@/types';

/**
 * Genera un set completo de datos de demostración:
 * - 1 Molécula (Pregabalina)
 * - 2 Indicaciones (Dolor neuropático, Epilepsia)
 * - 6 Insights aprobados (con referencias)
 * - 1 Marca (Lyrica®) vinculada a la molécula
 * - 4 Plantillas seed
 */
export async function seedDemoData(tenantId: string, createdBy: string): Promise<{
  moleculeId: string;
  brandId: string;
}> {
  // ── 1. Molécula ───────────────────────────────────
  const moleculeId = await createMolecule({
    name: 'Pregabalina',
    tenantId,
    createdBy,
  });

  // ── 2. Indicaciones ───────────────────────────────
  const ind1Id = await createIndication({
    name: 'Dolor neuropático',
    moleculeId,
    tenantId,
    createdBy,
  });

  const ind2Id = await createIndication({
    name: 'Epilepsia – terapia adjunta',
    moleculeId,
    tenantId,
    createdBy,
  });

  // ── 3. Insights (ya aprobados para que el chat funcione) ──
  const demoInsights: {
    indicationId: string;
    text: string;
    category: InsightCategory;
    references: InsightReference[];
  }[] = [
    // Dolor neuropático
    {
      indicationId: ind1Id,
      text: 'Pregabalina logra una reducción ≥50% del dolor neuropático en el 67% de los pacientes tras 4 semanas de tratamiento.',
      category: 'benefit',
      references: [{
        documentId: 'demo-doc-1',
        documentName: 'estudio_fase3_neuropatia_2024.pdf',
        page: 12,
        section: '§3.2 – Resultados primarios',
        quote: 'El 67% de los pacientes reportó una reducción ≥50% en la escala EVA (p<0.001)',
      }],
    },
    {
      indicationId: ind1Id,
      text: 'El perfil de seguridad de pregabalina es favorable, con efectos adversos leves (somnolencia 12%, mareos 8%) que disminuyen tras la primera semana.',
      category: 'key_message',
      references: [{
        documentId: 'demo-doc-1',
        documentName: 'estudio_fase3_neuropatia_2024.pdf',
        page: 18,
        section: '§4.1 – Seguridad',
        quote: 'Los efectos adversos más frecuentes fueron somnolencia (12%) y mareos (8%), de intensidad leve y autolimitados',
      }],
    },
    {
      indicationId: ind1Id,
      text: 'Pregabalina mejora significativamente la calidad del sueño en pacientes con dolor neuropático (p<0.01 vs placebo).',
      category: 'benefit',
      references: [{
        documentId: 'demo-doc-2',
        documentName: 'meta_analisis_pregabalina_sueño_2023.pdf',
        page: 28,
        section: '§Discussion',
        quote: 'Sleep quality scores improved by 2.3 points on average compared to placebo (p<0.01)',
      }],
    },
    {
      indicationId: ind1Id,
      text: 'Indicada para el tratamiento del dolor neuropático periférico y central en adultos.',
      category: 'primary_use',
      references: [{
        documentId: 'demo-doc-3',
        documentName: 'ficha_tecnica_pregabalina.pdf',
        page: 1,
        section: 'Indicaciones terapéuticas',
        quote: 'Pregabalina está indicada para el tratamiento del dolor neuropático periférico y central en adultos',
      }],
    },
    // Epilepsia
    {
      indicationId: ind2Id,
      text: 'Como terapia adjunta, pregabalina reduce la frecuencia de crisis parciales en un 35-50% comparado con placebo.',
      category: 'benefit',
      references: [{
        documentId: 'demo-doc-4',
        documentName: 'estudio_epilepsia_adjunta_2024.pdf',
        page: 8,
        section: '§Results',
        quote: 'Seizure frequency was reduced by 35-50% in the pregabalin adjunctive therapy group vs placebo',
      }],
    },
    {
      indicationId: ind2Id,
      text: 'Contraindicada en pacientes con hipersensibilidad conocida a pregabalina o a alguno de los excipientes.',
      category: 'contraindication',
      references: [{
        documentId: 'demo-doc-3',
        documentName: 'ficha_tecnica_pregabalina.pdf',
        page: 2,
        section: 'Contraindicaciones',
        quote: 'Hipersensibilidad al principio activo o a alguno de los excipientes incluidos en la sección 6.1',
      }],
    },
  ];

  for (const insight of demoInsights) {
    await createInsight({
      indicationId: insight.indicationId,
      moleculeId,
      tenantId,
      text: insight.text,
      category: insight.category,
      references: insight.references,
      createdBy,
    });
  }

  // Aprobar todos los insights (simulando validación humana)
  // Los insights se crean como 'pending', necesitamos aprobarlos
  const { getInsights, approveInsight } = await import('@/services/insightService');
  const allInsights1 = await getInsights(ind1Id);
  const allInsights2 = await getInsights(ind2Id);
  for (const ins of [...allInsights1, ...allInsights2]) {
    await approveInsight(ins.id, createdBy);
  }

  // ── 4. Marca ──────────────────────────────────────
  const brandId = await createBrand({
    name: 'Lyrica®',
    moleculeId,
    params: {
      fontTitle: 'Helvetica Neue',
      fontBody: 'Open Sans',
      colorPrimary: '#1A3C7B',
      colorSecondary: '#F5A623',
      qrUrl: 'https://lyrica.lab.com/prospecto',
      logoUrl: '',
      assets: [],
    },
    tenantId,
    createdBy,
  });

  // ── 5. Plantillas ────────────────────────────────
  await seedTemplates(tenantId);

  return { moleculeId, brandId };
}
