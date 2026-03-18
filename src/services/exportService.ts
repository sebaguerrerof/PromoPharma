import PptxGenJS from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Brand, Template, GenerationSession, TemplateSlot, BrochureLayoutSpec } from '@/types';

// ── Helpers ─────────────────────────────────────────────

/** Convierte hex (#RRGGBB) a formato pptxgenjs (RRGGBB sin #) */
function hexToRgb(hex: string): string {
  return hex.replace('#', '');
}

/** Agrupa slots por número de slide */
function groupSlotsBySlide(slots: TemplateSlot[]): Map<number, TemplateSlot[]> {
  const map = new Map<number, TemplateSlot[]>();
  for (const slot of slots) {
    const match = slot.id.match(/^slide(\d+)_/);
    const num = match ? parseInt(match[1], 10) : 1;
    if (!map.has(num)) map.set(num, []);
    map.get(num)!.push(slot);
  }
  return map;
}

function parseBrochureLayoutSpec(session: GenerationSession): BrochureLayoutSpec | null {
  if (session.brochureLayoutSpec) return session.brochureLayoutSpec;
  const raw = session.slotValues['__layout_spec'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BrochureLayoutSpec;
    if (!parsed?.pages || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function addBrochureLockedSlides(
  pptx: PptxGenJS,
  session: GenerationSession,
  template: Template,
  brand: Brand,
  layout: BrochureLayoutSpec,
  fontTitle: string,
  fontBody: string,
): void {
  const slideW = 13.33;
  const slideH = 7.5;
  const slotMap = new Map(template.slots.map((s) => [s.id, s] as const));

  for (const page of layout.pages) {
    const slide = pptx.addSlide();

    if (page.backgroundImageUrl) {
      try {
        slide.addImage({
          path: page.backgroundImageUrl,
          x: 0,
          y: 0,
          w: slideW,
          h: slideH,
        });
      } catch {
        // Si no puede cargar la URL, mantiene fondo blanco.
      }
    }

    slide.addShape('rect', {
      x: 0, y: 0, w: slideW, h: slideH,
      fill: { color: 'FFFFFF', transparency: 90 },
      line: { color: 'FFFFFF', transparency: 100 },
    });

    for (const zone of page.zones) {
      const slot = slotMap.get(zone.slotId);
      if (!slot) continue;
      const value = session.slotValues[zone.slotId];
      if (!value?.trim()) continue;

      const x = (zone.x / 100) * slideW;
      const y = (zone.y / 100) * slideH;
      const w = (zone.w / 100) * slideW;
      const h = (zone.h / 100) * slideH;

      if (slot.type === 'image' && (value.startsWith('data:image') || value.startsWith('https://'))) {
        const imgOpts: Record<string, unknown> = { x, y, w, h };
        if (value.startsWith('data:image')) imgOpts.data = value;
        else imgOpts.path = value;
        slide.addImage(imgOpts);
        continue;
      }

      if (slot.type === 'callout') {
        slide.addShape('roundRect', {
          x, y, w, h,
          fill: { color: 'FFFFFF', transparency: 5 },
          line: { color: hexToRgb(brand.params.colorPrimary), width: 1 },
        });
      }

      const fontSizeByType: Record<string, number> = {
        title: 22,
        subtitle: 16,
        body: 11,
        bullets: 11,
        callout: 12,
        disclaimer: 8,
      };

      const txt = slot.type === 'bullets'
        ? value.split('\n').filter((l) => l.trim()).map((l) => `• ${l}`).join('\n')
        : value;

      slide.addText(txt, {
        x,
        y,
        w,
        h,
        fontFace: slot.type === 'title' || slot.type === 'subtitle' ? fontTitle : fontBody,
        fontSize: fontSizeByType[slot.type] ?? 11,
        color: slot.type === 'title' ? hexToRgb(brand.params.colorPrimary) : '333333',
        bold: slot.type === 'title' || slot.type === 'callout',
        valign: 'top',
        breakLine: true,
      });
    }

    slide.addText(`${brand.name} · Pág. ${page.pageNumber}`, {
      x: 0.35,
      y: slideH - 0.3,
      w: 4,
      h: 0.2,
      fontFace: fontBody,
      fontSize: 7,
      color: '777777',
    });
  }
}

// ── PPTX Export ─────────────────────────────────────────

export async function exportToPptx(
  session: GenerationSession,
  template: Template,
  brand: Brand,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.author = 'PromoPharma';
  pptx.title = `${brand.name} – ${template.name}`;
  pptx.subject = session.moleculeName || brand.name;

  // Definir layout
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const primary = hexToRgb(brand.params.colorPrimary);
  const secondary = hexToRgb(brand.params.colorSecondary);
  const fontTitle = brand.params.fontTitle || 'Arial';
  const fontBody = brand.params.fontBody || 'Arial';

  const isBrochureLocked = session.slotValues['__design_mode'] === 'brochure_locked';
  const brochureLayout = parseBrochureLayoutSpec(session);
  if (isBrochureLocked && brochureLayout && brochureLayout.pages.length > 0) {
    addBrochureLockedSlides(pptx, session, template, brand, brochureLayout, fontTitle, fontBody);
    const fileName = `${brand.name} - ${template.name}`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '');
    await pptx.writeFile({ fileName: `${fileName}.pptx` });
    return;
  }

  const slideGroups = groupSlotsBySlide(template.slots);
  const sortedSlides = Array.from(slideGroups.entries()).sort(([a], [b]) => a - b);

  for (const [slideNum, slots] of sortedSlides) {
    const slide = pptx.addSlide();

    // Barra de color superior en todos los slides
    slide.addShape('rect', {
      x: 0, y: 0, w: '100%', h: 0.08,
      fill: { color: primary },
    });

    const isPortada = slideNum === 1;

    if (isPortada) {
      // ── Slide de portada ──
      slide.addShape('rect', {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: {
          type: 'solid',
          color: primary,
        },
      });

      // Fondo con gradiente simulado (segunda capa semitransparente)
      slide.addShape('rect', {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: { type: 'solid', color: secondary },
        rectRadius: 0,
      });
      // Re-add primary background with better visual
      slide.addShape('rect', {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: { type: 'solid', color: primary },
      });

      // Logo si existe
      if (brand.params.logoUrl) {
        try {
          slide.addImage({
            path: brand.params.logoUrl,
            x: 5.67, y: 1.0, w: 2.0, h: 2.0,
            rounding: true,
          });
        } catch { /* logo no disponible */ }
      }

      let yPos = brand.params.logoUrl ? 3.5 : 2.5;

      for (const slot of slots) {
        const val = session.slotValues[slot.id];
        if (!val?.trim() || slot.type === 'image') continue;

        if (slot.type === 'title') {
          slide.addText(val, {
            x: 1.0, y: yPos, w: 11.33, h: 1.2,
            fontSize: 36,
            fontFace: fontTitle,
            color: 'FFFFFF',
            bold: true,
            align: 'center',
            shadow: { type: 'outer', blur: 8, offset: 2, color: '000000', opacity: 0.4 },
          });
          yPos += 1.2;
        } else if (slot.type === 'subtitle') {
          slide.addText(val, {
            x: 1.5, y: yPos, w: 10.33, h: 0.8,
            fontSize: 20,
            fontFace: fontTitle,
            color: 'FFFFFFcc',
            align: 'center',
          });
          yPos += 0.8;
        }
      }

      // Nombre de molécula / indicaciones
      if (session.moleculeName) {
        const subtext = session.indicationNames.length > 0
          ? `${session.moleculeName} — ${session.indicationNames.join(', ')}`
          : session.moleculeName;
        slide.addText(subtext, {
          x: 1.5, y: 6.0, w: 10.33, h: 0.5,
          fontSize: 12,
          fontFace: fontBody,
          color: 'FFFFFF99',
          align: 'center',
        });
      }

      // Footer con nombre de marca
      slide.addText(brand.name, {
        x: 0.5, y: 7.0, w: 12.33, h: 0.3,
        fontSize: 9,
        fontFace: fontBody,
        color: 'FFFFFF66',
        align: 'center',
      });

    } else {
      // ── Slides de contenido ──
      slide.addShape('rect', {
        x: 0, y: 0, w: '100%', h: '100%',
        fill: { type: 'solid', color: 'FFFFFF' },
      });

      // Badge de slide
      slide.addText(`Slide ${slideNum}`, {
        x: 0.5, y: 0.3, w: 1.2, h: 0.35,
        fontSize: 9,
        fontFace: fontBody,
        color: primary,
        fill: { color: primary + '15' },
        align: 'center',
      });

      // Logo mini en esquina derecha
      if (brand.params.logoUrl) {
        try {
          slide.addImage({
            path: brand.params.logoUrl,
            x: 12.0, y: 0.25, w: 0.8, h: 0.8,
          });
        } catch { /* no logo */ }
      }

      let yPos = 1.0;

      for (const slot of slots) {
        const val = session.slotValues[slot.id];
        if (!val?.trim()) continue;

        if (slot.type === 'image' && (val.startsWith('data:image') || val.startsWith('https://'))) {
          // Imagen generada por IA
          const imgOpts: Record<string, unknown> = {
            x: 1.0, y: yPos, w: 11.33, h: 3.5,
            sizing: { type: 'contain', w: 11.33, h: 3.5 },
          };
          if (val.startsWith('data:image')) {
            imgOpts.data = val;
          } else {
            imgOpts.path = val;
          }
          slide.addImage(imgOpts);
          yPos += 3.8;
        } else if (slot.type === 'title') {
          slide.addText(val, {
            x: 0.5, y: yPos, w: 12.33, h: 0.8,
            fontSize: 28,
            fontFace: fontTitle,
            color: primary,
            bold: true,
          });
          yPos += 1.0;
        } else if (slot.type === 'subtitle') {
          slide.addText(val, {
            x: 0.5, y: yPos, w: 12.33, h: 0.6,
            fontSize: 18,
            fontFace: fontTitle,
            color: secondary,
          });
          yPos += 0.8;
        } else if (slot.type === 'body') {
          slide.addText(val, {
            x: 0.5, y: yPos, w: 12.33, h: 1.5,
            fontSize: 14,
            fontFace: fontBody,
            color: '333333',
            valign: 'top',
            wrap: true,
          });
          yPos += 1.8;
        } else if (slot.type === 'bullets') {
          const items = val.split('\n').filter((l) => l.trim());
          slide.addText(
            items.map((item) => ({
              text: item,
              options: {
                fontSize: 14,
                fontFace: fontBody,
                color: '333333' as const,
                bullet: { code: '25CF', color: primary },
                indentLevel: 0,
                paraSpaceAfter: 8,
              },
            })),
            {
              x: 0.8, y: yPos, w: 11.53, h: 3.0,
              valign: 'top',
            },
          );
          yPos += Math.min(items.length * 0.5 + 0.5, 3.5);
        } else if (slot.type === 'callout') {
          slide.addShape('rect', {
            x: 0.5, y: yPos, w: 12.33, h: 1.0,
            fill: { color: primary + '10' },
            line: { color: primary, width: 2, dashType: 'solid' },
            rectRadius: 0.1,
          });
          slide.addText(val, {
            x: 0.8, y: yPos + 0.15, w: 11.73, h: 0.7,
            fontSize: 16,
            fontFace: fontBody,
            color: primary,
            bold: true,
            valign: 'middle',
          });
          yPos += 1.3;
        } else if (slot.type === 'disclaimer') {
          slide.addText(val, {
            x: 0.5, y: 6.5, w: 12.33, h: 0.5,
            fontSize: 8,
            fontFace: fontBody,
            color: '999999',
          });
        }
      }

      // Footer
      slide.addShape('rect', {
        x: 0, y: 7.2, w: '100%', h: 0.02,
        fill: { color: 'E5E5E5' },
      });
      slide.addText(`${brand.name} · ${template.name}`, {
        x: 0.5, y: 7.2, w: 10.0, h: 0.3,
        fontSize: 7,
        fontFace: fontBody,
        color: 'AAAAAA',
      });

      // Color dots
      slide.addShape('ellipse', {
        x: 12.4, y: 7.25, w: 0.15, h: 0.15,
        fill: { color: primary },
      });
      slide.addShape('ellipse', {
        x: 12.7, y: 7.25, w: 0.15, h: 0.15,
        fill: { color: secondary },
      });
    }
  }

  // Si no hay slides (plantilla sin agrupación), crear un slide genérico
  if (sortedSlides.length === 0) {
    const slide = pptx.addSlide();
    slide.addText('Sin contenido generado', {
      x: 1, y: 3, w: 11, h: 1.5,
      fontSize: 24,
      color: '999999',
      align: 'center',
    });
  }

  const fileName = `${brand.name} - ${template.name}`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '');
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}

// ── PDF Export (via html2canvas) ─────────────────────────

export async function exportToPdf(
  element: HTMLElement,
  brand: Brand,
  template: Template,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // A4 dimensions in mm
  const pdfWidth = 210;
  const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

  const pdf = new jsPDF({
    orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [pdfWidth, pdfHeight],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

  const fileName = `${brand.name} - ${template.name}`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '');
  pdf.save(`${fileName}.pdf`);
}

// ── PDF de slides (multi-page) ──────────────────────────

export async function exportSlidesToPdf(
  slideElements: HTMLElement[],
  brand: Brand,
  template: Template,
): Promise<void> {
  if (slideElements.length === 0) return;

  // Landscape A4
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297; // A4 landscape width
  const pageHeight = 210; // A4 landscape height

  for (let i = 0; i < slideElements.length; i++) {
    if (i > 0) pdf.addPage('a4', 'landscape');

    const canvas = await html2canvas(slideElements[i], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
  }

  const fileName = `${brand.name} - ${template.name}`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '');
  pdf.save(`${fileName}.pdf`);
}
