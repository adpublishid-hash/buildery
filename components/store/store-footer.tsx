import type { FooterData } from "@/lib/blocks/schema";
import { resolveStoreFooter } from "@/lib/storefront-nav";
import { FooterBlock } from "@/components/blocks/navigation-blocks";

type Props = {
  workspaceName: string;
  setting: {
    footerEnabled?: boolean | null;
    footerText?: string | null;
    footerCopyright?: string | null;
  } | null;
  /** Footer situs yang dipakai bersama, bila pemilik situs sudah mengaturnya. */
  siteFooter?: FooterData | null;
};

/**
 * Footer global di bawah setiap halaman publik.
 *
 * Ditandai `data-bd-store-footer` supaya halaman yang membawa blok Footer
 * sendiri bisa menyembunyikannya — tanpa itu, halaman dari template tampil
 * dengan dua footer bertumpuk. Layout tidak bisa tahu isi halaman di dalamnya,
 * jadi keputusannya dibuat di CSS (lihat `app/globals.css`).
 */
export function StoreFooter({ workspaceName, setting, siteFooter }: Props) {
  if (siteFooter) {
    return (
      <div data-bd-store-footer="">
        <FooterBlock data={siteFooter} />
      </div>
    );
  }

  const footer = resolveStoreFooter(setting, workspaceName);
  if (!footer.enabled) return null;

  return (
    <footer data-bd-store-footer="" className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-8 text-center">
        {footer.text ? (
          <p className="mx-auto max-w-2xl text-sm leading-6 text-zinc-600">
            {footer.text}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">{footer.copyright}</p>
      </div>
    </footer>
  );
}
