"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import {
  Extension,
  ReactRenderer,
  type Editor,
  type Range,
} from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import {
  Code2,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
} from "lucide-react";

import { cn } from "@/lib/utils";

type SlashItem = {
  title: string;
  description: string;
  keywords: string[];
  icon: ReactNode;
  run: (props: { editor: Editor; range: Range }) => void;
};

type SlashMenuRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

function buildItems(onImage: () => void): SlashItem[] {
  return [
    {
      title: "Text",
      description: "Plain paragraph",
      keywords: ["paragraph", "body"],
      icon: <Pilcrow className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      title: "Heading 2",
      description: "Section heading",
      keywords: ["h2", "title", "large"],
      icon: <Heading2 className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleHeading({ level: 2 })
          .run(),
    },
    {
      title: "Heading 3",
      description: "Sub-section heading",
      keywords: ["h3", "subtitle", "small"],
      icon: <Heading3 className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleHeading({ level: 3 })
          .run(),
    },
    {
      title: "Bullet list",
      description: "Unordered list",
      keywords: ["ul", "unordered", "point"],
      icon: <List className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "Ordered list",
      keywords: ["ol", "ordered", "number"],
      icon: <ListOrdered className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: "Quote",
      description: "Highlighted block quote",
      keywords: ["blockquote", "cite"],
      icon: <Quote className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: "Code block",
      description: "Pre-formatted code",
      keywords: ["pre", "snippet", "monospace"],
      icon: <Code2 className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: "Divider",
      description: "Horizontal rule",
      keywords: ["hr", "separator", "line", "rule"],
      icon: <Minus className="h-4 w-4" />,
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: "Image",
      description: "Upload an image",
      keywords: ["picture", "photo", "media", "upload"],
      icon: <ImageIcon className="h-4 w-4" />,
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onImage();
      },
    },
  ];
}

const SlashMenuList = forwardRef<SlashMenuRef, SuggestionProps<SlashItem>>(
  function SlashMenuList(props, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [props.items]);

    function select(index: number) {
      const item = props.items[index];
      if (item) props.command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const count = props.items.length;
        if (!count) return false;
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + count - 1) % count);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % count);
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (!props.items.length) {
      return <div className="blog-slash-empty">No matching blocks</div>;
    }

    return (
      <div className="blog-slash-menu">
        {props.items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={cn(
              "blog-slash-item",
              index === selected && "is-active"
            )}
            onMouseEnter={() => setSelected(index)}
            onClick={() => select(index)}
          >
            <span className="blog-slash-icon">{item.icon}</span>
            <span className="blog-slash-text">
              <span className="blog-slash-title">{item.title}</span>
              <span className="blog-slash-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }
);

function positionPopup(popup: HTMLElement, props: SuggestionProps<SlashItem>) {
  const rect = props.clientRect?.();
  if (!rect) return;
  popup.style.position = "fixed";
  popup.style.zIndex = "60";
  popup.style.left = `${Math.round(rect.left)}px`;

  const spaceBelow = window.innerHeight - rect.bottom;
  const height = popup.offsetHeight || 280;
  if (spaceBelow < height + 16 && rect.top > height) {
    popup.style.top = `${Math.round(rect.top - height - 6)}px`;
  } else {
    popup.style.top = `${Math.round(rect.bottom + 6)}px`;
  }
}

function suggestion(
  onImage: () => void
): Omit<SuggestionOptions<SlashItem>, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    command: ({ editor, range, props }) => {
      props.run({ editor, range });
    },
    items: ({ query }) => {
      const search = query.toLowerCase().trim();
      const items = buildItems(onImage);
      if (!search) return items;
      return items.filter((item) =>
        [item.title, ...item.keywords].some((term) =>
          term.toLowerCase().includes(search)
        )
      );
    },
    render: () => {
      let renderer: ReactRenderer<SlashMenuRef, SuggestionProps<SlashItem>>;
      let popup: HTMLDivElement;

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(SlashMenuList, {
            props,
            editor: props.editor,
          });
          popup = document.createElement("div");
          popup.className = "blog-slash-popup";
          popup.appendChild(renderer.element);
          document.body.appendChild(popup);
          positionPopup(popup, props);
        },
        onUpdate: (props) => {
          renderer.updateProps(props);
          positionPopup(popup, props);
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup.remove();
            return true;
          }
          return renderer.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.remove();
          renderer?.destroy();
        },
      };
    },
  };
}

export type SlashCommandOptions = {
  onImage: () => void;
};

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      onImage: () => {},
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...suggestion(this.options.onImage),
      }),
    ];
  },
});
