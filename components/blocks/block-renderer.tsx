import type { Block } from "@/lib/blocks/schema";
import { contentVariants, resolveBlockDataForDevice } from "@/lib/blocks/responsive-content";
import { blockWrapperProps } from "@/lib/blocks/style";
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
  editor = false,
}: {
  block: Block;
  previewDevice?: "desktop" | "tablet" | "mobile";
  /**
   * Set by the builder canvas. Hidden blocks still render there (dimmed) so
   * they can be edited, and sticky positioning is left off so a sticky block
   * does not ride over the canvas toolbars.
   */
  editor?: boolean;
}) {
  const styleData = block.data.style;
  if (!editor && styleData?.hidden) return null;

  const rendered = editor
    ? renderBlock(withData(block, resolveBlockDataForDevice(block.type, block.data, previewDevice ?? "desktop")))
    : renderPublicVariants(block);
  // The builder canvas is narrower than the browser, so it shows the
  // previewed device's style directly instead of relying on media queries.
  const wrapper = blockWrapperProps(
    styleData,
    block.id,
    editor ? (previewDevice ?? "desktop") : undefined
  );
  const visibility = styleData?.visibility ?? "all";

  return (
    <>
      {wrapper.css ? (
        <style dangerouslySetInnerHTML={{ __html: wrapper.css }} />
      ) : null}
      <div
        // A stable hook for the page's custom CSS, e.g. [data-bd-block="hero"].
        data-bd-block={block.type.toLowerCase()}
        id={wrapper.id}
        className={cn(
          "bd-block-style",
          `bd-visible-${visibility}`,
          wrapper.className,
          !editor && styleData?.sticky && "bd-block-sticky",
          editor && styleData?.hidden && "bd-editor-hidden",
          previewDevice === "tablet" && "bd-force-tablet",
          previewDevice === "mobile" && "bd-force-mobile"
        )}
      >
        {rendered}
      </div>
    </>
  );
}

function withData(block: Block, data: Block["data"]) {
  return (data === block.data ? block : { ...block, data }) as Block;
}

/**
 * A block whose layout differs per device (Konten tab, tablet/mobile mode) is
 * rendered once per distinct version; CSS shows the one for the current
 * screen width. `display: contents` keeps each version's root the effective
 * child of the wrapper, so spacing and width rules still reach it.
 */
// Spelled out so Tailwind finds them; the rules live in globals.css.
const VARIANT_CLASS = {
  desktop: "bd-variant-on-desktop",
  tablet: "bd-variant-on-tablet",
  mobile: "bd-variant-on-mobile",
} as const;

function renderPublicVariants(block: Block) {
  const variants = contentVariants(block.type, block.data);
  if (variants.length === 1) return renderBlock(block);
  return variants.map((variant) => (
    <div
      key={variant.devices.join("-")}
      className={cn(
        "bd-variant",
        variant.devices.map((device) => VARIANT_CLASS[device])
      )}
    >
      {renderBlock(withData(block, variant.data))}
    </div>
  ));
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
