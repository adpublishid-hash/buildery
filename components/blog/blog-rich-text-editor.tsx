"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Code2,
  Eraser,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { blogBodyToHtml } from "@/lib/rich-text";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";
import { SlashCommand } from "@/components/blog/editor-slash-command";

const SWATCHES = [
  "#18181b",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function BlogRichTextEditor({ value, onChange, disabled, compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Image.configure({
        HTMLAttributes: { class: "blog-editor-image" },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Heading"
            : "Write your story, or press “/” for blocks…",
      }),
      SlashCommand.configure({
        onImage: () => fileInputRef.current?.click(),
      }),
    ],
    content: normalizeContent(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "blog-tiptap-editor rounded-b-2xl border-t border-zinc-100 bg-white px-5 py-5 text-[15px] leading-8 text-zinc-800 outline-none sm:px-7",
          compact ? "min-h-64" : "min-h-[62vh]"
        ),
      },
    },
    onUpdate({ editor }) {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeContent(value);
    if (next !== editor.getHTML()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error("Unsupported image type.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("Image must be 5 MB or smaller.");
        return;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Image upload failed.");
          return;
        }
        editor
          .chain()
          .focus()
          .setImage({ src: json.url, alt: file.name })
          .run();
      } catch {
        toast.error("Image upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [editor]
  );

  if (!editor) {
    return (
      <div className="min-h-[62vh] rounded-2xl border border-zinc-200 bg-zinc-50" />
    );
  }

  function setLink() {
    const previous = editor?.getAttributes("link").href || "";
    const href = window.prompt("Link URL", previous);
    if (href === null) return;
    if (!href.trim()) {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="sticky top-[78px] z-10 flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-zinc-200 bg-zinc-50/95 p-2 backdrop-blur">
        <ToolButton
          title="Paragraph"
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          title="Bold (⌘B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Italic (⌘I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Underline (⌘U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </ToolButton>
        <ColorPicker editor={editor} />
        <ToolButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          title="Image"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </ToolButton>
        <ToolButton
          title="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          title="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <Eraser className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Undo (⌘Z)"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Redo (⌘⇧Z)"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </div>

      <BubbleMenu
        editor={editor}
        className="blog-bubble-menu"
        shouldShow={({ editor, from, to }) =>
          from !== to && !editor.isActive("image")
        }
      >
        <ToolButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolButton>
      </BubbleMenu>

      <EditorContent editor={editor} />

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadImage(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function normalizeContent(value: string) {
  return value?.trim() ? blogBodyToHtml(value) : "<p></p>";
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-zinc-200" />;
}

function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const activeColor = editor.getAttributes("textStyle").color as
    | string
    | undefined;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <span className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        title="Text color"
        aria-label="Text color"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white hover:text-zinc-950",
          (open || activeColor) && "bg-white text-zinc-950 shadow-sm"
        )}
      >
        <Palette
          className="h-4 w-4"
          style={activeColor ? { color: activeColor } : undefined}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 w-44 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`Set color ${color}`}
                onClick={() => {
                  editor.chain().focus().setColor(color).run();
                  setOpen(false);
                }}
                className="h-6 w-6 rounded-md border border-black/10 transition hover:scale-110"
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              title="Custom color"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-[10px] text-zinc-400"
            >
              +
              <input
                type="color"
                className="sr-only"
                onChange={(event) => {
                  editor.chain().focus().setColor(event.target.value).run();
                  setOpen(false);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().unsetColor().run();
              setOpen(false);
            }}
            className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-100"
          >
            Remove color
          </button>
        </div>
      )}
    </span>
  );
}

function ToolButton({
  active,
  children,
  disabled,
  onClick,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:pointer-events-none disabled:opacity-35",
        active && "bg-white text-zinc-950 shadow-sm"
      )}
    >
      {children}
    </button>
  );
}
