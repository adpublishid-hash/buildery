"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function useFieldId(prefix: string) {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, "")}`;
}

const EMPTY_CHOICE_VALUE = "__buildery_empty_choice__";

function toSelectValue(value: string) {
  return value === "" ? EMPTY_CHOICE_VALUE : value;
}

function fromSelectValue(value: string) {
  return value === EMPTY_CHOICE_VALUE ? "" : value;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const id = useFieldId("tf");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
      {hint ? <p className="text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  placeholder = "#ffffff",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useFieldId("color");
  const safeValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex h-8 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <input
          type="color"
          value={safeValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-9 cursor-pointer border-0 bg-transparent p-1"
          aria-label={`${label} picker`}
        />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-full flex-1 rounded-none border-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const id = useFieldId("af");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
      />
    </div>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const id = useFieldId("cf");
  const selectValue = toSelectValue(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(fromSelectValue(v) as T)}
      >
        <SelectTrigger id={id} className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt, index) => {
            const itemValue = toSelectValue(opt.value);
            return (
              <SelectItem key={`${itemValue}-${index}`} value={itemValue}>
                {opt.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          aria-label={label}
        />
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-4 text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** A repeatable group of sub-items with add / remove controls. */
export function Repeatable<T>({
  label,
  items,
  onChange,
  makeNew,
  renderItem,
  addLabel = "Add item",
  min = 1,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  makeNew: () => T;
  renderItem: (item: T, patch: (next: T) => void, index: number) => React.ReactNode;
  addLabel?: string;
  min?: number;
}) {
  function patchAt(index: number, next: T) {
    onChange(items.map((it, i) => (i === index ? next : it)));
  }
  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {label.replace(/s$/, "")} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={items.length <= min}
                className="text-zinc-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {renderItem(item, (next) => patchAt(i, next), i)}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([...items, makeNew()])}
      >
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}
