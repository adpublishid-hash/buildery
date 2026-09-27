"use client";

import type {
  BioProfileData,
  BioProfileSocial,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
  BIO_LINK_ICON_OPTIONS,
  BIO_SOCIAL_OPTIONS,
  BioAvatarField,
} from "./shared";

export function BioProfileForm({
  data,
  onChange,
}: {
  data: BioProfileData;
  onChange: (d: BioProfileData) => void;
}) {
  const set = (patch: Partial<BioProfileData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "card"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "card", label: "Card" },
            { value: "centered", label: "Centered" },
            { value: "linktree", label: "Link tree" },
            { value: "banner", label: "Banner" },
            { value: "split", label: "Split" },
            { value: "minimal", label: "Minimal" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "light"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "light", label: "Light" },
            { value: "soft", label: "Soft" },
            { value: "dark", label: "Dark" },
            { value: "accent", label: "Accent" },
            { value: "gradient", label: "Gradient" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Width"
          value={data.width ?? "narrow"}
          onChange={(v) => set({ width: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
        />
        <ChoiceField
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={ALIGN_OPTIONS as never}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Avatar shape"
          value={data.avatarShape ?? "circle"}
          onChange={(v) => set({ avatarShape: v })}
          options={[
            { value: "circle", label: "Circle" },
            { value: "rounded", label: "Rounded" },
            { value: "square", label: "Square" },
          ]}
        />
        <ChoiceField
          label="Avatar size"
          value={data.avatarSize ?? "lg"}
          onChange={(v) => set({ avatarSize: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
            { value: "xl", label: "Extra large" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Button style"
          value={data.buttonStyle ?? "solid"}
          onChange={(v) => set({ buttonStyle: v })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "soft", label: "Soft" },
            { value: "outline", label: "Outline" },
          ]}
        />
        <ChoiceField
          label="Social style"
          value={data.socialStyle ?? "icons"}
          onChange={(v) => set({ socialStyle: v })}
          options={[
            { value: "icons", label: "Icons" },
            { value: "buttons", label: "Buttons" },
            { value: "chips", label: "Chips" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Avatar ring"
          value={data.avatarRing ?? "light"}
          onChange={(v) => set({ avatarRing: v })}
          options={[
            { value: "none", label: "None" },
            { value: "light", label: "Light" },
            { value: "accent", label: "Accent" },
            { value: "gradient", label: "Gradient" },
          ]}
        />
        <ChoiceField
          label="Cover height"
          value={data.coverHeight ?? "md"}
          onChange={(v) => set({ coverHeight: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Profile frame"
          value={data.profileFrame ?? "card"}
          onChange={(v) => set({ profileFrame: v })}
          options={[
            { value: "card", label: "Card" },
            { value: "flat", label: "Flat" },
            { value: "glass", label: "Glass" },
            { value: "bordered", label: "Bordered" },
          ]}
        />
        <ChoiceField
          label="Social position"
          value={data.socialPlacement ?? "underBio"}
          onChange={(v) => set({ socialPlacement: v })}
          options={[
            { value: "underBio", label: "Under bio" },
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Link layout"
          value={data.linkLayout ?? "list"}
          onChange={(v) => set({ linkLayout: v })}
          options={[
            { value: "list", label: "List" },
            { value: "cards", label: "Cards" },
            { value: "compact", label: "Compact" },
            { value: "featured", label: "Featured" },
          ]}
        />
        <ChoiceField
          label="Link style"
          value={data.linkStyle ?? "outline"}
          onChange={(v) => set({ linkStyle: v })}
          options={[
            { value: "outline", label: "Outline" },
            { value: "solid", label: "Solid" },
            { value: "soft", label: "Soft" },
            { value: "glass", label: "Glass" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Name" value={data.name} onChange={(v) => set({ name: v })} />
        <TextField label="Title / Role" value={data.title} onChange={(v) => set({ title: v })} />
      </div>
      <TextField label="Tagline" value={data.tagline ?? ""} onChange={(v) => set({ tagline: v })} placeholder="One-line headline" />
      <AreaField label="Bio" value={data.bio} onChange={(v) => set({ bio: v })} rows={3} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Location" value={data.location ?? ""} onChange={(v) => set({ location: v })} placeholder="Optional" />
        <TextField label="Pronouns" value={data.pronouns ?? ""} onChange={(v) => set({ pronouns: v })} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Status badge" value={data.badge ?? ""} onChange={(v) => set({ badge: v })} placeholder="e.g. Available" />
        <ChoiceField
          label="Badge tone"
          value={data.badgeTone ?? "success"}
          onChange={(v) => set({ badgeTone: v })}
          options={[
            { value: "success", label: "Success" },
            { value: "warning", label: "Warning" },
            { value: "info", label: "Info" },
            { value: "neutral", label: "Neutral" },
            { value: "accent", label: "Accent" },
          ]}
        />
      </div>
      <BioAvatarField value={data.avatarUrl ?? ""} onChange={(v) => set({ avatarUrl: v })} />
      <TextField label="Avatar alt" value={data.avatarAlt ?? ""} onChange={(v) => set({ avatarAlt: v })} placeholder="Optional" />
      <TextField label="Cover image URL" value={data.coverUrl ?? ""} onChange={(v) => set({ coverUrl: v })} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Primary button" value={data.primaryLabel ?? ""} onChange={(v) => set({ primaryLabel: v })} placeholder="Optional" />
        <TextField label="Primary link" value={data.primaryHref ?? ""} onChange={(v) => set({ primaryHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Secondary button" value={data.secondaryLabel ?? ""} onChange={(v) => set({ secondaryLabel: v })} placeholder="Optional" />
        <TextField label="Secondary link" value={data.secondaryHref ?? ""} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Show cover" checked={data.showCover ?? false} onChange={(v) => set({ showCover: v })} />
        <ToggleField label="Verified" checked={data.verified ?? false} onChange={(v) => set({ verified: v })} />
        <ToggleField label="Show badge" checked={data.showBadge ?? true} onChange={(v) => set({ showBadge: v })} />
        <ToggleField label="Show location" checked={data.showLocation ?? true} onChange={(v) => set({ showLocation: v })} />
        <ToggleField label="Show pronouns" checked={data.showPronouns ?? true} onChange={(v) => set({ showPronouns: v })} />
        <ToggleField label="Show buttons" checked={data.showPrimaryActions ?? true} onChange={(v) => set({ showPrimaryActions: v })} />
        <ToggleField label="Show stats" checked={data.showStats ?? true} onChange={(v) => set({ showStats: v })} />
        <ToggleField label="Show socials" checked={data.showSocials ?? true} onChange={(v) => set({ showSocials: v })} />
        <ToggleField label="Show links" checked={data.showLinks ?? true} onChange={(v) => set({ showLinks: v })} />
        <ToggleField label="Link descriptions" checked={data.showLinkDescriptions ?? true} onChange={(v) => set({ showLinkDescriptions: v })} />
        <ToggleField label="Link meta" checked={data.showLinkMeta ?? true} onChange={(v) => set({ showLinkMeta: v })} />
        <ToggleField label="Link badges" checked={data.showLinkBadges ?? true} onChange={(v) => set({ showLinkBadges: v })} />
        <ToggleField label="Link thumbnails" checked={data.showLinkThumbnails ?? true} onChange={(v) => set({ showLinkThumbnails: v })} />
        <ToggleField label="Compact" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
      </div>
      <Repeatable
        label="Stats"
        items={data.stats ?? []}
        onChange={(stats) => set({ stats })}
        min={0}
        addLabel="Add stat"
        makeNew={() => ({ value: "100", label: "Members" })}
        renderItem={(stat, patch) => (
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Value" value={stat.value} onChange={(v) => patch({ ...stat, value: v })} />
            <TextField label="Label" value={stat.label} onChange={(v) => patch({ ...stat, label: v })} />
          </div>
        )}
      />
      <Repeatable
        label="Socials"
        items={data.socials ?? []}
        onChange={(socials) => set({ socials })}
        min={0}
        addLabel="Add social"
        makeNew={(): BioProfileSocial => ({
          platform: "instagram",
          label: "",
          href: "#",
          ariaLabel: "",
          openInNewTab: true,
          noFollow: false,
        })}
        renderItem={(social, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceField
                label="Platform"
                value={social.platform}
                onChange={(v) => patch({ ...social, platform: v })}
                options={BIO_SOCIAL_OPTIONS as never}
              />
              <TextField
                label="Custom label"
                value={social.label}
                onChange={(v) => patch({ ...social, label: v })}
                placeholder="Optional"
              />
            </div>
            <TextField label="URL" value={social.href} onChange={(v) => patch({ ...social, href: v })} />
            <TextField
              label="ARIA label"
              value={social.ariaLabel ?? ""}
              onChange={(v) => patch({ ...social, ariaLabel: v })}
              placeholder="Optional screen reader label"
            />
            <div className="grid grid-cols-2 gap-2">
              <ToggleField
                label="New tab"
                checked={social.openInNewTab ?? true}
                onChange={(v) => patch({ ...social, openInNewTab: v })}
              />
              <ToggleField
                label="No follow"
                checked={social.noFollow ?? false}
                onChange={(v) => patch({ ...social, noFollow: v })}
              />
            </div>
          </>
        )}
      />
      <Repeatable
        label="Links"
        items={data.links ?? []}
        onChange={(links) => set({ links })}
        min={0}
        addLabel="Add link"
        makeNew={() => ({
          label: "New link",
          description: "",
          meta: "",
          href: "#",
          icon: "sparkles",
          thumbnail: "",
          badge: "",
          ariaLabel: "",
          highlighted: false,
          openInNewTab: true,
          noFollow: false,
        })}
        renderItem={(link, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Label" value={link.label} onChange={(v) => patch({ ...link, label: v })} />
              <TextField label="Link" value={link.href} onChange={(v) => patch({ ...link, href: v })} />
            </div>
            <TextField
              label="Description"
              value={link.description ?? ""}
              onChange={(v) => patch({ ...link, description: v })}
              placeholder="Optional"
            />
            <TextField
              label="Meta"
              value={link.meta ?? ""}
              onChange={(v) => patch({ ...link, meta: v })}
              placeholder="e.g. 5 min read, Free, New"
            />
            <div className="grid grid-cols-2 gap-2">
              <ChoiceField
                label="Icon"
                value={link.icon ?? ""}
                onChange={(v) => patch({ ...link, icon: v })}
                options={BIO_LINK_ICON_OPTIONS}
              />
              <TextField label="Badge" value={link.badge ?? ""} onChange={(v) => patch({ ...link, badge: v })} placeholder="Optional" />
            </div>
            <TextField
              label="Thumbnail URL"
              value={link.thumbnail ?? ""}
              onChange={(v) => patch({ ...link, thumbnail: v })}
              placeholder="Optional image overrides icon"
            />
            <TextField
              label="ARIA label"
              value={link.ariaLabel ?? ""}
              onChange={(v) => patch({ ...link, ariaLabel: v })}
              placeholder="Optional screen reader label"
            />
            <div className="grid grid-cols-2 gap-2">
              <ToggleField label="New tab" checked={link.openInNewTab ?? true} onChange={(v) => patch({ ...link, openInNewTab: v })} />
              <ToggleField label="No follow" checked={link.noFollow ?? false} onChange={(v) => patch({ ...link, noFollow: v })} />
              <ToggleField label="Highlight" checked={link.highlighted ?? false} onChange={(v) => patch({ ...link, highlighted: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
