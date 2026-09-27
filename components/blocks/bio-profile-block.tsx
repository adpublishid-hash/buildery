import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Calendar,
  Compass,
  Disc3,
  Dribbble,
  ExternalLink,
  Facebook,
  FileText,
  Gift,
  Github,
  Globe,
  Heart,
  Instagram,
  Linkedin,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Twitch,
  Twitter,
  User2,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  BioProfileData,
  BioProfileLink,
  BioProfileSocial,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  website: Globe,
  email: Mail,
  instagram: Instagram,
  twitter: Twitter,
  x: Twitter,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Disc3,
  linkedin: Linkedin,
  github: Github,
  whatsapp: MessageCircle,
  telegram: Send,
  discord: MessageCircle,
  spotify: Disc3,
  dribbble: Dribbble,
  behance: Compass,
  twitch: Twitch,
  custom: ExternalLink,
};

const LINK_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  mail: Mail,
  calendar: Calendar,
  star: Star,
  heart: Heart,
  globe: Globe,
  external: ExternalLink,
  link: Link2,
  message: MessageCircle,
  phone: Phone,
  shop: ShoppingBag,
  download: ArrowDownToLine,
  file: FileText,
  gift: Gift,
  user: User2,
  lock: Lock,
};

const WIDTH_CLASS = {
  narrow: "max-w-xl",
  wide: "max-w-3xl",
  full: "max-w-none",
};

const AVATAR_SIZE = {
  sm: "h-16 w-16 text-lg",
  md: "h-20 w-20 text-xl",
  lg: "h-28 w-28 text-2xl",
  xl: "h-32 w-32 text-3xl",
};

const AVATAR_SHAPE = {
  circle: "rounded-full",
  rounded: "rounded-2xl",
  square: "rounded-none",
};

const AVATAR_RING = {
  none: "",
  light: "ring-4 ring-white/90",
  accent: "ring-4 ring-emerald-200",
  gradient: "ring-4 ring-fuchsia-200",
};

const COVER_HEIGHT = {
  sm: "h-24 sm:h-32",
  md: "h-32 sm:h-44",
  lg: "h-44 sm:h-56",
};

const TONE_CLASS = {
  light: {
    section: "bg-white text-zinc-950",
    card: "border border-zinc-200 bg-white",
    muted: "text-zinc-500",
    chip: "border border-zinc-200 bg-zinc-50 text-zinc-700",
    stat: "border-zinc-200 bg-zinc-50/60",
    link: "border-zinc-200 bg-white hover:border-zinc-300",
  },
  soft: {
    section: "bg-zinc-50 text-zinc-950",
    card: "border border-zinc-200 bg-white",
    muted: "text-zinc-500",
    chip: "border border-zinc-200 bg-white text-zinc-700",
    stat: "border-zinc-200 bg-white",
    link: "border-zinc-200 bg-white hover:border-zinc-300",
  },
  dark: {
    section: "bg-zinc-950 text-white",
    card: "border border-white/10 bg-zinc-900",
    muted: "text-zinc-400",
    chip: "border border-white/10 bg-white/[0.04] text-zinc-200",
    stat: "border-white/10 bg-white/[0.04]",
    link: "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
  },
  accent: {
    section: "bg-indigo-950 text-white",
    card: "border border-white/10 bg-indigo-900/40",
    muted: "text-indigo-100/70",
    chip: "border border-white/10 bg-white/[0.06] text-indigo-100",
    stat: "border-white/10 bg-white/[0.04]",
    link: "border-white/10 bg-white/[0.05] hover:bg-white/[0.1]",
  },
  gradient: {
    section: "bg-gradient-to-br from-fuchsia-100 via-white to-cyan-100 text-zinc-950",
    card: "border border-white/60 bg-white/80 backdrop-blur",
    muted: "text-zinc-600",
    chip: "border border-white/60 bg-white/80 text-zinc-800",
    stat: "border-white/70 bg-white/70",
    link: "border-white/60 bg-white/80 hover:bg-white",
  },
};

const BADGE_TONE = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
  neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
  accent: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function defaultSocialLabel(platform: BioProfileSocial["platform"]) {
  const map: Record<BioProfileSocial["platform"], string> = {
    website: "Website",
    email: "Email",
    instagram: "Instagram",
    twitter: "Twitter",
    x: "X",
    facebook: "Facebook",
    youtube: "YouTube",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    github: "GitHub",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    discord: "Discord",
    spotify: "Spotify",
    dribbble: "Dribbble",
    behance: "Behance",
    twitch: "Twitch",
    custom: "Link",
  };
  return map[platform];
}

function linkTargetProps(openInNewTab = true, noFollow = false) {
  const rel = [
    openInNewTab ? "noopener noreferrer" : "",
    noFollow ? "nofollow" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    target: openInNewTab ? "_blank" : undefined,
    rel: rel || undefined,
  };
}

function SocialLinks({
  socials,
  toneClass,
  style,
}: {
  socials: BioProfileSocial[];
  toneClass: (typeof TONE_CLASS)["light"];
  style: NonNullable<BioProfileData["socialStyle"]>;
}) {
  if (!socials?.length) return null;

  if (style === "buttons") {
    return (
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {socials.map((s, i) => {
          const Icon = SOCIAL_ICONS[s.platform] ?? ExternalLink;
          return (
            <Link
              key={`${s.platform}-${i}`}
              href={s.href || "#"}
              {...linkTargetProps(s.openInNewTab ?? true, s.noFollow ?? false)}
              aria-label={s.ariaLabel || s.label || defaultSocialLabel(s.platform)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-medium transition",
                toneClass.chip
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {s.label || defaultSocialLabel(s.platform)}
            </Link>
          );
        })}
      </div>
    );
  }

  if (style === "chips") {
    return (
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {socials.map((s, i) => {
          const Icon = SOCIAL_ICONS[s.platform] ?? ExternalLink;
          return (
            <Link
              key={`${s.platform}-${i}`}
              href={s.href || "#"}
              {...linkTargetProps(s.openInNewTab ?? true, s.noFollow ?? false)}
              aria-label={s.ariaLabel || s.label || defaultSocialLabel(s.platform)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition",
                toneClass.chip
              )}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {defaultSocialLabel(s.platform)}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {socials.map((s, i) => {
        const Icon = SOCIAL_ICONS[s.platform] ?? ExternalLink;
        return (
          <Link
            key={`${s.platform}-${i}`}
            href={s.href || "#"}
            {...linkTargetProps(s.openInNewTab ?? true, s.noFollow ?? false)}
            aria-label={s.ariaLabel || s.label || defaultSocialLabel(s.platform)}
            title={s.label || defaultSocialLabel(s.platform)}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full transition",
              toneClass.chip
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}

function LinkList({
  links,
  toneClass,
  tone,
  layout,
  style,
  showDescriptions,
  showMeta,
  showBadges,
  showThumbnails,
}: {
  links: BioProfileLink[];
  toneClass: (typeof TONE_CLASS)["light"];
  tone: NonNullable<BioProfileData["tone"]>;
  layout: NonNullable<BioProfileData["linkLayout"]>;
  style: NonNullable<BioProfileData["linkStyle"]>;
  showDescriptions: boolean;
  showMeta: boolean;
  showBadges: boolean;
  showThumbnails: boolean;
}) {
  if (!links?.length) return null;

  return (
    <div
      className={cn(
        "mt-6 grid gap-2.5",
        layout === "cards" && "sm:grid-cols-2",
        layout === "compact" && "gap-2",
        layout === "featured" && "gap-3"
      )}
    >
      {links.map((link, i) => {
        const Icon = link.icon ? LINK_ICONS[link.icon] ?? Sparkles : null;
        const featured = layout === "featured" && i === 0;
        const surface =
          style === "solid"
            ? tone === "dark" || tone === "accent"
              ? "border-transparent bg-white text-zinc-950 hover:bg-white/90"
              : "border-transparent bg-zinc-950 text-white hover:bg-zinc-800"
            : style === "soft"
              ? toneClass.chip
              : style === "glass"
                ? tone === "dark" || tone === "accent"
                  ? "border-white/10 bg-white/[0.08] backdrop-blur hover:bg-white/[0.12]"
                  : "border-white/60 bg-white/70 backdrop-blur hover:bg-white"
                : toneClass.link;
        const openInNewTab = link.openInNewTab ?? true;
        const descriptionVisible =
          showDescriptions && layout !== "compact" && Boolean(link.description);
        const metaVisible = showMeta && Boolean(link.meta);
        return (
          <Link
            key={`${link.label}-${i}`}
            href={link.href || "#"}
            {...linkTargetProps(openInNewTab, link.noFollow ?? false)}
            aria-label={link.ariaLabel || link.label}
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
              surface,
              layout === "cards" && "min-h-[124px] items-start",
              layout === "compact" && "rounded-lg px-3 py-2.5",
              featured && "rounded-2xl px-5 py-4 sm:py-5",
              link.highlighted && "ring-2 ring-offset-2 ring-offset-transparent ring-current"
            )}
          >
            {showThumbnails && link.thumbnail ? (
              <BlockImage
                sizes={"56px"}
                src={link.thumbnail}
                alt=""
                className={cn(
                  "shrink-0 rounded-lg object-cover",
                  featured ? "h-14 w-14" : "h-10 w-10",
                  layout === "compact" && "h-8 w-8"
                )}
              />
            ) : Icon ? (
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-lg",
                  featured ? "h-12 w-12" : "h-10 w-10",
                  layout === "compact" && "h-8 w-8",
                  toneClass.chip
                )}
              >
                <Icon className={cn(featured ? "h-5 w-5" : "h-4 w-4")} aria-hidden="true" />
              </span>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("truncate font-semibold", featured ? "text-base" : "text-sm")}>
                  {link.label}
                </span>
                {showBadges && link.badge ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      toneClass.chip
                    )}
                  >
                    {link.badge}
                  </span>
                ) : null}
              </div>
              {descriptionVisible ? (
                <p className={cn("mt-0.5 truncate text-xs", toneClass.muted)}>
                  {link.description}
                </p>
              ) : null}
              {metaVisible ? (
                <p className={cn("mt-1 text-[11px] font-medium uppercase tracking-wider", toneClass.muted)}>
                  {link.meta}
                </p>
              ) : null}
            </div>

            {openInNewTab ? (
              <ArrowUpRight
                className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                aria-hidden="true"
              />
            ) : (
              <ArrowRight
                className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}

function Stats({
  stats,
  toneClass,
}: {
  stats: BioProfileData["stats"];
  toneClass: (typeof TONE_CLASS)["light"];
}) {
  if (!stats?.length) return null;
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {stats.slice(0, 4).map((s, i) => (
        <div
          key={`${s.label}-${i}`}
          className={cn("rounded-xl border px-3 py-2.5 text-center", toneClass.stat)}
        >
          <p className="text-sm font-bold leading-tight">{s.value}</p>
          <p className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-wider", toneClass.muted)}>
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BioProfileBlock({ data }: { data: BioProfileData }) {
  const tone = data.tone ?? "light";
  const layout = data.layout ?? "card";
  const width = data.width ?? "narrow";
  const align = data.align ?? "center";
  const avatarSize = data.avatarSize ?? "lg";
  const avatarShape = data.avatarShape ?? "circle";
  const avatarRing = data.avatarRing ?? "light";
  const coverHeight = data.coverHeight ?? "md";
  const profileFrame = data.profileFrame ?? "card";
  const socialStyle = data.socialStyle ?? "icons";
  const socialPlacement = data.socialPlacement ?? "underBio";
  const linkLayout = data.linkLayout ?? "list";
  const linkStyle = data.linkStyle ?? "outline";
  const showCover = (data.showCover ?? false) && Boolean(data.coverUrl);
  const showStats = (data.showStats ?? true) && (data.stats?.length ?? 0) > 0;
  const showSocials = (data.showSocials ?? true) && (data.socials?.length ?? 0) > 0;
  const showLinks = (data.showLinks ?? true) && (data.links?.length ?? 0) > 0;
  const showBadge = (data.showBadge ?? true) && Boolean(data.badge);
  const showLocation = (data.showLocation ?? true) && Boolean(data.location);
  const showPronouns = (data.showPronouns ?? true) && Boolean(data.pronouns);
  const showPrimaryActions =
    (data.showPrimaryActions ?? true) && Boolean(data.primaryLabel || data.secondaryLabel);
  const buttonStyle = data.buttonStyle ?? "solid";
  const compact = data.compact ?? false;
  const isLinktree = layout === "linktree";
  const isSplit = layout === "split";
  const isBanner = layout === "banner";
  const isMinimal = layout === "minimal";
  const centered = align === "center" && !isSplit;
  const toneClass = TONE_CLASS[tone];
  const frameClass =
    profileFrame === "flat"
      ? "bg-transparent"
      : profileFrame === "glass"
        ? tone === "dark" || tone === "accent"
          ? "border border-white/10 bg-white/[0.06] shadow-sm backdrop-blur-xl"
          : "border border-white/70 bg-white/70 shadow-sm backdrop-blur-xl"
        : profileFrame === "bordered"
          ? tone === "dark" || tone === "accent"
            ? "border border-white/15 bg-transparent"
            : "border border-zinc-200 bg-transparent"
          : toneClass.card;

  const heading = (
    <div className={cn(centered && "text-center")}>
      {data.eyebrow ? (
        <p className={cn("text-[11px] font-semibold uppercase tracking-widest", toneClass.muted)}>
          {data.eyebrow}
        </p>
      ) : null}
      <div className={cn("flex items-center gap-2", centered && "justify-center")}>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{data.name}</h2>
        {data.verified ? (
          <BadgeCheck className="h-5 w-5 text-sky-500" aria-hidden="true" />
        ) : null}
      </div>
      {data.title ? (
        <p className={cn("mt-0.5 text-sm", toneClass.muted)}>{data.title}</p>
      ) : null}
      {(showLocation || showPronouns) ? (
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-2 text-xs",
            toneClass.muted,
            centered && "justify-center"
          )}
        >
          {showLocation ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {data.location}
            </span>
          ) : null}
          {showLocation && showPronouns ? <span>•</span> : null}
          {showPronouns ? (
            <span className="inline-flex items-center gap-1">
              <User2 className="h-3 w-3" aria-hidden="true" />
              {data.pronouns}
            </span>
          ) : null}
        </div>
      ) : null}
      {showBadge ? (
        <span
          className={cn(
            "mt-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            BADGE_TONE[data.badgeTone ?? "success"]
          )}
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {data.badge}
        </span>
      ) : null}
      {data.tagline ? (
        <p className="mt-3 text-base font-medium">{data.tagline}</p>
      ) : null}
      {data.bio ? (
        <p
          className={cn(
            "mt-2 text-sm leading-relaxed",
            centered && "mx-auto max-w-md",
            toneClass.muted
          )}
        >
          {data.bio}
        </p>
      ) : null}
    </div>
  );

  const avatar = (
    <div className={cn("relative inline-flex shrink-0", centered && "justify-self-center")}>
      <div
        className={cn(
          "overflow-hidden border-4 shadow-sm",
          AVATAR_SIZE[avatarSize],
          AVATAR_SHAPE[avatarShape],
          AVATAR_RING[avatarRing],
          tone === "dark" || tone === "accent" ? "border-zinc-900" : "border-white"
        )}
      >
        {data.avatarUrl ? (
          <BlockImage
            sizes={"128px"}
            src={data.avatarUrl}
            alt={data.avatarAlt || data.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center font-bold",
              tone === "dark" || tone === "accent"
                ? "bg-white/10 text-white"
                : "bg-zinc-100 text-zinc-600"
            )}
          >
            {getInitials(data.name)}
          </div>
        )}
      </div>
      {data.verified ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-sky-500 text-white",
            tone === "dark" || tone === "accent" ? "border-zinc-900" : "border-white"
          )}
          aria-label="Verified"
        >
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );

  const actions = (
    <div className={cn("mt-5 flex flex-wrap gap-2", centered && "justify-center")}>
      {data.primaryLabel ? (
        <Link
          href={data.primaryHref || "#"}
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition",
            buttonStyle === "outline"
              ? cn(
                  "border-current bg-transparent",
                  tone === "dark" || tone === "accent" ? "text-white" : "text-zinc-900"
                )
              : buttonStyle === "soft"
                ? cn("border-transparent", toneClass.chip)
                : "border-transparent text-white"
          )}
          style={
            buttonStyle === "solid"
              ? { backgroundColor: "var(--bd-accent, #18181b)" }
              : undefined
          }
        >
          {data.primaryLabel}
        </Link>
      ) : null}
      {data.secondaryLabel ? (
        <Link
          href={data.secondaryHref || "#"}
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition",
            tone === "dark" || tone === "accent"
              ? "border-white/20 text-white hover:bg-white/10"
              : "border-zinc-200 text-zinc-900 hover:bg-zinc-50"
          )}
        >
          {data.secondaryLabel}
        </Link>
      ) : null}
    </div>
  );

  const socialNode = showSocials ? (
    <SocialLinks socials={data.socials ?? []} toneClass={toneClass} style={socialStyle} />
  ) : null;

  return (
    <section className={cn("px-6 py-12 md:px-10", toneClass.section)}>
      <div className={cn("mx-auto", WIDTH_CLASS[width])}>
        <div
          className={cn(
            "relative overflow-hidden",
            !isLinktree && (isMinimal ? "bg-transparent" : frameClass),
            !isLinktree && !isMinimal && profileFrame !== "flat" && "rounded-3xl",
            !isLinktree && !isMinimal && profileFrame === "card" && "shadow-sm",
            isLinktree && "rounded-3xl",
            compact ? "p-5 sm:p-6" : "p-6 sm:p-8"
          )}
        >
          {showCover ? (
            <div className={cn("-mx-6 -mt-6 mb-6 overflow-hidden sm:-mx-8 sm:-mt-8", COVER_HEIGHT[coverHeight])}>
              <BlockImage
                sizes={"100vw"}
                src={data.coverUrl}
                alt={data.coverAlt || ""}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          {isSplit ? (
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
              {avatar}
              <div>
                {socialPlacement === "top" ? socialNode : null}
                {heading}
                {showPrimaryActions ? actions : null}
              </div>
            </div>
          ) : isBanner ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
              {avatar}
              <div className="flex-1 text-center sm:text-left">
                {socialPlacement === "top" ? socialNode : null}
                {heading}
              </div>
              {showPrimaryActions ? <div className="shrink-0">{actions}</div> : null}
            </div>
          ) : (
            <div className={cn(centered && "flex flex-col items-center")}>
              {avatar}
              {socialPlacement === "top" ? socialNode : null}
              <div className="mt-5 w-full">{heading}</div>
              {showPrimaryActions ? actions : null}
            </div>
          )}

          {showStats ? <Stats stats={data.stats ?? []} toneClass={toneClass} /> : null}
          {socialPlacement === "underBio" ? socialNode : null}
          {showLinks ? (
            <LinkList
              links={data.links ?? []}
              toneClass={toneClass}
              tone={tone}
              layout={linkLayout}
              style={linkStyle}
              showDescriptions={data.showLinkDescriptions ?? true}
              showMeta={data.showLinkMeta ?? true}
              showBadges={data.showLinkBadges ?? true}
              showThumbnails={data.showLinkThumbnails ?? true}
            />
          ) : null}
          {socialPlacement === "bottom" ? socialNode : null}
        </div>
      </div>
    </section>
  );
}
