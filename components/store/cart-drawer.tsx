"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Loader2,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";

import {
  getCartSnapshotAction,
  removeCartItemAction,
  updateCartItemAction,
  type CartDrawerLine,
  type CartDrawerSnapshot,
} from "@/lib/actions/cart";
import { cn, formatPrice } from "@/lib/utils";

type CartDrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  refresh: () => void;
};

const CartDrawerContext = createContext<CartDrawerContextValue | null>(null);

/** Exposed to client components anywhere under the storefront layout. */
export function useCartDrawer(): CartDrawerContextValue {
  const ctx = useContext(CartDrawerContext);
  if (!ctx) {
    // Outside the storefront layout (e.g. dashboard) — no-op so consumers
    // can be called safely.
    return { isOpen: false, open: () => {}, close: () => {}, refresh: () => {} };
  }
  return ctx;
}

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  /** Pre-resolved URL to /cart for the current routing context. */
  cartHref: string;
  /** Pre-resolved URL to /checkout. */
  checkoutHref: string;
  /** Pre-resolved URL to /products. */
  productsHref: string;
  /** Prefix used to build per-product URLs as `${productHrefPrefix}/${slug}`. */
  productHrefPrefix: string;
  initial: CartDrawerSnapshot;
  children: React.ReactNode;
};

/**
 * Provider that mounts the global slide-from-left cart drawer and exposes
 * open/close controls via context. Place near the storefront layout root.
 */
export function CartDrawerProvider({
  workspaceId,
  cartHref,
  checkoutHref,
  productsHref,
  productHrefPrefix,
  initial,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CartDrawerSnapshot>(initial);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef(0);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCartSnapshotAction(workspaceId);
      setSnapshot(data);
    } finally {
      setLoading(false);
      lastFetchRef.current = Date.now();
    }
  }, [workspaceId]);

  const open = useCallback(() => {
    setIsOpen(true);
    // Always refresh on open so the drawer reflects the latest server cookie
    // (cart cookies are server-side, so client state can lag).
    fetchSnapshot();
  }, [fetchSnapshot]);

  const close = useCallback(() => setIsOpen(false), []);

  // Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  // Sync if the server-rendered `initial` snapshot changes (e.g. after
  // a hard navigation between storefront pages).
  useEffect(() => {
    setSnapshot(initial);
  }, [initial]);

  const value: CartDrawerContextValue = {
    isOpen,
    open,
    close,
    refresh: fetchSnapshot,
  };

  return (
    <CartDrawerContext.Provider value={value}>
      {children}
      <CartDrawerUI
        isOpen={isOpen}
        loading={loading}
        snapshot={snapshot}
        cartHref={cartHref}
        checkoutHref={checkoutHref}
        productsHref={productsHref}
        productHrefPrefix={productHrefPrefix}
        onClose={close}
        onRefresh={fetchSnapshot}
      />
    </CartDrawerContext.Provider>
  );
}

function CartDrawerUI({
  isOpen,
  loading,
  snapshot,
  cartHref,
  checkoutHref,
  productsHref,
  productHrefPrefix,
  onClose,
  onRefresh,
}: {
  isOpen: boolean;
  loading: boolean;
  snapshot: CartDrawerSnapshot;
  cartHref: string;
  checkoutHref: string;
  productsHref: string;
  productHrefPrefix: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { lines, subtotal, count } = snapshot;
  const empty = lines.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[60] bg-zinc-950/40 transition-opacity duration-300",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      {/* Drawer panel — slides in from the LEFT */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang belanja"
        className={cn(
          "fixed inset-y-0 left-0 z-[61] flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-zinc-900" aria-hidden />
            <h2 className="text-base font-semibold text-zinc-900">
              Keranjang
            </h2>
            {count > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-semibold text-white">
                {count}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative flex-1 overflow-y-auto">
          {loading ? (
            <div className="absolute inset-x-0 top-0 flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : null}

          {empty ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
                <ShoppingBag className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                Keranjang kosong
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Tambahkan produk untuk mulai belanja.
              </p>
              <Link
                href={productsHref}
                onClick={onClose}
                className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Jelajahi produk
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lines.map((line) => (
                <CartDrawerLineRow
                  key={`${line.productId}:${line.variantId ?? "base"}`}
                  line={line}
                  productHrefPrefix={productHrefPrefix}
                  onClose={onClose}
                  onChange={onRefresh}
                />
              ))}
            </ul>
          )}
        </div>

        {!empty ? (
          <footer className="border-t border-zinc-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Subtotal</span>
              <span className="text-base font-semibold text-zinc-900">
                {formatPrice(subtotal)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Ongkos kirim & diskon dihitung di checkout.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Lanjut belanja
              </button>
              <Link
                href={checkoutHref}
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Checkout
              </Link>
            </div>
            <Link
              href={cartHref}
              onClick={onClose}
              className="mt-2 block text-center text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Lihat detail keranjang
            </Link>
          </footer>
        ) : null}
      </aside>
    </>
  );
}

function CartDrawerLineRow({
  line,
  productHrefPrefix,
  onClose,
  onChange,
}: {
  line: CartDrawerLine;
  productHrefPrefix: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const productHref = `${productHrefPrefix}/${line.slug}`;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setQty(next: number) {
    const clamped = Math.max(
      0,
      Math.min(next, line.type === "PHYSICAL" ? line.maxStock : 99)
    );
    startTransition(async () => {
      if (clamped === 0) {
        await removeCartItemAction(line.productId, line.variantId);
      } else {
        await updateCartItemAction(line.productId, clamped, line.variantId);
      }
      onChange();
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "flex gap-3 p-4 transition",
        pending && "opacity-50"
      )}
    >
      <Link
        href={productHref}
        onClick={onClose}
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
      >
        {line.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={line.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="h-5 w-5 text-zinc-300" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={productHref}
            onClick={onClose}
            className="line-clamp-2 text-sm font-medium text-zinc-900 hover:underline"
          >
            {line.name}
          </Link>
          <button
            type="button"
            onClick={() => setQty(0)}
            aria-label="Hapus dari keranjang"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {line.variantName ? (
          <p className="mt-0.5 text-xs font-medium text-zinc-600">{line.variantName}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-zinc-500">
          {formatPrice(line.unitPrice)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex h-8 items-center rounded-lg border border-zinc-200">
            <button
              type="button"
              onClick={() => setQty(line.quantity - 1)}
              aria-label="Kurangi"
              disabled={pending}
              className="flex h-full w-7 items-center justify-center text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-7 text-center text-sm font-medium text-zinc-900">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQty(line.quantity + 1)}
              aria-label="Tambah"
              disabled={
                pending ||
                (line.type === "PHYSICAL" && line.quantity >= line.maxStock)
              }
              className="flex h-full w-7 items-center justify-center text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            {formatPrice(line.lineTotal)}
          </span>
        </div>
      </div>
    </li>
  );
}
