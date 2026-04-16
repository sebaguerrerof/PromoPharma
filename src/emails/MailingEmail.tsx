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
  const bodyBg = emailSettings?.bodyBackground || '#0d0d11';
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
          {blocks.map((block, idx) => (
            <BlockRenderer
              key={block.id}
              block={block}
              blockIndex={idx}
              totalBlocks={blocks.length}
              style={style}
              titleFont={titleFont}
              bodyFont={bodyFont}
            />
          ))}
        </Container>

        {/* ── BOTTOM UNSUBSCRIBE ───────────────────────── */}
        <Container style={{ maxWidth: containerW, margin: '0 auto', padding: '20px 0 32px' }}>
          <Text
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: alpha('#ffffff', 0.3),
              margin: 0,
              fontFamily: `'${bodyFont}', Arial, sans-serif`,
            }}
          >
            Si no deseas recibir más correos,{' '}
            <a href="#" style={{ color: alpha('#ffffff', 0.4), textDecoration: 'underline' }}>
              cancela tu suscripción
            </a>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default MailingEmail;

// ── Padding helper ───────────────────────────────────────
const bPad = (b: MailingBlockContent, t: number, r: number, bot: number, l: number) =>
  `${b.paddingTop ?? t}px ${b.paddingRight ?? r}px ${b.paddingBottom ?? bot}px ${b.paddingLeft ?? l}px`;

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

  const wrapBg = (el: React.ReactElement) => {
    if (block.backgroundColor || block.backgroundImage) {
      return (
        <Section
          style={{
            backgroundColor: block.backgroundColor || undefined,
            backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
            backgroundSize: block.backgroundImage ? 'cover' : undefined,
            backgroundPosition: block.backgroundImage ? 'center' : undefined,
          }}
        >
          {el}
        </Section>
      );
    }
    return el;
  };

  switch (block.type) {
    case 'header': return wrapBg(<HeaderBlock {...common} />);
    case 'hero':   return wrapBg(<HeroBlock {...common} />);
    case 'text':   return wrapBg(<TextBlock {...common} />);
    case 'image':  return wrapBg(<ImageBlock {...common} />);
    case 'bullets': return wrapBg(<BulletsBlock {...common} />);
    case 'cta':    return wrapBg(<CtaBlock {...common} />);
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
  const bgStyle: React.CSSProperties = block.backgroundImage
    ? {
        backgroundImage: `url(${block.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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
              {logoSrc && (
                <Img
                  src={logoSrc}
                  alt="Logo"
                  height={42}
                  style={{
                    height: 42,
                    width: 'auto',
                    display: 'block',
                    marginBottom: 16,
                  }}
                />
              )}
              <Heading
                as="h1"
                style={{
                  fontFamily: `'${block.style?.fontFamily || titleFont}', Arial, sans-serif`,
                  fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 22,
                  fontWeight: 800,
                  color: block.style?.color || '#ffffff',
                  margin: 0,
                  letterSpacing: '-0.3px',
                  textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase' as const,
                  textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
                }}
              >
                {block.content || ''}
              </Heading>
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

const HeroBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => (
  <Section style={{ padding: 0 }}>
    {block.imageUrl ? (
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
        }}
      />
    ) : (
      <Section
        style={{
          background: `linear-gradient(165deg, ${darken(style.colorPrimary, 0.7)} 0%, ${darken(style.colorPrimary, 0.45)} 40%, ${darken(style.colorSecondary, 0.5)} 100%)`,
          padding: bPad(block, 72, 48, 64, 48),
          textAlign: 'center',
        }}
      >
        {/* Decorative oversized symbol */}
        <Text
          style={{
            fontSize: 120,
            lineHeight: '1',
            color: alpha('#ffffff', 0.04),
            margin: '-20px 0 -50px',
            fontWeight: 900,
            fontFamily: `'${titleFont}', Arial, sans-serif`,
            textAlign: 'center',
          }}
        >
          +
        </Text>

        {/* Badge pill */}
        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: '0 auto 20px' }}>
          <tbody>
            <tr>
              <td
                style={{
                  padding: '6px 20px',
                  border: `1px solid ${alpha('#ffffff', 0.2)}`,
                  borderRadius: 30,
                  fontSize: 10,
                  fontFamily: `'${bodyFont}', Arial, sans-serif`,
                  color: alpha('#ffffff', 0.7),
                  letterSpacing: '2px',
                  textTransform: 'uppercase' as const,
                  textAlign: 'center',
                }}
              >
                DESTACADO
              </td>
            </tr>
          </tbody>
        </table>

        <Heading
          as="h2"
          className="em-hero-h"
          style={{
            fontFamily: `'${titleFont}', Arial, sans-serif`,
            fontSize: 36,
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 12px',
            letterSpacing: '-0.8px',
            lineHeight: '1.15',
          }}
        >
          {block.content || 'Imagen destacada'}
        </Heading>
        <Text
          style={{
            fontSize: 14,
            color: alpha('#ffffff', 0.45),
            margin: 0,
            fontFamily: `'${bodyFont}', Arial, sans-serif`,
          }}
        >
          Agrega una imagen para potenciar esta sección
        </Text>
      </Section>
    )}
  </Section>
);

// ═══════════════════════════════════════════════════════════
// TEXT — Editorial with thick accent bar for titles
// ═══════════════════════════════════════════════════════════

const TextBlock: React.FC<BlockProps> = ({ block, style, titleFont, bodyFont }) => {
  const isTitle = block.style?.fontWeight === 'bold';
  const baseFontSize = block.style?.fontSize ? parseInt(block.style.fontSize) : isTitle ? 24 : 16;

  const textStyle: React.CSSProperties = {
    fontFamily: isTitle
      ? `'${titleFont}', Arial, sans-serif`
      : `'${bodyFont}', Arial, sans-serif`,
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
    <Section className="em-pad" style={{ padding: isTitle ? bPad(block, 36, 48, 8, 48) : bPad(block, 8, 48, 20, 48) }}>
      {isTitle ? (
        <>
          {/* Thick accent bar */}
          <Section
            style={{
              width: 48,
              height: 5,
              backgroundColor: style.colorPrimary,
              marginBottom: 20,
            }}
          />
          <Heading as="h2" className="em-title-h" style={textStyle}>
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
    boxShadow: fallbackShadow && shadow === 'md' ? fallbackShadow : (imgShadowMap[shadow] || imgShadowMap.md),
    border,
  };
  return out;
};

const ImageBlock: React.FC<BlockProps> = ({ block, style }) => (
  <Section style={{ padding: bPad(block, 24, 48, 24, 48) }}>
    {block.imageUrl ? (
      <Img
        src={block.imageUrl}
        alt={block.content || ''}
        style={getImgStyle(block, `0 8px 32px ${alpha(style.colorPrimary, 0.15)}, 0 2px 8px rgba(0,0,0,0.06)`)}
      />
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
  const itemBg = block.style?.bulletItemBg;

  const getBadgeText = (i: number) => {
    switch (bulletStyle) {
      case 'bullet': return '•';
      case 'letter': return String.fromCharCode(65 + i);
      case 'none': return '';
      default: return String(i + 1).padStart(2, '0');
    }
  };

  return (
    <Section className="em-pad" style={{ padding: bPad(block, 20, 48, 28, 48) }}>
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
                  backgroundColor: i === 0 ? badgeBg : lighten(badgeBg, 0.92),
                  verticalAlign: 'middle',
                  textAlign: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: `'${bodyFont}', Arial, sans-serif`,
                    fontSize: bulletStyle === 'bullet' ? 20 : 14,
                    fontWeight: 800,
                    color: i === 0 ? '#ffffff' : badgeBg,
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
                backgroundColor: itemBg || (i === 0 ? lighten(badgeBg, 0.96) : '#f9f9fb'),
                padding: '14px 20px',
              }}
            >
              <Text
                style={{
                  fontFamily: `'${bodyFont}', Arial, sans-serif`,
                  fontSize,
                  lineHeight: '1.6',
                  color: textColor,
                  margin: 0,
                  fontWeight: i === 0 ? 600 : 400,
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

  return (
    <Section
      style={{
        background: `linear-gradient(135deg, ${bandColor} 0%, ${darken(bandColor, 0.15)} 100%)`,
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
// DIVIDER — Geometric with centered dot accent
// ═══════════════════════════════════════════════════════════

const DividerBlock: React.FC<BlockProps> = ({ block, style }) => {
  const lineColor = block.style?.dividerColor || '#e5e5ea';
  const dotColor = block.style?.dividerDotColor || style.colorPrimary;
  return (
    <Section style={{ padding: bPad(block, 24, 48, 24, 48) }}>
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

const FooterBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => (
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
        backgroundColor: '#111117',
        padding: bPad(block, 36, 48, 32, 48),
        textAlign: 'center',
      }}
    >
      {/* Logo */}
      {style.logoUrl && (
        <Img
          src={style.logoUrl}
          alt=""
          height={30}
          style={{
            height: 30,
            width: 'auto',
            display: 'block',
            margin: '0 auto 20px',
            opacity: 0.6,
          }}
        />
      )}

      {/* Social pills */}
      <Row style={{ marginBottom: 20 }}>
        <Column align="center">
          {['LinkedIn', 'Instagram', 'Web'].map((label) => (
            <a
              key={label}
              href="#"
              style={{
                display: 'inline-block',
                padding: '7px 18px',
                margin: '0 4px',
                fontSize: 11,
                color: alpha('#ffffff', 0.6),
                textDecoration: 'none',
                border: `1px solid ${alpha('#ffffff', 0.15)}`,
                borderRadius: 24,
                fontFamily: `'${bodyFont}', Arial, sans-serif`,
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {label}
            </a>
          ))}
        </Column>
      </Row>

      <Hr
        style={{
          borderColor: alpha('#ffffff', 0.08),
          borderTopWidth: 1,
          margin: '0 0 20px',
        }}
      />

      <Text
        style={{
          margin: 0,
          fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 11,
          color: block.style?.color || alpha('#ffffff', 0.3),
          lineHeight: '1.8',
          fontFamily: `'${bodyFont}', Arial, sans-serif`,
          textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
          textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
        }}
      >
        <Lines text={block.content || 'Material exclusivo para profesionales de la salud.'} />
      </Text>

      <Text
        style={{
          margin: '14px 0 0',
          fontSize: 10,
          color: alpha('#ffffff', 0.15),
          fontFamily: `'${bodyFont}', Arial, sans-serif`,
          letterSpacing: '2px',
          textTransform: 'uppercase' as const,
        }}
      >
        © {new Date().getFullYear()} TODOS LOS DERECHOS RESERVADOS
      </Text>
    </Section>
  </Section>
);

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
      }}
    >
      {/* Decorative icon */}
      {qIcon !== 'none' && (
        <Text
          style={{
            fontSize: 56,
            lineHeight: '1',
            color: alpha(qBorder, 0.18),
            margin: '-10px 0 -30px',
          }}
        >
          {qIcon}
        </Text>
      )}
      <Text
        style={{
          fontFamily: `'${bodyFont}', Arial, sans-serif`,
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
// SOCIAL — Bold bordered pills on light background
// ═══════════════════════════════════════════════════════════

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: '💼', instagram: '📸', facebook: '👤', twitter: '𝕏',
  youtube: '▶️', tiktok: '🎵', web: '🌐', email: '✉️',
};

const SocialBlock: React.FC<BlockProps> = ({ block, style, bodyFont }) => {
  const links = block.socialLinks ?? [
    { platform: 'linkedin', url: '#' },
    { platform: 'instagram', url: '#' },
    { platform: 'web', url: '#' },
  ];
  return (
    <Section style={{ padding: bPad(block, 28, 48, 28, 48), textAlign: 'center' }}>
      {block.content && (
        <Text
          style={{
            fontFamily: `'${bodyFont}', Arial, sans-serif`,
            fontSize: 12,
            color: '#999999',
            margin: '0 0 16px',
            letterSpacing: '1.5px',
            textTransform: 'uppercase' as const,
          }}
        >
          {block.content}
        </Text>
      )}
      <Row>
        <Column align="center">
          {links.map(({ platform, url }) => (
            <a
              key={platform}
              href={url || '#'}
              style={{
                display: 'inline-block',
                padding: '10px 22px',
                margin: '0 4px 6px',
                fontSize: 12,
                color: style.colorPrimary,
                textDecoration: 'none',
                border: `2px solid ${style.colorPrimary}`,
                borderRadius: 30,
                fontFamily: `'${bodyFont}', Arial, sans-serif`,
                fontWeight: 700,
                letterSpacing: '0.3px',
              }}
            >
              {SOCIAL_ICONS[platform.toLowerCase()] || '🔗'}{' '}
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
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
  const thumbnail = block.imageUrl;
  const txtColor = block.style?.color || alpha('#ffffff', 0.85);
  const txtSize = parseInt(block.style?.fontSize || '16') || 16;

  return (
    <Section style={{ padding: bPad(block, 24, 48, 24, 48) }}>
      <a href={videoUrl} style={{ display: 'block', textDecoration: 'none' }}>
        <Section
          style={{
            borderRadius: 6,
            overflow: 'hidden',
            background: thumbnail
              ? undefined
              : `linear-gradient(160deg, ${darken(style.colorPrimary, 0.65)} 0%, #111117 60%, ${darken(style.colorSecondary, 0.6)} 100%)`,
            textAlign: 'center',
          }}
        >
          {thumbnail ? (
            <Img
              src={thumbnail}
              alt={block.content || 'Video'}
              style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6 }}
            />
          ) : (
            <Section style={{ padding: '56px 40px' }}>
              {/* Play circle — bordered ring, not filled */}
              <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: '0 auto 16px' }}>
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
                  fontFamily: `'${titleFont}', Arial, sans-serif`,
                  fontSize: txtSize,
                  color: txtColor,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: '0.5px',
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
  const colTextStyle: React.CSSProperties = {
    fontFamily: `'${bodyFont}', Arial, sans-serif`,
    fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) : 14,
    lineHeight: '1.8',
    color: block.style?.color || '#4a4a4a',
    fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
    margin: 0,
  };

  return (
    <Section className="em-pad em-stack" style={{ padding: bPad(block, 24, 48, 24, 48) }}>
      <Row>
        <Column style={{ width: '48%', verticalAlign: 'top', paddingRight: 16 }}>
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
        <Column style={{ width: '48%', verticalAlign: 'top', paddingLeft: 16 }}>
          <Text style={colTextStyle}>
            <Lines text={right} />
          </Text>
        </Column>
      </Row>
    </Section>
  );
};
