import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Img,
  Hr,
  Heading,
  Font,
  Preview,
} from '@react-email/components';
import type { MailingBlockContent, DesignLayout } from '@/types';

// ── Props ────────────────────────────────────────────────

export interface MailingEmailProps {
  subject: string;
  previewText?: string;
  blocks: MailingBlockContent[];
  layout: DesignLayout;
  style: {
    colorPrimary: string;
    colorSecondary: string;
    colorBackground: string;
    fontTitle: string;
    fontBody: string;
    logoUrl?: string;
  };
  emailSettings?: {
    bodyBackground?: string;
    bodyBackgroundImage?: string;
    containerWidth?: number;
    borderRadius?: number;
    preheaderText?: string;
  };
}

// ── Color Helpers ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Get YouTube thumbnail from URL */
function getYouTubeThumbnail(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

/** Multiline text helper */
const Lines: React.FC<{ text: string }> = ({ text }) => {
  const lines = (text || '').split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
};

type SemanticTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4';

const normalizeSemanticTag = (tag: string | undefined, fallback: SemanticTag = 'p'): SemanticTag => {
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'p') return tag;
  return fallback;
};

const readFontSize = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const renderSemanticText = (
  tag: SemanticTag,
  content: React.ReactNode,
  textStyle: React.CSSProperties,
) => {
  if (tag === 'p') return <Text style={textStyle}>{content}</Text>;
  return <Heading as={tag} style={textStyle}>{content}</Heading>;
};

// ── Main Component ───────────────────────────────────────

export const MailingEmail: React.FC<MailingEmailProps> = ({
  subject,
  previewText,
  blocks,
  layout,
  style,
  emailSettings,
}) => {
  const bodyFont = style.fontBody || 'Inter';
  const titleFont = style.fontTitle || 'Inter';
  const bg = style.colorBackground || '#ffffff';
  // Match body background to footer color (if present) to avoid visible strip below
  const lastBlock = blocks[blocks.length - 1];
  const footerBg = lastBlock?.type === 'footer' ? (lastBlock.backgroundColor || '#111117') : undefined;
  const bodyBg = footerBg || emailSettings?.bodyBackground || '#0d0d11';

  // Enriquecer bloques de evento con nombres de speakers enlazados (siempre frescos)
  const enrichedBlocks = blocks.map((block) => {
    if (block.type !== 'event' || !block.style?.speakerIds) return block;
    const speakerIds = block.style.speakerIds.split(',').filter(Boolean);
    const names = speakerIds
      .map((id) => blocks.find((b) => b.id === id))
      .filter(Boolean)
      .map((b) => b!.style?.speakerName || b!.content || 'Speaker');
    if (names.length === 0) return block;
    return { ...block, style: { ...block.style, eventSpeaker: names.join(' · ') } };
  });
  const containerW = emailSettings?.containerWidth || layout.width;
  const borderR = emailSettings?.borderRadius ?? 0;
  const preheader = emailSettings?.preheaderText || previewText;

  return (
    <Html lang="es">
      <Head>
        <title>{subject}</title>
        <Font fontFamily={bodyFont} fallbackFontFamily="Arial" />
        {titleFont !== bodyFont && (
          <Font fontFamily={titleFont} fallbackFontFamily="Arial" />
        )}
        <style>{`
          body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
          @media (prefers-color-scheme: dark) {
            .em-outer { background-color: #000000 !important; }
          }
          @media only screen and (max-width: 640px) {
            .em-stack td, .em-stack th { display: block !important; width: 100% !important; }
            .em-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .em-hero-h { font-size: 28px !important; }
            .em-title-h { font-size: 20px !important; }
          }
        `}</style>
      </Head>
      {preheader && <Preview>{preheader}</Preview>}
      <Body
        className="em-outer"
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: bodyBg,
          backgroundImage: emailSettings?.bodyBackgroundImage
            ? `url(${emailSettings.bodyBackgroundImage})`
            : undefined,
          backgroundSize: emailSettings?.bodyBackgroundImage ? 'cover' : undefined,
          backgroundPosition: emailSettings?.bodyBackgroundImage ? 'center top' : undefined,
          WebkitTextSizeAdjust: 'none',
          fontFamily: `'${bodyFont}', Arial, Helvetica, sans-serif`,
        }}
      >
        {/* ── TOP ACCENT STRIP ─────────────────────────── */}
        <Container style={{ maxWidth: containerW, margin: '0 auto' }}>
          <Section
            style={{
              height: 5,
              background: `linear-gradient(90deg, ${style.colorPrimary}, ${style.colorSecondary}, ${style.colorPrimary})`,
              borderRadius: borderR > 0 ? `${borderR}px ${borderR}px 0 0` : undefined,
              marginTop: 0,
            }}
          />
        </Container>

        {/* ── MAIN CONTAINER ───────────────────────────── */}
        <Container
          style={{
            maxWidth: containerW,
            margin: '0 auto',
            backgroundColor: bg,
            borderRadius: borderR > 0 ? `0 0 ${borderR}px ${borderR}px` : undefined,
            overflow: 'hidden',
          }}
        >
          {enrichedBlocks.map((block, idx) => (
            <BlockRenderer
              key={block.id}
              block={block}
              blockIndex={idx}
              totalBlocks={enrichedBlocks.length}
              style={style}
              titleFont={titleFont}
              bodyFont={bodyFont}
            />
          ))}
        </Container>
      </Body>
    </Html>
  );
};

export default MailingEmail;

// ── Padding helper ───────────────────────────────────────
const bPad = (b: MailingBlockContent, t: number, r: number, bot: number, l: number) =>
  `${b.paddingTop ?? t}px ${b.paddingRight ?? r}px ${b.paddingBottom ?? bot}px ${b.paddingLeft ?? l}px`;

// Returns background styles from block-level settings (backgroundColor / backgroundImage).
// Spread onto each block's root <Section> so bg and padding live on the same element.
const getBlockBg = (b: MailingBlockContent): React.CSSProperties => {
  if (!b.backgroundColor && !b.backgroundImage) return {};
  const bg: React.CSSProperties = {};
  if (b.backgroundColor) bg.backgroundColor = b.backgroundColor;
  if (b.backgroundImage) {
    bg.backgroundImage = `url(${b.backgroundImage})`;
    bg.backgroundSize = 'cover';
    bg.backgroundPosition = 'center';
  }
  return bg;
};

// ── Block Renderer ───────────────────────────────────────

const BlockRenderer: React.FC<{
  block: MailingBlockContent;
  blockIndex: number;
  totalBlocks: number;
  style: MailingEmailProps['style'];
  titleFont: string;
  bodyFont: string;
}> = ({ block, blockIndex, totalBlocks, style, titleFont, bodyFont }) => {
  const common = { block, blockIndex, totalBlocks, style, titleFont, bodyFont };

  // Background is now applied inside each block component via getBlockBg(block).
  // This wrapper is kept as a pass-through for backward compat.
  const wrapBg = (el: React.ReactElement) => el;

  switch (block.type) {
    case 'header': return wrapBg(<HeaderBlock {...common} />);
    case 'hero':   return wrapBg(<HeroBlock {...common} />);
    case 'text':   return wrapBg(<TextBlock {...common} />);
    case 'image':  return wrapBg(<ImageBlock {...common} />);
    case 'bullets': return wrapBg(<BulletsBlock {...common} />);
    case 'cta':    return wrapBg(<CtaBlock {...common} />);
    case 'event':  return wrapBg(<EventBlock {...common} />);
    case 'speaker': return wrapBg(<SpeakerBlock {...common} />);
    case 'divider': return wrapBg(<DividerBlock {...common} />);
    case 'spacer': return <SpacerBlock {...common} />;
    case 'footer': return wrapBg(<FooterBlock {...common} />);
    case 'quote':  return wrapBg(<QuoteBlock {...common} />);
    case 'social': return wrapBg(<SocialBlock {...common} />);
    case 'video':  return wrapBg(<VideoBlock {...common} />);
    case 'columns': return wrapBg(<ColumnsBlock {...common} />);
    default:
      return (
        <Section style={{ padding: bPad(block, 16, 48, 16, 48) }}>
          <Text style={{ fontSize: 15, fontFamily: `'${bodyFont}', Arial, sans-serif`, color: '#374151', margin: 0, lineHeight: '1.7' }}>
            {block.content}
          </Text>
        </Section>
      );
  }
};

// ── Block Props ──────────────────────────────────────────

interface BlockProps {
  block: MailingBlockContent;
  blockIndex: number;
  totalBlocks: number;
  style: MailingEmailProps['style'];
  titleFont: string;
  bodyFont: string;
}

// ═══════════════════════════════════════════════════════════
// HEADER — Dark immersive bar with geometric diagonal band
// ═══════════════════════════════════════════════════════════

const HeaderBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const logoSrc = block.imageUrl || style.logoUrl;
  const headerBg = block.backgroundColor || undefined;
  const hasCustomBg = !!block.backgroundColor;
  const logoX = parseInt(block.style?.logoX || '0') || 0;
  const logoY = parseInt(block.style?.logoY || '0') || 0;
  const logoHeight = parseInt(block.style?.logoHeight || '42') || 42;
  const logoOpacity = parseFloat(block.style?.logoOpacity || '1');
  const bgSize = block.style?.headerBgSize || 'cover';
  const bgPos = block.style?.headerBgPos || 'center';
  const bgStyle: React.CSSProperties = block.backgroundImage
    ? {
        backgroundImage: `url(${block.backgroundImage})`,
        backgroundSize: bgSize,
        backgroundPosition: bgPos,
        backgroundColor: headerBg || style.colorPrimary,
      }
    : headerBg
      ? { backgroundColor: headerBg }
      : { background: `linear-gradient(135deg, ${style.colorPrimary} 0%, ${style.colorSecondary} 100%)` };

  return (
    <Section style={{ ...bgStyle, padding: 0 }}>
      {/* Accent stripe */}
      {!block.backgroundImage && (
        <Section
          style={{
            height: 5,
            background: hasCustomBg
              ? `linear-gradient(90deg, ${style.colorPrimary}, ${style.colorSecondary})`
              : `linear-gradient(90deg, ${alpha('#ffffff', 0.15)}, ${alpha('#ffffff', 0.35)}, ${alpha('#ffffff', 0.15)})`,
          }}
        />
      )}
      <Section className="em-pad" style={{ padding: bPad(block, 32, 48, 28, 48) }}>
        <Row>
          <Column style={{ verticalAlign: 'middle' }}>
            <div style={{ position: 'relative', left: logoX * 2, top: logoY * 2, display: 'inline-block' }}>
              {logoSrc ? (
                <Img
                  src={logoSrc}
                  alt={block.content || 'Logo'}
                  height={logoHeight}
                  style={{
                    height: logoHeight,
                    width: 'auto',
                    display: 'block',
                    opacity: logoOpacity,
                  }}
                />
              ) : (
                <Heading
                  as="h1"
                  style={{
                    fontFamily: `'${block.style?.fontFamily || titleFont}', Arial, sans-serif`,
                    fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 22,
                    fontWeight: 800,
                    color: '#ffffff',
                    margin: 0,
                    letterSpacing: '-0.3px',
                    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase' as const,
                    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
                  }}
                >
                  {block.content || ''}
                </Heading>
              )}
            </div>
          </Column>
          {block.style?.headerDate !== '__hide__' && (
            <Column align="right" style={{ verticalAlign: 'bottom' }}>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: alpha('#ffffff', 0.35),
                  fontFamily: `'${bodyFont}', Arial, sans-serif`,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase' as const,
                }}
              >
                {block.style?.headerDate || new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </Text>
            </Column>
          )}
        </Row>
      </Section>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// HERO — Cinematic full section with bold overlay
// ═══════════════════════════════════════════════════════════

const HeroBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const heroTitle = block.style?.heroTitle || '';
  const heroSubtitle = block.style?.heroSubtitle || '';
  const hasOverlay = !!(heroTitle || heroSubtitle);
  const hFont = block.style?.fontFamily
    ? `'${block.style.fontFamily}', Arial, sans-serif`
    : `'${titleFont}', Arial, sans-serif`;
  const hSize = block.style?.fontSize ? parseInt(block.style.fontSize) : 36;
  const hColor = block.style?.color || '#ffffff';
  const hAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';
  const hShadow = block.style?.imgShadow || 'none';
  const heroShadowMap: Record<string, string> = { none: 'none', sm: '0 2px 8px rgba(0,0,0,0.08)', md: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', lg: '0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)' };
  const hBorder = (!block.style?.imgBorder || block.style.imgBorder === 'none')
    ? undefined
    : block.style.imgBorder.includes('solid') && !block.style.imgBorder.includes('#')
      ? block.style.imgBorder.replace('solid', `solid ${block.style?.imgBorderColor || '#d1d5db'}`)
      : block.style.imgBorder;

  return (
    <Section style={{ padding: 0 }}>
      {block.imageUrl ? (
        <Section style={{ position: 'relative' }}>
          <Img
            src={block.imageUrl}
            alt={block.content || ''}
            width="100%"
            style={{
              display: 'block',
              maxWidth: '100%',
              width: block.style?.imgWidth === 'auto' ? 'auto' : `${block.style?.imgWidth || '100'}%`,
              height: block.style?.imgHeight ? parseInt(block.style.imgHeight) : 'auto',
              objectFit: (block.style?.imgObjectFit as React.CSSProperties['objectFit']) || undefined,
              borderRadius: parseInt(block.style?.imgBorderRadius || '0'),
              margin: block.style?.imgAlign === 'left' ? '0 auto 0 0' : block.style?.imgAlign === 'right' ? '0 0 0 auto' : '0 auto',
              boxShadow: heroShadowMap[hShadow] || 'none',
              border: hBorder,
            }}
          />
          {hasOverlay && (
            <Section style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
              padding: '48px 40px 32px',
              textAlign: hAlign,
              borderRadius: `0 0 ${block.style?.imgBorderRadius || '0'}px ${block.style?.imgBorderRadius || '0'}px`,
            }}>
              {heroTitle && (
                <Heading as="h2" className="em-hero-h" style={{
                  fontFamily: hFont,
                  fontSize: hSize,
                  fontWeight: 900,
                  color: hColor,
                  margin: '0 0 4px',
                  letterSpacing: '-0.8px',
                  lineHeight: '1.15',
                  textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                }}>
                  {heroTitle}
                </Heading>
              )}
              {heroSubtitle && (
                <Text style={{
                  fontFamily: `'${bodyFont}', Arial, sans-serif`,
                  fontSize: Math.round(hSize * 0.45),
                  color: alpha('#ffffff', 0.75),
                  margin: 0,
                }}>
                  {heroSubtitle}
                </Text>
              )}
            </Section>
          )}
        </Section>
      ) : (
        <Section
          style={{
            background: `linear-gradient(165deg, ${darken(style.colorPrimary, 0.7)} 0%, ${darken(style.colorPrimary, 0.45)} 40%, ${darken(style.colorSecondary, 0.5)} 100%)`,
            padding: bPad(block, 72, 48, 64, 48),
            textAlign: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 120, lineHeight: '1', color: alpha('#ffffff', 0.04),
              margin: '-20px 0 -50px', fontWeight: 900,
              fontFamily: `'${titleFont}', Arial, sans-serif`, textAlign: 'center',
            }}
          >+</Text>

          <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: '0 auto 20px' }}>
            <tbody><tr>
              <td style={{
                padding: '6px 20px', border: `1px solid ${alpha('#ffffff', 0.2)}`,
                borderRadius: 30, fontSize: 10,
                fontFamily: `'${bodyFont}', Arial, sans-serif`,
                color: alpha('#ffffff', 0.7), letterSpacing: '2px',
                textTransform: 'uppercase' as const, textAlign: 'center',
              }}>DESTACADO</td>
            </tr></tbody>
          </table>

          <Heading as="h2" className="em-hero-h"
            style={{
              fontFamily: hFont,
              fontSize: hSize, fontWeight: 900, color: '#ffffff',
              margin: '0 0 12px', letterSpacing: '-0.8px', lineHeight: '1.15',
            }}
          >
            {heroTitle || 'Imagen destacada'}
          </Heading>
          <Text
            style={{
              fontSize: 14, color: alpha('#ffffff', 0.45), margin: 0,
              fontFamily: `'${bodyFont}', Arial, sans-serif`,
            }}
          >
            Agrega una imagen para potenciar esta sección
          </Text>
        </Section>
      )}
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// TEXT — Editorial with thick accent bar for titles
// ═══════════════════════════════════════════════════════════

const TextBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const hl = block.style?.headingLevel || '';
  const isTitle = hl === 'h1' || hl === 'h2' || hl === 'h3' || hl === 'h4' || block.style?.fontWeight === 'bold';
  const defaultSize = hl === 'h1' ? 32 : hl === 'h2' ? 24 : hl === 'h3' ? 20 : hl === 'h4' ? 18 : isTitle ? 24 : 16;
  const baseFontSize = block.style?.fontSize ? parseInt(block.style.fontSize) : defaultSize;
  const customFont = block.style?.fontFamily;
  const headingTag = hl === 'h1' ? 'h1' : hl === 'h3' ? 'h3' : hl === 'h4' ? 'h4' : 'h2';

  const textStyle: React.CSSProperties = {
    fontFamily: customFont
      ? `'${customFont}', Arial, sans-serif`
      : (isTitle ? `'${titleFont}', Arial, sans-serif` : `'${bodyFont}', Arial, sans-serif`),
    fontSize: baseFontSize,
    lineHeight: isTitle ? '1.25' : '1.85',
    color: isTitle ? '#111111' : '#4a4a4a',
    fontWeight: isTitle ? 900 : 400,
    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'left',
    margin: 0,
    letterSpacing: isTitle ? '-0.6px' : '0.01em',
  };
  if (block.style?.color) textStyle.color = block.style.color;
  if (block.style?.textTransform) textStyle.textTransform = block.style.textTransform as React.CSSProperties['textTransform'];

  return (
    <Section className="em-pad" style={{ padding: isTitle ? bPad(block, 36, 48, 8, 48) : bPad(block, 8, 48, 20, 48), ...getBlockBg(block) }}>
      {isTitle ? (
        <>
          {/* Thick accent bar */}
          {block.style?.accentBar !== 'hide' && (
            <Section
              style={{
                width: 48,
                height: 5,
                backgroundColor: block.style?.accentBarColor || style.colorPrimary,
                marginBottom: 20,
              }}
            />
          )}
          <Heading as={headingTag} className="em-title-h" style={textStyle}>
            <Lines text={block.content || ''} />
          </Heading>
        </>
      ) : (
        <Text style={textStyle}>
          <Lines text={block.content || ''} />
        </Text>
      )}
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// IMAGE — Edge-to-edge with colored shadow accent
// ═══════════════════════════════════════════════════════════

const imgShadowMap: Record<string, string> = {
  none: 'none',
  sm: '0 2px 8px rgba(0,0,0,0.08)',
  md: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
  lg: '0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
};

const getImgStyle = (block: MailingBlockContent, fallbackShadow?: string): React.CSSProperties => {
  const s = block.style || {};
  const w = s.imgWidth || '100';
  const borderRadius = parseInt(s.imgBorderRadius || '4');
  const shadow = s.imgShadow || 'md';
  const border = (!s.imgBorder || s.imgBorder === 'none')
    ? undefined
    : s.imgBorder.includes('solid') && !s.imgBorder.includes('#')
      ? s.imgBorder.replace('solid', `solid ${s.imgBorderColor || '#d1d5db'}`)
      : s.imgBorder;
  const align = s.imgAlign || 'center';
  const margin = align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';

  const out: React.CSSProperties = {
    display: 'block',
    maxWidth: '100%',
    width: w === 'auto' ? 'auto' : `${w}%`,
    height: s.imgHeight ? parseInt(s.imgHeight) : 'auto',
    objectFit: (s.imgObjectFit as React.CSSProperties['objectFit']) || undefined,
    borderRadius,
    margin,
    boxShadow: fallbackShadow || (imgShadowMap[shadow] || imgShadowMap.md),
    border,
  };
  return out;
};

const ImageBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const imgShadowColor = block.style?.imgShadowColor || 'rgba(0,0,0,0.12)';
  const customShadowMap: Record<string, string> = {
    none: 'none',
    sm: `0 2px 8px ${imgShadowColor}`,
    md: `0 8px 32px ${imgShadowColor}, 0 2px 8px rgba(0,0,0,0.06)`,
    lg: `0 16px 48px ${imgShadowColor}, 0 4px 12px rgba(0,0,0,0.08)`,
  };
  const shadow = block.style?.imgShadow || 'md';
  const fallbackShadow = customShadowMap[shadow] || customShadowMap.md;
  const imgFont = block.style?.fontFamily
    ? `'${block.style.fontFamily}', Arial, sans-serif`
    : `'${bodyFont}', Arial, sans-serif`;

  return (
    <Section style={{ padding: bPad(block, 24, 48, 24, 48), ...getBlockBg(block) }}>
      {block.imageUrl ? (
        <>
          <Img
            src={block.imageUrl}
            alt={block.content || ''}
            style={{
              ...getImgStyle(block, fallbackShadow),
            }}
          />
          {block.content && (
            <Text style={{
              fontFamily: imgFont,
              fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 13,
              color: block.style?.color || '#888888',
              textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
              fontStyle: 'italic',
              margin: '10px 0 0',
              fontWeight: block.style?.fontWeight === 'bold' ? 600 : 400,
              textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
            }}>
              {block.content}
            </Text>
          )}
        </>
      ) : (
        <Section
          style={{
            background: `linear-gradient(160deg, #f8f8fa, #eeeff2)`,
            height: 220,
            borderRadius: 4,
            textAlign: 'center',
            paddingTop: 90,
          }}
        >
          <Text style={{ color: '#b0b4bc', margin: 0, fontSize: 13, letterSpacing: '0.5px' }}>
            AGREGAR IMAGEN
          </Text>
        </Section>
      )}
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// BULLETS — Numbered badge cards with colored left accent
// ═══════════════════════════════════════════════════════════

const BulletsBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const items = (block.content || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^[•\-]\s*/, ''));
  const textColor = block.style?.color || '#333333';
  const fontSize = block.style?.fontSize ? parseInt(block.style.fontSize) : 14;
  const bulletStyle = block.style?.bulletStyle || 'number';
  const badgeBg = block.style?.bulletBadgeBg || style.colorPrimary;
  const itemBg = block.style?.bulletItemBg || lighten(badgeBg, 0.96);
  const customFont = block.style?.fontFamily;
  const fontFam = customFont ? `'${customFont}', Arial, sans-serif` : `'${bodyFont}', Arial, sans-serif`;

  const getBadgeText = (i: number) => {
    switch (bulletStyle) {
      case 'bullet': return '•';
      case 'letter': return String.fromCharCode(65 + i);
      case 'none': return '';
      default: return String(i + 1).padStart(2, '0');
    }
  };

  return (
    <Section className="em-pad" style={{ padding: bPad(block, 20, 48, 28, 48), ...getBlockBg(block) }}>
      {items.map((item, i) => (
        <Section
          key={i}
          style={{
            marginBottom: 8,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <Row>
            {bulletStyle !== 'none' && (
              <Column
                style={{
                  width: 52,
                  backgroundColor: badgeBg,
                  verticalAlign: 'middle',
                  textAlign: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFam,
                    fontSize: bulletStyle === 'bullet' ? 20 : 14,
                    fontWeight: 800,
                    color: '#ffffff',
                    margin: 0,
                    padding: '14px 0',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {getBadgeText(i)}
                </Text>
              </Column>
            )}
            <Column
              style={{
                verticalAlign: 'middle',
                backgroundColor: itemBg,
                padding: '14px 20px',
              }}
            >
              <Text
                style={{
                  fontFamily: fontFam,
                  fontSize,
                  lineHeight: '1.6',
                  color: textColor,
                  margin: 0,
                  fontWeight: block.style?.fontWeight === 'bold' ? 600 : 400,
                  textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
                  textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                }}
              >
                {item}
              </Text>
            </Column>
          </Row>
        </Section>
      ))}
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// CTA — Full-width colored band with inverted white button
// ═══════════════════════════════════════════════════════════

const CtaBlock: React.FC<BlockProps> = ({ block, style, titleFont }) => {
  const bandColor = block.style?.bandBgColor || style.colorPrimary;
  const btnBg = block.style?.btnBgColor || '#ffffff';
  const btnText = block.style?.btnTextColor || style.colorPrimary;
  const labelColor = block.style?.color || alpha('#ffffff', 0.7);
  const ctaFont = block.style?.fontFamily || titleFont;
  const ctaFontSize = block.style?.fontSize ? parseInt(block.style.fontSize) : 14;
  const ctaAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';
  const hasCustomBg = !!(block.backgroundImage || block.backgroundColor);

  return (
    <Section
      style={{
        ...(hasCustomBg
          ? getBlockBg(block)
          : { background: `linear-gradient(135deg, ${bandColor} 0%, ${darken(bandColor, 0.15)} 100%)` }),
        padding: bPad(block, 44, 48, 44, 48),
        textAlign: ctaAlign,
      }}
    >
      {block.content && (
        <Text
          style={{
            fontFamily: `'${ctaFont}', Arial, sans-serif`,
            fontSize: Math.round(ctaFontSize * 0.9),
            color: labelColor,
            margin: '0 0 20px',
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
            fontWeight: 600,
          }}
        >
          {block.content}
        </Text>
      )}

      {/* Button — react-email handles MSO fallback automatically */}
      <Button
        href={block.ctaUrl && !/^https?:\/\//i.test(block.ctaUrl) && block.ctaUrl !== '#' ? `https://${block.ctaUrl}` : (block.ctaUrl || '#')}
        style={{
          display: 'inline-block',
          padding: '16px 52px',
          backgroundColor: btnBg,
          color: btnText,
          fontFamily: `'${ctaFont}', Arial, sans-serif`,
          fontSize: ctaFontSize,
          fontWeight: 800,
          textDecoration: 'none',
          borderRadius: 6,
          letterSpacing: '0.3px',
          border: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          textTransform: 'uppercase' as const,
        }}
      >
        {block.ctaText || 'Más información'} →
      </Button>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// EVENT — Date/time card + registration CTA
// ═══════════════════════════════════════════════════════════

const EventBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const bandColor = block.style?.bandBgColor || style.colorPrimary;
  const btnBg = block.style?.btnBgColor || '#ffffff';
  const btnText = block.style?.btnTextColor || style.colorPrimary;
  const labelColor = block.style?.color || alpha('#ffffff', 0.72);
  const eventFont = block.style?.fontFamily || titleFont;
  const eventAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'left';
  const eventTitle = block.style?.eventTitle || 'Actualización científica exclusiva';
  const eventDescription = block.style?.eventDescription || 'Revisa evidencia clínica relevante y participa en una conversación práctica con especialistas.';
  const eventDate = block.style?.eventDate || 'Jueves 12 de junio';
  const eventTime = block.style?.eventTime || '19:00 h';
  const eventLocation = block.style?.eventLocation || 'Streaming en vivo';
  const eventSpeaker = block.style?.eventSpeaker || 'Dra. Valentina Rojas';
  const eventCapacity = block.style?.eventCapacity || '120 cupos';
  const eventMode = block.style?.eventMode || 'Online';
  const buttonLabel = block.ctaText || 'Inscribirse';
  const hasCustomBg = !!(block.backgroundImage || block.backgroundColor);
  const metaItems = [eventMode, eventLocation, eventSpeaker, eventCapacity].filter(Boolean);
  const eventLabelTag = normalizeSemanticTag(block.style?.eventLabelTag, 'p');
  const eventTitleTag = normalizeSemanticTag(block.style?.eventTitleTag, 'h3');
  const eventDescriptionTag = normalizeSemanticTag(block.style?.eventDescriptionTag, 'p');
  const eventDateTag = normalizeSemanticTag(block.style?.eventDateTag, 'h3');
  const eventTimeTag = normalizeSemanticTag(block.style?.eventTimeTag, 'p');
  const eventLabelFont = block.style?.eventLabelFont || eventFont;
  const eventTitleFont = block.style?.eventTitleFont || eventFont;
  const eventDescriptionFont = block.style?.eventDescriptionFont || bodyFont;
  const eventDateFont = block.style?.eventDateFont || eventFont;
  const eventTimeFont = block.style?.eventTimeFont || bodyFont;
  const eventMetaFont = block.style?.eventMetaFont || bodyFont;
  const eventButtonFont = block.style?.eventButtonFont || eventFont;
  const eventLabelSize = readFontSize(block.style?.eventLabelSize, 12);
  const eventTitleSize = readFontSize(block.style?.eventTitleSize, 24);
  const eventDescriptionSize = readFontSize(block.style?.eventDescriptionSize, 14);
  const eventDateSize = readFontSize(block.style?.eventDateSize, 24);
  const eventTimeSize = readFontSize(block.style?.eventTimeSize, 13);
  const eventMetaSize = readFontSize(block.style?.eventMetaSize, 11);
  const eventButtonSize = readFontSize(block.style?.eventButtonSize, 14);

  return (
    <Section
      style={{
        ...(hasCustomBg
          ? getBlockBg(block)
          : { background: `linear-gradient(135deg, ${bandColor} 0%, ${darken(bandColor, 0.15)} 100%)` }),
        padding: bPad(block, 36, 40, 36, 40),
        textAlign: eventAlign,
      }}
    >
      <Section style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', right: -30, top: -34, width: 128, height: 128, borderRadius: 999, backgroundColor: alpha('#ffffff', 0.06) }} />
      </Section>
      {block.content && (
        renderSemanticText(eventLabelTag, block.content, {
          fontFamily: `'${eventLabelFont}', Arial, sans-serif`,
          fontSize: eventLabelSize,
          color: labelColor,
          margin: '0 0 18px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontWeight: 600,
          lineHeight: '1.3',
        })
      )}

      <Section>
        <Row>
          <Column style={{ width: 170, paddingRight: 16, verticalAlign: 'top' }}>
            <Section style={{ backgroundColor: alpha('#ffffff', 0.12), border: `1px solid ${alpha('#ffffff', 0.14)}`, borderRadius: 10 }}>
              <Text style={{ margin: '0', padding: '14px 16px 0', fontSize: 11, letterSpacing: '1.3px', textTransform: 'uppercase' as const, color: labelColor, fontWeight: 600, fontFamily: `'${bodyFont}', Arial, sans-serif` }}>
                Fecha
              </Text>
              {renderSemanticText(eventDateTag, eventDate, {
                margin: '0',
                padding: '6px 16px 0',
                fontSize: eventDateSize,
                lineHeight: '1.2',
                color: '#ffffff',
                fontWeight: 800,
                fontFamily: `'${eventDateFont}', Arial, sans-serif`,
              })}
              {renderSemanticText(eventTimeTag, eventTime, {
                margin: '0',
                padding: '8px 16px 16px',
                fontSize: eventTimeSize,
                color: alpha('#ffffff', 0.86),
                fontWeight: 500,
                lineHeight: '1.4',
                fontFamily: `'${eventTimeFont}', Arial, sans-serif`,
              })}
            </Section>
          </Column>
          <Column style={{ verticalAlign: 'middle' }}>
            {renderSemanticText(eventTitleTag, eventTitle, {
              margin: '0 0 8px',
              fontFamily: `'${eventTitleFont}', Arial, sans-serif`,
              fontSize: eventTitleSize,
              lineHeight: '1.2',
              color: '#ffffff',
              fontWeight: 900,
              letterSpacing: '-0.3px',
            })}
            {renderSemanticText(eventDescriptionTag, <Lines text={eventDescription} />, {
              margin: '0 0 18px',
              fontSize: eventDescriptionSize,
              lineHeight: '1.6',
              color: alpha('#ffffff', 0.84),
              fontFamily: `'${eventDescriptionFont}', Arial, sans-serif`,
            })}
            {metaItems.length > 0 && (
              <Section style={{ marginBottom: 18 }}>
                <Text style={{ margin: 0, fontSize: 0, lineHeight: '0px' }}>
                  {metaItems.map((item) => (
                    <span key={item} style={{ display: 'inline-block', padding: '6px 10px', margin: '0 6px 6px 0', borderRadius: 999, backgroundColor: alpha('#ffffff', 0.1), border: `1px solid ${alpha('#ffffff', 0.1)}`, fontSize: eventMetaSize, lineHeight: '14px', color: alpha('#ffffff', 0.9), fontFamily: `'${eventMetaFont}', Arial, sans-serif` }}>
                      {item}
                    </span>
                  ))}
                </Text>
              </Section>
            )}
            <Button
              href={block.ctaUrl && !/^https?:\/\//i.test(block.ctaUrl) && block.ctaUrl !== '#' ? `https://${block.ctaUrl}` : (block.ctaUrl || '#')}
              style={{
                display: 'inline-block',
                padding: '14px 30px',
                backgroundColor: btnBg,
                color: btnText,
                fontFamily: `'${eventButtonFont}', Arial, sans-serif`,
                fontSize: eventButtonSize,
                fontWeight: 800,
                textDecoration: 'none',
                borderRadius: 6,
                letterSpacing: '0.3px',
                border: 'none',
                textTransform: 'uppercase' as const,
              }}
            >
              {buttonLabel}
            </Button>
          </Column>
        </Row>
      </Section>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// SPEAKER — Dedicated expert profile card
// ═══════════════════════════════════════════════════════════

const SpeakerBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const speakerName = block.style?.speakerName || 'Dra. Valentina Rojas';
  const speakerRole = block.style?.speakerRole || 'Especialista invitada';
  const speakerBio = block.style?.speakerBio || 'Compartirá una mirada clínica práctica sobre evidencia reciente y aplicación en pacientes reales.';
  const speakerOrg = block.style?.speakerOrg || 'Hospital Clínico';
  const cardBg = block.style?.speakerCardBg || '#f8fafc';
  const imageShape = block.style?.speakerImageShape || 'circle';
  const speakerVariant = block.style?.speakerVariant || 'classic';
  const photoRadius = imageShape === 'circle' ? 999 : imageShape === 'square' ? 0 : 18;
  const speakerLabelTag = normalizeSemanticTag(block.style?.speakerLabelTag, 'p');
  const speakerNameTag = normalizeSemanticTag(block.style?.speakerNameTag, 'h3');
  const speakerMetaTag = normalizeSemanticTag(block.style?.speakerMetaTag, 'p');
  const speakerBioTag = normalizeSemanticTag(block.style?.speakerBioTag, 'p');
  const speakerLabelFont = block.style?.speakerLabelFont || titleFont;
  const speakerNameFont = block.style?.speakerNameFont || titleFont;
  const speakerMetaFont = block.style?.speakerMetaFont || bodyFont;
  const speakerBioFont = block.style?.speakerBioFont || bodyFont;
  const speakerLabelSize = readFontSize(block.style?.speakerLabelSize, 12);
  const speakerNameSize = readFontSize(block.style?.speakerNameSize, speakerVariant === 'spotlight' ? 28 : 26);
  const speakerMetaSize = readFontSize(block.style?.speakerMetaSize, 14);
  const speakerBioSize = readFontSize(block.style?.speakerBioSize, 14);

  if (speakerVariant === 'spotlight') {
    return (
      <Section style={{ padding: bPad(block, 28, 40, 28, 40), ...getBlockBg(block) }}>
        <Section style={{ background: `linear-gradient(135deg, ${style.colorPrimary}, ${darken(style.colorPrimary, 0.12)})`, borderRadius: 24, padding: '30px 30px 28px', overflow: 'hidden' }}>
          <Row>
            <Column style={{ width: 154, verticalAlign: 'top', paddingRight: 22 }}>
              {block.imageUrl ? (
                <Img
                  src={block.imageUrl}
                  alt={speakerName}
                  style={{ width: 132, height: 132, objectFit: 'cover', borderRadius: photoRadius, display: 'block', border: `4px solid ${alpha('#ffffff', 0.18)}` }}
                />
              ) : (
                <Section style={{ width: 132, height: 132, borderRadius: photoRadius, backgroundColor: alpha('#ffffff', 0.12), textAlign: 'center' }}>
                  <Text style={{ margin: '48px 0 0', fontSize: 34, fontWeight: 800, color: '#ffffff', fontFamily: `'${titleFont}', Arial, sans-serif` }}>
                    {speakerName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').slice(0, 2) || 'SP'}
                  </Text>
                </Section>
              )}
            </Column>
            <Column style={{ verticalAlign: 'middle' }}>
              {block.content && (
                renderSemanticText(speakerLabelTag, block.content, {
                  margin: '0 0 12px',
                  fontFamily: `'${speakerLabelFont}', Arial, sans-serif`,
                  fontSize: speakerLabelSize,
                  letterSpacing: '1.9px',
                  textTransform: 'uppercase',
                  color: alpha('#ffffff', 0.76),
                  fontWeight: 700,
                  lineHeight: '1.3',
                })
              )}
              {renderSemanticText(speakerNameTag, speakerName, {
                margin: '0 0 8px',
                fontFamily: `'${speakerNameFont}', Arial, sans-serif`,
                fontSize: speakerNameSize,
                lineHeight: '1.1',
                color: '#ffffff',
                fontWeight: 900,
              })}
              {renderSemanticText(speakerMetaTag, `${speakerRole}${speakerOrg ? ` · ${speakerOrg}` : ''}`, {
                margin: '0 0 14px',
                fontFamily: `'${speakerMetaFont}', Arial, sans-serif`,
                fontSize: speakerMetaSize,
                lineHeight: '1.5',
                color: alpha('#ffffff', 0.86),
                fontWeight: 700,
              })}
              {renderSemanticText(speakerBioTag, <Lines text={speakerBio} />, {
                margin: 0,
                fontFamily: `'${speakerBioFont}', Arial, sans-serif`,
                fontSize: speakerBioSize,
                lineHeight: '1.7',
                color: alpha('#ffffff', 0.9),
              })}
            </Column>
          </Row>
        </Section>
      </Section>
    );
  }

  return (
    <Section style={{ padding: bPad(block, 28, 40, 28, 40), ...getBlockBg(block) }}>
      <Section style={{ backgroundColor: cardBg, borderRadius: 22, padding: '28px 28px 24px', border: `1px solid ${alpha(style.colorPrimary, 0.10)}` }}>
        {block.content && (
          renderSemanticText(speakerLabelTag, block.content, {
            margin: '0 0 14px',
            fontFamily: `'${speakerLabelFont}', Arial, sans-serif`,
            fontSize: speakerLabelSize,
            letterSpacing: '1.8px',
            textTransform: 'uppercase',
            color: style.colorPrimary,
            fontWeight: 700,
            lineHeight: '1.3',
          })
        )}
        <Row>
          <Column style={{ width: 120, verticalAlign: 'top', paddingRight: 18 }}>
            {block.imageUrl ? (
              <Img
                src={block.imageUrl}
                alt={speakerName}
                style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: photoRadius, display: 'block', border: `4px solid ${alpha(style.colorPrimary, 0.10)}` }}
              />
            ) : (
              <Section style={{ width: 96, height: 96, borderRadius: photoRadius, background: `linear-gradient(135deg, ${alpha(style.colorPrimary, 0.12)}, ${alpha(style.colorSecondary, 0.16)})`, textAlign: 'center' }}>
                <Text style={{ margin: '36px 0 0', fontSize: 26, fontWeight: 800, color: style.colorPrimary, fontFamily: `'${titleFont}', Arial, sans-serif` }}>
                  {speakerName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').slice(0, 2) || 'SP'}
                </Text>
              </Section>
            )}
          </Column>
          <Column style={{ verticalAlign: 'top' }}>
            {renderSemanticText(speakerNameTag, speakerName, {
              margin: '0 0 6px',
              fontFamily: `'${speakerNameFont}', Arial, sans-serif`,
              fontSize: speakerNameSize,
              lineHeight: '1.15',
              color: '#111827',
              fontWeight: 900,
            })}
            {renderSemanticText(speakerMetaTag, `${speakerRole}${speakerOrg ? ` · ${speakerOrg}` : ''}`, {
              margin: '0 0 14px',
              fontFamily: `'${speakerMetaFont}', Arial, sans-serif`,
              fontSize: speakerMetaSize,
              lineHeight: '1.5',
              color: style.colorPrimary,
              fontWeight: 700,
            })}
            {renderSemanticText(speakerBioTag, <Lines text={speakerBio} />, {
              margin: 0,
              fontFamily: `'${speakerBioFont}', Arial, sans-serif`,
              fontSize: speakerBioSize,
              lineHeight: '1.7',
              color: '#4b5563',
            })}
          </Column>
        </Row>
      </Section>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// DIVIDER — Geometric with centered dot accent
// ═══════════════════════════════════════════════════════════

const DividerBlock: React.FC<BlockProps> = ({ block, style }) => {
  const lineColor = block.style?.dividerColor || '#e5e5ea';
  const dotColor = block.style?.dividerDotColor || style.colorPrimary;
  return (
    <Section style={{ padding: bPad(block, 24, 48, 24, 48), ...getBlockBg(block) }}>
      <Row>
        <Column style={{ verticalAlign: 'middle' }}>
          <Section style={{ height: 1, backgroundColor: lineColor }} />
        </Column>
        <Column style={{ width: 32, textAlign: 'center', verticalAlign: 'middle' }}>
          <Section style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, margin: '0 auto' }} />
        </Column>
        <Column style={{ verticalAlign: 'middle' }}>
          <Section style={{ height: 1, backgroundColor: lineColor }} />
        </Column>
      </Row>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// SPACER
// ═══════════════════════════════════════════════════════════

const SpacerBlock: React.FC<BlockProps> = ({ block }) => {
  const h = parseInt(block.style?.spacerHeight || '32') || 32;
  const bg = block.style?.spacerColor || undefined;
  return <Section style={{ height: h, fontSize: 0, lineHeight: '0px', backgroundColor: bg }}>&nbsp;</Section>;
};

// ═══════════════════════════════════════════════════════════
// FOOTER — Dark with gradient top edge + social pills
// ═══════════════════════════════════════════════════════════

const FooterBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const fLinks = block.socialLinks ?? [{ platform: 'linkedin', url: '#' }, { platform: 'instagram', url: '#' }, { platform: 'web', url: '#' }];
  const customFont = block.style?.fontFamily;
  const fontFam = customFont ? `'${customFont}', Arial, sans-serif` : `'${bodyFont}', Arial, sans-serif`;
  const fBtnColor = block.style?.socialBtnColor || alpha('#ffffff', 0.6);
  const qrUrl = block.style?.footerQrUrl;
  const qrImageUrl = block.style?.footerQrImageUrl;
  const qrLabel = block.style?.footerQrLabel || 'Escanea para más info';
  const companyInfo = block.style?.footerCompanyInfo;
  const footerBgColor = block.backgroundColor || '#111117';
  const footerLogoUrl = block.style?.footerShowLogo !== 'false' ? (block.imageUrl || style.logoUrl) : undefined;
  const footerLogoHeight = parseInt(block.style?.footerLogoHeight || '30') || 30;
  const footerLogoOpacity = parseFloat(block.style?.footerLogoOpacity || '0.6');
  const footerLogoX = parseFloat(block.style?.footerLogoX || '0');
  const footerLogoY = parseFloat(block.style?.footerLogoY || '0');

  return (
    <Section style={{ padding: 0 }}>
      {/* Gradient top edge */}
      <Section
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${style.colorPrimary}, ${style.colorSecondary}, ${style.colorPrimary})`,
        }}
      />
      <Section
        style={{
          backgroundColor: footerBgColor,
          padding: bPad(block, 36, 48, 32, 48),
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        {footerLogoUrl && (
          <Img
            src={footerLogoUrl}
            alt=""
            height={footerLogoHeight}
            style={{
              height: footerLogoHeight,
              width: 'auto',
              display: 'block',
              margin: '0 auto 20px',
              opacity: footerLogoOpacity,
              position: (footerLogoX !== 0 || footerLogoY !== 0) ? 'relative' : undefined,
              left: footerLogoX !== 0 ? footerLogoX : undefined,
              top: footerLogoY !== 0 ? footerLogoY : undefined,
            }}
          />
        )}

        {/* Social pills */}
        {fLinks.length > 0 && (
          <Row style={{ marginBottom: 20 }}>
            <Column align="center">
              {fLinks.map(({ platform, url }, idx) => (
                <a
                  key={`${platform}-${idx}`}
                  href={url || '#'}
                  style={{
                    display: 'inline-block',
                    padding: '7px 18px',
                    margin: '0 4px 4px',
                    fontSize: 11,
                    color: fBtnColor,
                    textDecoration: 'none',
                    border: `1px solid ${block.style?.socialBtnColor || alpha('#ffffff', 0.15)}`,
                    borderRadius: 24,
                    fontFamily: fontFam,
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    verticalAlign: 'middle',
                  }}
                >
                  <img
                    src={makeSocialIconSrc(platform, fBtnColor)}
                    alt={platform}
                    width={14}
                    height={14}
                    style={{ display: 'inline-block', verticalAlign: 'middle', width: 14, height: 14, marginRight: 6 }}
                  />
                  <span style={{ verticalAlign: 'middle' }}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                </a>
              ))}
            </Column>
          </Row>
        )}

        <Hr
          style={{
            borderColor: alpha('#ffffff', 0.08),
            borderTopWidth: 1,
            margin: '0 0 20px',
          }}
        />

        {/* QR Code */}
        {(qrImageUrl || qrUrl) && (
          <Section style={{ marginBottom: 20, textAlign: 'center' }}>
            {qrImageUrl ? (
              <Img
                src={qrImageUrl}
                alt="QR Code"
                width={100}
                height={100}
                style={{ display: 'block', margin: '0 auto 8px', width: 100, height: 100 }}
              />
            ) : (
              <a href={qrUrl!} style={{ textDecoration: 'none' }}>
                <Img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl!)}&bgcolor=111117&color=ffffff`}
                  alt="QR Code"
                  width={100}
                  height={100}
                  style={{ display: 'block', margin: '0 auto 8px', width: 100, height: 100 }}
                />
              </a>
            )}
            <Text style={{ fontFamily: fontFam, fontSize: 10, color: alpha('#ffffff', 0.25), margin: '0 0 4px', letterSpacing: '0.5px' }}>
              {qrLabel}
            </Text>
          </Section>
        )}

        <Text
          style={{
            margin: 0,
            fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 11,
            color: block.style?.color || alpha('#ffffff', 0.3),
            lineHeight: '1.8',
            fontFamily: fontFam,
            fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
            textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
            textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
          }}
        >
          <Lines text={block.content || 'Material exclusivo para profesionales de la salud.'} />
        </Text>

        {/* Company info (regulatory) */}
        {companyInfo && (
          <Text
            style={{
              margin: '16px 0 0',
              fontSize: 9,
              color: alpha('#ffffff', 0.18),
              lineHeight: '1.7',
              fontFamily: fontFam,
              borderTop: `1px solid ${alpha('#ffffff', 0.05)}`,
              paddingTop: 16,
            }}
          >
            <Lines text={companyInfo} />
          </Text>
        )}

        <Text
          style={{
            margin: '14px 0 0',
            fontSize: 10,
            color: alpha('#ffffff', 0.15),
            fontFamily: fontFam,
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
          }}
        >
          © {new Date().getFullYear()} TODOS LOS DERECHOS RESERVADOS
        </Text>
      </Section>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// QUOTE — Full tinted band with giant quotation mark
// ═══════════════════════════════════════════════════════════

const QuoteBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const quoteColor = block.style?.color || '#333333';
  const quoteFontSize = block.style?.fontSize ? parseInt(block.style.fontSize) : 18;
  const qIcon = block.style?.quoteIcon || '❝';
  const qBg = block.style?.quoteBg || lighten(style.colorPrimary, 0.95);
  const qBorder = block.style?.quoteBorder || style.colorPrimary;
  const qAuthorColor = block.style?.quoteAuthorColor || style.colorPrimary;

  return (
    <Section
      style={{
        backgroundColor: qBg,
        borderLeft: `6px solid ${qBorder}`,
        padding: bPad(block, 36, 48, 32, 48),
        ...getBlockBg(block),
      }}
    >
      {/* Decorative icon */}
      {qIcon !== 'none' && (
        <Text
          style={{
            fontSize: 56,
            lineHeight: '1',
            color: alpha(qBorder, 0.18),
            margin: '0 0 8px',
          }}
        >
          {qIcon}
        </Text>
      )}
      <Text
        style={{
          fontFamily: block.style?.fontFamily
            ? `'${block.style.fontFamily}', Arial, sans-serif`
            : `'${bodyFont}', Arial, sans-serif`,
          fontSize: quoteFontSize,
          fontStyle: 'italic',
          lineHeight: '1.8',
          color: quoteColor,
          margin: '0 0 16px',
          fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
          textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
          textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
        }}
      >
        <Lines text={block.content || ''} />
      </Text>
      {block.quoteAuthor && (
        <Text
          style={{
            fontFamily: `'${bodyFont}', Arial, sans-serif`,
            fontSize: 12,
            color: qAuthorColor,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '1.5px',
            textTransform: 'uppercase' as const,
          }}
        >
          — {block.quoteAuthor}
        </Text>
      )}
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// SOCIAL — Customizable button pills with real SVG icons
// ═══════════════════════════════════════════════════════════

const SOCIAL_SVGS: Record<string, string> = {
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  web: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>`,
};

const makeSocialIconSrc = (platform: string, color: string) => {
  const svg = (SOCIAL_SVGS[platform.toLowerCase()] || SOCIAL_SVGS.web).replace(/COLOR/g, color);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const SocialBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const links = block.socialLinks ?? [
    { platform: 'linkedin', url: '#' },
    { platform: 'instagram', url: '#' },
    { platform: 'web', url: '#' },
  ];
  const btnColor = block.style?.socialBtnColor || style.colorPrimary;
  const btnStyleType = block.style?.socialBtnStyle || 'outline';
  const btnShape = block.style?.socialBtnShape || 'pill';
  const btnSize = block.style?.socialBtnSize || 'md';
  const sizeMap: Record<string, { pad: string; fs: number; icon: number }> = {
    sm: { pad: '6px 14px', fs: 11, icon: 14 },
    md: { pad: '10px 22px', fs: 12, icon: 16 },
    lg: { pad: '14px 28px', fs: 14, icon: 18 },
  };
  const sz = sizeMap[btnSize] || sizeMap.md;
  const shapeMap: Record<string, number> = { pill: 30, rounded: 6, square: 0 };
  const br = shapeMap[btnShape] ?? 30;
  const isFilled = btnStyleType === 'filled';
  const isIconOnly = btnStyleType === 'icon-only';
  const iconColor = isFilled ? '#ffffff' : btnColor;
  const customFont = block.style?.fontFamily;
  const fontFam = customFont ? `'${customFont}', Arial, sans-serif` : `'${bodyFont}', Arial, sans-serif`;

  return (
    <Section style={{ padding: bPad(block, 28, 48, 28, 48), textAlign: 'center', ...getBlockBg(block) }}>
      {block.content && (
        <Text
          style={{
            fontFamily: fontFam,
            fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 12,
            color: block.style?.color || '#999999',
            margin: '0 0 16px',
            letterSpacing: '1.5px',
            textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase',
            fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
            textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
          }}
        >
          {block.content}
        </Text>
      )}
      <Row>
        <Column align="center">
          {links.map(({ platform, url }, idx) => (
            <a
              key={`${platform}-${idx}`}
              href={url || '#'}
              style={{
                display: 'inline-block',
                padding: isIconOnly ? `${sz.icon * 0.5}px` : sz.pad,
                margin: '0 4px 6px',
                fontSize: sz.fs,
                color: isFilled ? '#ffffff' : btnColor,
                textDecoration: 'none',
                backgroundColor: isFilled ? btnColor : 'transparent',
                border: isIconOnly ? 'none' : `2px solid ${btnColor}`,
                borderRadius: br,
                fontFamily: fontFam,
                fontWeight: 700,
                letterSpacing: '0.3px',
                verticalAlign: 'middle',
              }}
            >
              <img
                src={makeSocialIconSrc(platform, iconColor)}
                alt={platform}
                width={sz.icon}
                height={sz.icon}
                style={{ display: 'inline-block', verticalAlign: 'middle', width: sz.icon, height: sz.icon }}
              />
              {!isIconOnly && (
                <span style={{ verticalAlign: 'middle', marginLeft: 6 }}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </span>
              )}
            </a>
          ))}
        </Column>
      </Row>
    </Section>
  );
};

// ═══════════════════════════════════════════════════════════
// VIDEO — Cinematic dark gradient with play circle
// ═══════════════════════════════════════════════════════════

const VideoBlock: React.FC<BlockProps> = ({ block, style, titleFont }) => {
  const videoUrl = block.videoUrl || '#';
  const thumbnail = block.imageUrl || getYouTubeThumbnail(block.videoUrl);
  const txtColor = block.style?.color || alpha('#ffffff', 0.85);
  const txtSize = parseInt(block.style?.fontSize || '16') || 16;
  const vFont = block.style?.fontFamily
    ? `'${block.style.fontFamily}', Arial, sans-serif`
    : `'${titleFont}', Arial, sans-serif`;
  const vAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';

  return (
    <Section style={{ padding: bPad(block, 24, 48, 24, 48), ...getBlockBg(block) }}>
      <a href={videoUrl} style={{ display: 'block', textDecoration: 'none' }}>
        <Section
          style={{
            borderRadius: 6,
            overflow: 'hidden',
            background: thumbnail
              ? undefined
              : `linear-gradient(160deg, ${darken(style.colorPrimary, 0.65)} 0%, #111117 60%, ${darken(style.colorSecondary, 0.6)} 100%)`,
            textAlign: vAlign,
          }}
        >
          {thumbnail ? (
            /* Thumbnail with overlay */
            <Section style={{ position: 'relative' }}>
              <Img
                src={thumbnail}
                alt={block.content || 'Video'}
                style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6 }}
              />
              {/* Dark overlay with play button + title */}
              <Section style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.45)',
                textAlign: vAlign,
                padding: '40px 32px',
              }}>
                <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: vAlign === 'center' ? '0 auto 16px' : vAlign === 'right' ? '0 0 16px auto' : '0 auto 16px 0' }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 36,
                          border: `2px solid ${alpha('#ffffff', 0.5)}`,
                          textAlign: 'center',
                          verticalAlign: 'middle',
                        }}
                      >
                        <Text style={{ fontSize: 28, color: alpha('#ffffff', 0.9), margin: 0, lineHeight: '1' }}>▶</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Heading
                  as="h3"
                  style={{
                    fontFamily: vFont,
                    fontSize: txtSize,
                    color: txtColor,
                    fontWeight: block.style?.fontWeight === 'bold' ? 900 : 700,
                    margin: 0,
                    letterSpacing: '0.5px',
                    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                  }}
                >
                  {block.content || 'Ver video'}
                </Heading>
              </Section>
            </Section>
          ) : (
            <Section style={{ padding: '56px 40px' }}>
              {/* Play circle — bordered ring, not filled */}
              <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: vAlign === 'center' ? '0 auto 16px' : vAlign === 'right' ? '0 0 16px auto' : '0 auto 16px 0' }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        border: `2px solid ${alpha('#ffffff', 0.4)}`,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    >
                      <Text style={{ fontSize: 28, color: alpha('#ffffff', 0.8), margin: 0, lineHeight: '1' }}>▶</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
              <Heading
                as="h3"
                style={{
                  fontFamily: vFont,
                  fontSize: txtSize,
                  color: txtColor,
                  fontWeight: block.style?.fontWeight === 'bold' ? 900 : 700,
                  margin: 0,
                  letterSpacing: '0.5px',
                  textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                }}
              >
                {block.content || 'Ver video'}
              </Heading>
            </Section>
          )}
        </Section>
      </a>
    </Section>
  );
};



// ═══════════════════════════════════════════════════════════
// COLUMNS — Two columns with thin colored separator
// ═══════════════════════════════════════════════════════════

const ColumnsBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const cols = (block.content || '').split('|||').map((c) => c.trim());
  const left = cols[0] || '';
  const right = cols[1] || '';
  const customFont = block.style?.fontFamily;
  const colFontFam = customFont ? `'${customFont}', Arial, sans-serif` : `'${bodyFont}', Arial, sans-serif`;
  const colTextStyle: React.CSSProperties = {
    fontFamily: colFontFam,
    fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 14,
    lineHeight: '1.8',
    color: block.style?.color || '#4a4a4a',
    fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
    margin: 0,
  };

  return (
    <Section className="em-pad em-stack" style={{ padding: bPad(block, 24, 48, 24, 48), ...getBlockBg(block) }}>
      <Row>
        <Column style={{ width: '48%', verticalAlign: 'top', paddingRight: 16, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined }}>
          <Text style={colTextStyle}>
            <Lines text={left} />
          </Text>
        </Column>
        {/* Thin colored separator */}
        <Column style={{ width: '4%', verticalAlign: 'top', textAlign: 'center' }}>
          <Section
            style={{
              width: 2,
              height: '100%',
              minHeight: 60,
              backgroundColor: lighten(style.colorPrimary, 0.7),
              margin: '0 auto',
            }}
          />
        </Column>
        <Column style={{ width: '48%', verticalAlign: 'top', paddingLeft: 16, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined }}>
          <Text style={colTextStyle}>
            <Lines text={right} />
          </Text>
        </Column>
      </Row>
    </Section>
  );
};
