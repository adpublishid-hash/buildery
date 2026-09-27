"use client";

import type {
  ButtonData,
  ButtonItem,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
  ColorField,
} from "../fields";

import {
  BUTTON_ICON_OPTIONS,
} from "./shared";

export function ButtonForm({
  data,
  onChange,
}: {
  data: ButtonData;
  onChange: (d: ButtonData) => void;
}) {
  const set = (patch: Partial<ButtonData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "inline"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "inline", label: "Inline" },
            { value: "stacked", label: "Stacked" },
            { value: "grid", label: "Grid" },
            { value: "linktree", label: "Link tree" },
            { value: "split", label: "Split rows" },
            { value: "cards", label: "Cards" },
            { value: "social", label: "Social icons" },
            { value: "banner", label: "Banner" },
            { value: "toolbar", label: "Toolbar" },
          ]}
        />
        <ChoiceField
          label="Size"
          value={data.size ?? "md"}
          onChange={(v) => set({ size: v })}
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
          label="Shape"
          value={data.shape ?? "rounded"}
          onChange={(v) => set({ shape: v })}
          options={[
            { value: "rounded", label: "Rounded" },
            { value: "pill", label: "Pill" },
            { value: "square", label: "Square" },
          ]}
        />
        <ChoiceField
          label="Width"
          value={data.width ?? "wide"}
          onChange={(v) => set({ width: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Tone"
          value={data.tone ?? "plain"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "plain", label: "Plain" },
            { value: "soft", label: "Soft" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "accent", label: "Accent" },
          ]}
        />
        <ChoiceField
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Gap"
          value={data.gap ?? "normal"}
          onChange={(v) => set({ gap: v })}
          options={[
            { value: "tight", label: "Tight" },
            { value: "normal", label: "Normal" },
            { value: "loose", label: "Loose" },
          ]}
        />
        <ChoiceField
          label="Animation"
          value={data.animation ?? "none"}
          onChange={(v) => set({ animation: v })}
          options={[
            { value: "none", label: "None" },
            { value: "pulse", label: "Pulse" },
            { value: "shine", label: "Scale" },
            { value: "lift", label: "Lift" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Container"
          value={data.containerStyle ?? "plain"}
          onChange={(v) => set({ containerStyle: v })}
          options={[
            { value: "plain", label: "Plain" },
            { value: "panel", label: "Panel" },
            { value: "bordered", label: "Bordered" },
            { value: "glass", label: "Glass" },
          ]}
        />
        <ChoiceField
          label="Header placement"
          value={data.headerPlacement ?? "top"}
          onChange={(v) => set({ headerPlacement: v })}
          options={[
            { value: "top", label: "Top" },
            { value: "inline", label: "Inline" },
          ]}
        />
      </div>
      {data.layout === "grid" || data.layout === "cards" ? (
        <ChoiceField
          label="Grid columns"
          value={String(data.columns ?? 2)}
          onChange={(v) => set({ columns: (Number(v) as 1 | 2 | 3) })}
          options={[
            { value: "1", label: "1 column" },
            { value: "2", label: "2 columns" },
            { value: "3", label: "3 columns" },
          ]}
        />
      ) : null}
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading ?? ""} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Description" value={data.description ?? ""} onChange={(v) => set({ description: v })} rows={2} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Show icons" checked={data.showIcons ?? true} onChange={(v) => set({ showIcons: v })} />
        <ToggleField label="Descriptions" checked={data.showDescriptions ?? false} onChange={(v) => set({ showDescriptions: v })} />
        <ToggleField label="Meta text" checked={data.showMeta ?? false} onChange={(v) => set({ showMeta: v })} />
        <ToggleField label="Arrows" checked={data.showArrows ?? false} onChange={(v) => set({ showArrows: v })} />
        <ToggleField label="Shadow" checked={data.showShadow ?? true} onChange={(v) => set({ showShadow: v })} />
        <ToggleField label="Full width" checked={data.fullWidthButtons ?? false} onChange={(v) => set({ fullWidthButtons: v })} />
        <ToggleField label="Equal width" checked={data.equalWidth ?? false} onChange={(v) => set({ equalWidth: v })} />
        <ToggleField label="Mobile stack" checked={data.mobileStack ?? true} onChange={(v) => set({ mobileStack: v })} />
      </div>
      <Repeatable
        label="Buttons"
        items={data.items ?? []}
        onChange={(items) => set({ items })}
        addLabel="Add button"
        makeNew={(): ButtonItem => ({
          label: "New button",
          href: "#",
          icon: "",
          badge: "",
          description: "",
          meta: "",
          ariaLabel: "",
          variant: "solid",
          color: "accent",
          sizeOverride: "default",
          iconPosition: "left",
          customColor: "",
          customTextColor: "",
          openInNewTab: false,
          noFollow: false,
          highlighted: false,
        })}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Label" value={item.label} onChange={(v) => patch({ ...item, label: v })} />
              <TextField label="Link" value={item.href} onChange={(v) => patch({ ...item, href: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceField
                label="Variant"
                value={item.variant ?? "solid"}
                onChange={(v) => patch({ ...item, variant: v })}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "soft", label: "Soft" },
                  { value: "outline", label: "Outline" },
                  { value: "ghost", label: "Ghost" },
                  { value: "link", label: "Link" },
                  { value: "gradient", label: "Gradient" },
                  { value: "glass", label: "Glass" },
                ]}
              />
              <ChoiceField
                label="Color"
                value={item.color ?? "accent"}
                onChange={(v) => patch({ ...item, color: v })}
                options={[
                  { value: "accent", label: "Accent" },
                  { value: "neutral", label: "Neutral" },
                  { value: "primary", label: "Primary" },
                  { value: "success", label: "Success" },
                  { value: "warning", label: "Warning" },
                  { value: "danger", label: "Danger" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            </div>
            {item.color === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <ColorField label="Background" value={item.customColor ?? ""} onChange={(v) => patch({ ...item, customColor: v })} />
                <ColorField label="Text" value={item.customTextColor ?? ""} onChange={(v) => patch({ ...item, customTextColor: v })} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <ChoiceField
                label="Icon"
                value={item.icon ?? ""}
                onChange={(v) => patch({ ...item, icon: v })}
                options={BUTTON_ICON_OPTIONS}
              />
              <TextField label="Badge" value={item.badge ?? ""} onChange={(v) => patch({ ...item, badge: v })} placeholder="Optional" />
            </div>
            <TextField
              label="Description"
              value={item.description ?? ""}
              onChange={(v) => patch({ ...item, description: v })}
              placeholder="Optional helper text"
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Meta"
                value={item.meta ?? ""}
                onChange={(v) => patch({ ...item, meta: v })}
                placeholder="e.g. Free, PDF, 5 min"
              />
              <TextField
                label="ARIA label"
                value={item.ariaLabel ?? ""}
                onChange={(v) => patch({ ...item, ariaLabel: v })}
                placeholder="Optional accessibility label"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceField
                label="Size override"
                value={item.sizeOverride ?? "default"}
                onChange={(v) => patch({ ...item, sizeOverride: v })}
                options={[
                  { value: "default", label: "Use block size" },
                  { value: "sm", label: "Small" },
                  { value: "md", label: "Medium" },
                  { value: "lg", label: "Large" },
                  { value: "xl", label: "Extra large" },
                ]}
              />
              <ChoiceField
                label="Icon position"
                value={item.iconPosition ?? "left"}
                onChange={(v) => patch({ ...item, iconPosition: v })}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ToggleField label="New tab" checked={item.openInNewTab ?? false} onChange={(v) => patch({ ...item, openInNewTab: v })} />
              <ToggleField label="No follow" checked={item.noFollow ?? false} onChange={(v) => patch({ ...item, noFollow: v })} />
              <ToggleField label="Highlight" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
            </div>
          </>
        )}
      />
      <TextField label="Footnote" value={data.footnote ?? ""} onChange={(v) => set({ footnote: v })} placeholder="Optional small text below buttons" />
    </>
  );
}



