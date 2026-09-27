"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type ShellState = {
  /** Desktop sidebar folded away; the header then shows the open button. */
  collapsed: boolean;
  mobileOpen: boolean;
  /** Collapse on desktop, close the drawer on mobile. */
  hideSidebar: () => void;
  /** Expand on desktop, open the drawer on mobile. */
  showSidebar: () => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function useDashboardShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useDashboardShell must be used inside <DashboardShell>");
  return ctx;
}

const STORAGE_KEY = "dashboard:sidebar";
const DESKTOP = "(min-width: 1024px)";

/**
 * The dashboard frame: a grey canvas with the sidebar on the left and the page
 * on a white panel. On desktop the sidebar folds to nothing; below `lg` it is a
 * drawer over a blurred backdrop.
 *
 * `inert` keeps a hidden sidebar out of the tab order — without it keyboard
 * focus walks through links nobody can see.
 */
export function DashboardShell({
  sidebar,
  header,
  children,
}: {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "collapsed");
    } catch {
      // Storage blocked: the sidebar simply starts open.
    }
  }, []);

  // A link inside the drawer navigates; the drawer should not stay over the page.
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const persist = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "collapsed" : "expanded");
    } catch {
      // Not remembered across reloads; nothing else depends on it.
    }
  };

  const isDesktop = () => window.matchMedia(DESKTOP).matches;
  const hideSidebar = useCallback(() => {
    if (isDesktop()) persist(true);
    else setMobileOpen(false);
  }, []);
  const showSidebar = useCallback(() => {
    if (isDesktop()) persist(false);
    else setMobileOpen(true);
  }, []);

  return (
    <ShellContext.Provider value={{ collapsed, mobileOpen, hideSidebar, showSidebar }}>
      {/* overflow-x-clip, not -hidden: "hidden" makes a scroll container and
          breaks the sidebar's sticky positioning. */}
      <div className="kv-app flex min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-kv-bg text-kv-fg">
        <div
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 overflow-hidden transition-[width] duration-300 ease-out-expo lg:block",
            collapsed ? "w-0" : "w-[250px]"
          )}
          {...inertWhen(collapsed)}
        >
          <div className={cn("h-full transition-opacity duration-200", collapsed && "opacity-0")}>
            {sidebar}
          </div>
        </div>

        <div
          className={cn(
            "fixed inset-0 z-40 lg:hidden",
            mobileOpen ? "pointer-events-auto" : "pointer-events-none"
          )}
          aria-hidden={!mobileOpen}
        >
          <div
            className={cn(
              "absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300",
              mobileOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => setMobileOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigasi"
            className={cn(
              "absolute inset-y-0 left-0 h-dvh bg-kv-bg pb-[env(safe-area-inset-bottom)] transition-[transform,box-shadow] duration-300 ease-out-expo",
              // The shadow reaches ~100px past the edge; off-canvas it would
              // still paint a grey band down the left of the page.
              mobileOpen ? "translate-x-0 shadow-kv-drawer" : "-translate-x-full shadow-none"
            )}
            {...inertWhen(!mobileOpen)}
          >
            {sidebar}
          </div>
        </div>

        <main className="kv-fields flex min-w-0 flex-1 flex-col bg-kv-card px-[8px] sm:px-[12px] shadow-[inset_0_0_0_0.8px_rgb(var(--kv-border))] lg:min-h-dvh">
          {header}
          <div className="flex w-full min-w-0 max-w-full flex-col px-[4px] pb-[16px] pt-[4px]">
            {children}
          </div>
        </main>
      </div>
    </ShellContext.Provider>
  );
}

/**
 * React 18 does not know `inert`: a boolean is dropped with a warning, while
 * an empty string reaches the DOM as the attribute. The newer DOM typings want
 * a boolean, hence the cast.
 */
function inertWhen(on: boolean) {
  return (on ? { inert: "" } : {}) as React.HTMLAttributes<HTMLDivElement>;
}
