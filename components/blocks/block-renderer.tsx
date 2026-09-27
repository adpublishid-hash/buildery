import type React from "react";

import type { Block, BlockStyle } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

import { AffiliateCtaBlock } from "./affiliate-cta-block";
import { BannerBlock } from "./banner-block";
import { BioProfileBlock } from "./bio-profile-block";
import { BlogBlock } from "./blog-block";
import { ButtonBlock } from "./button-block";
import { ColumnsBlock } from "./columns-block";
import { ComparisonTableBlock } from "./comparison-table-block";
import { CountdownBlock } from "./countdown-block";
import { CtaBlock } from "./cta-block";
import { CustomHtmlBlock } from "./custom-html-block";
import { ContactFormBlock } from "./contact-form-block";
import { KursusBlock } from "./kursus-block";
import { MarqueeBlock } from "./marquee-block";
import { DividerBlock } from "./divider-block";
import { FaqBlock } from "./faq-block";
import { FeatureGridBlock } from "./feature-grid-block";
import { FormEmbedBlock } from "./form-embed-block";
import { GalleryBlock } from "./gallery-block";
import { ImageSliderBlock } from "./image-slider-block";
import { HeroBlock } from "./hero-block";
import { ImageBlock } from "./image-block";
import { LogosBlock } from "./logos-block";
import { MembershipBlock } from "./membership-block";
import { FooterBlock, HeaderBlock, MenuBlock } from "./navigation-blocks";
import { NewsletterBlock } from "./newsletter-block";
import { PricingBlock } from "./pricing-block";
import { ProdukBlock } from "./produk-block";
import { StatsBlock } from "./stats-block";
import { StepsBlock } from "./steps-block";
import { TestimonialBlock } from "./testimonial-block";
import { TextBlock } from "./text-block";
import { VideoBlock } from "./video-block";
import { WhatsappFloatBlock } from "./whatsapp-float-block";
import { MapBlock } from "./map-block";
import { TabsBlock } from "./tabs-block";

/** Renders a single block from its typed data. Pure and presentational. */
export function BlockRenderer({
  block,
  previewDevice,
}: {
  block: Block;
  previewDevice?: "desktop" | "tablet" | "mobile";
}) {
  const rendered = renderBlock(block);
  const style = getBlockStyle(block.data.style);
  const visibility = block.data.style?.visibility ?? "all";

  return (
    <div
      // A stable hook for the page's custom CSS, e.g. [data-bd-block="hero"].
      data-bd-block={block.type.toLowerCase()}
      className={cn(
        "bd-block-style",
        `bd-visible-${visibility}`,
        previewDevice === "tablet" && "bd-force-tablet",
        previewDevice === "mobile" && "bd-force-mobile"
      )}
      style={style}
    >
      {rendered}
    </div>
  );
}

function renderBlock(block: Block) {
  switch (block.type) {
    case "HEADER":
      return <HeaderBlock data={block.data} />;
    case "MENU":
      return <MenuBlock data={block.data} />;
    case "HERO":
      return <HeroBlock data={block.data} />;
    case "TEXT":
      return <TextBlock data={block.data} />;
    case "CUSTOM_HTML":
      return <CustomHtmlBlock data={block.data} />;
    case "COLUMNS":
      return <ColumnsBlock data={block.data} />;
    case "IMAGE":
      return <ImageBlock data={block.data} />;
    case "CTA":
      return <CtaBlock data={block.data} />;
    case "FEATURE_GRID":
      return <FeatureGridBlock data={block.data} />;
    case "STATS":
      return <StatsBlock data={block.data} />;
    case "STEPS":
      return <StepsBlock data={block.data} />;
    case "PRICING":
      return <PricingBlock data={block.data} />;
    case "TESTIMONIAL":
      return <TestimonialBlock data={block.data} />;
    case "LOGOS":
      return <LogosBlock data={block.data} />;
    case "GALLERY":
      return <GalleryBlock data={block.data} />;
    case "IMAGE_SLIDER":
      return <ImageSliderBlock data={block.data} />;
    case "VIDEO":
      return <VideoBlock data={block.data} />;
    case "FAQ":
      return <FaqBlock data={block.data} />;
    case "NEWSLETTER":
      return <NewsletterBlock data={block.data} />;
    case "BANNER":
      return <BannerBlock data={block.data} />;
    case "CONTACT_FORM":
      return <ContactFormBlock data={block.data} />;
    case "FORM_EMBED":
      return <FormEmbedBlock data={block.data} />;
    case "DIVIDER":
      return <DividerBlock data={block.data} />;
    case "PRODUCT_SHOWCASE":
      return <ProdukBlock data={block.data} />;
    case "COURSE_SHOWCASE":
      return <KursusBlock data={block.data} />;
    case "BLOG_SHOWCASE":
      return <BlogBlock data={block.data} />;
    case "MEMBERSHIP_SHOWCASE":
      return <MembershipBlock data={block.data} />;
    case "AFFILIATE_CTA":
      return <AffiliateCtaBlock data={block.data} />;
    case "BUTTON":
      return <ButtonBlock data={block.data} />;
    case "BIO_PROFILE":
      return <BioProfileBlock data={block.data} />;
    case "COUNTDOWN":
      return <CountdownBlock data={block.data} />;
    case "COMPARISON_TABLE":
      return <ComparisonTableBlock data={block.data} />;
    case "MARQUEE":
      return <MarqueeBlock data={block.data} />;
    case "FOOTER":
      return <FooterBlock data={block.data} />;
    case "WHATSAPP_FLOAT":
      return <WhatsappFloatBlock data={block.data} />;
    case "MAP":
      return <MapBlock data={block.data} />;
    case "TABS":
      return <TabsBlock data={block.data} />;
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function getBlockStyle(style?: Partial<BlockStyle>): React.CSSProperties {
  const styleData = style ?? {};
  const tabletData = styleData.tablet ?? {};
  const mobileData = styleData.mobile ?? {};
  const desktop = getDeviceStyle(styleData);
  const tablet = getDeviceStyle(tabletData);
  const mobile = getDeviceStyle(mobileData);
  const hasRadius =
    Boolean(desktop.radius) || Boolean(tablet.radius) || Boolean(mobile.radius);

  const border = borderCss(styleData.border, styleData.borderColor);
  const shadow = shadowCss(styleData.shadow);
  const textAlign =
    styleData.textAlign && styleData.textAlign !== "default"
      ? styleData.textAlign
      : undefined;

  return {
    fontFamily: desktop.fontFamily,
    overflow: hasRadius ? "hidden" : undefined,
    ["--bd-block-border" as string]: border,
    ["--bd-block-shadow" as string]: shadow,
    ["--bd-block-text-align" as string]: textAlign,
    ["--bd-block-padding-top" as string]: desktop.paddingY,
    ["--bd-block-padding-bottom" as string]: desktop.paddingY,
    ["--bd-block-padding-left" as string]: desktop.paddingX,
    ["--bd-block-padding-right" as string]: desktop.paddingX,
    ["--bd-block-margin-top" as string]: desktop.marginY,
    ["--bd-block-margin-bottom" as string]: desktop.marginY,
    ["--bd-block-bg" as string]: styleData.backgroundColor || undefined,
    ["--bd-block-color" as string]: styleData.textColor || undefined,
    ["--bd-block-radius" as string]: desktop.radius,
    ["--bd-block-text-color" as string]: styleData.textColor || undefined,
    ["--bd-block-heading-size" as string]: desktop.headingSize,
    ["--bd-block-body-size" as string]: desktop.bodySize,
    ["--bd-tablet-padding-top" as string]: tablet.paddingY,
    ["--bd-tablet-padding-bottom" as string]: tablet.paddingY,
    ["--bd-tablet-padding-left" as string]: tablet.paddingX,
    ["--bd-tablet-padding-right" as string]: tablet.paddingX,
    ["--bd-tablet-margin-top" as string]: tablet.marginY,
    ["--bd-tablet-margin-bottom" as string]: tablet.marginY,
    ["--bd-tablet-bg" as string]: tabletData.backgroundColor || undefined,
    ["--bd-tablet-color" as string]: tabletData.textColor || undefined,
    ["--bd-tablet-radius" as string]: tablet.radius,
    ["--bd-tablet-text-color" as string]: tabletData.textColor || undefined,
    ["--bd-tablet-heading-size" as string]: tablet.headingSize,
    ["--bd-tablet-body-size" as string]: tablet.bodySize,
    ["--bd-mobile-padding-top" as string]: mobile.paddingY,
    ["--bd-mobile-padding-bottom" as string]: mobile.paddingY,
    ["--bd-mobile-padding-left" as string]: mobile.paddingX,
    ["--bd-mobile-padding-right" as string]: mobile.paddingX,
    ["--bd-mobile-margin-top" as string]: mobile.marginY,
    ["--bd-mobile-margin-bottom" as string]: mobile.marginY,
    ["--bd-mobile-bg" as string]: mobileData.backgroundColor || undefined,
    ["--bd-mobile-color" as string]: mobileData.textColor || undefined,
    ["--bd-mobile-radius" as string]: mobile.radius,
    ["--bd-mobile-text-color" as string]: mobileData.textColor || undefined,
    ["--bd-mobile-heading-size" as string]: mobile.headingSize,
    ["--bd-mobile-body-size" as string]: mobile.bodySize,
  };
}

function getDeviceStyle(style: Partial<BlockStyle>) {
  const paddingY = px(style.paddingYValue) ?? {
    default: undefined,
    none: "0px",
    sm: "24px",
    lg: "72px",
    xl: "112px",
  }[style.paddingY ?? "default"];
  const paddingX = px(style.paddingXValue) ?? {
    default: undefined,
    none: "0px",
    sm: "16px",
    lg: "48px",
  }[style.paddingX ?? "default"];
  const marginY = px(style.marginYValue) ?? {
    none: undefined,
    sm: "16px",
    md: "32px",
    lg: "56px",
  }[style.marginY ?? "none"];
  const radius = px(style.borderRadiusValue) ?? {
    none: undefined,
    sm: "8px",
    md: "12px",
    lg: "20px",
    xl: "32px",
  }[style.borderRadius ?? "none"];
  const headingSize = fontPx(style.headingSizeValue) ?? {
    default: undefined,
    sm: "24px",
    md: "32px",
    lg: "44px",
    xl: "56px",
    "2xl": "72px",
  }[style.headingSize ?? "default"];
  const bodySize = fontPx(style.bodySizeValue) ?? {
    default: undefined,
    sm: "14px",
    md: "16px",
    lg: "20px",
  }[style.bodySize ?? "default"];
  const fontFamily = {
    default: undefined,
    sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    serif: "Georgia, Cambria, Times New Roman, serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    display: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  }[style.fontFamily ?? "default"];

  return {
    paddingY,
    paddingX,
    marginY,
    radius,
    headingSize,
    bodySize,
    fontFamily,
  };
}

function px(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.max(0, value)}px`
    : undefined;
}

function fontPx(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${value}px`
    : undefined;
}

function borderCss(border?: BlockStyle["border"], color?: string) {
  const width = border === "sm" ? "1px" : border === "md" ? "2px" : null;
  if (!width) return undefined;
  return `${width} solid ${color?.trim() || "#e4e4e7"}`;
}

function shadowCss(shadow?: BlockStyle["shadow"]) {
  switch (shadow) {
    case "sm":
      return "0 1px 2px 0 rgb(0 0 0 / 0.05)";
    case "md":
      return "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
    case "lg":
      return "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
    case "xl":
      return "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)";
    default:
      return undefined;
  }
}
