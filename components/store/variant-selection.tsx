"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Shares the chosen variant between the gallery and the buy panel.
 *
 * They sit in different columns of the product page, so neither can own the
 * state. A context is the smallest thing that lets the photo follow the
 * choice without restructuring the whole page into one client component.
 */

type VariantSelection = {
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Photo of the chosen variant, when it has one of its own. */
  selectedImageUrl: string | null;
};

const VariantSelectionContext = createContext<VariantSelection>({
  selectedId: null,
  select: () => {},
  selectedImageUrl: null,
});

export function VariantSelectionProvider({
  imageByVariantId,
  initialSelectedId = null,
  children,
}: {
  imageByVariantId: Record<string, string | null>;
  initialSelectedId?: string | null;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId
  );

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    // Put the choice in the address bar so the page can be shared, bookmarked
    // or reloaded on the variant the shopper is actually looking at — the page
    // already reads `?variant=` on the way in. history.replaceState rather
    // than the router: this needs no round trip and no re-render.
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("variant", id);
    else url.searchParams.delete("variant");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const value = useMemo<VariantSelection>(
    () => ({
      selectedId,
      select,
      selectedImageUrl: selectedId ? (imageByVariantId[selectedId] ?? null) : null,
    }),
    [selectedId, select, imageByVariantId]
  );

  return (
    <VariantSelectionContext.Provider value={value}>
      {children}
    </VariantSelectionContext.Provider>
  );
}

export function useVariantSelection() {
  return useContext(VariantSelectionContext);
}
