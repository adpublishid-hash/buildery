import { publicSiteUrl } from "@/lib/public-url";

type Props = {
  workspace: { name: string; slug: string };
  page: {
    title: string;
    slug: string;
    seoTitle: string | null;
    metaDescription: string | null;
    ogImage: string | null;
    noindex: boolean;
  };
  isHomePage: boolean;
};

/**
 * Structured data untuk halaman builder.
 *
 * Produk dan artikel blog sudah lama punya JSON-LD; halaman builder — termasuk
 * homepage toko — tidak punya sama sekali, sehingga mesin pencari tidak punya
 * apa pun untuk memahami situsnya di luar tag meta biasa.
 *
 * Halaman yang ditandai noindex sengaja dilewati: menandainya agar tidak
 * diindeks lalu tetap menyodorkan structured data adalah pesan yang saling
 * bertentangan.
 */
export function PageStructuredData({ workspace, page, isHomePage }: Props) {
  if (page.noindex) return null;

  const url = publicSiteUrl(workspace.slug, isHomePage ? "" : page.slug);
  const siteUrl = publicSiteUrl(workspace.slug);
  const name = page.seoTitle?.trim() || page.title;

  const webPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isHomePage ? "WebSite" : "WebPage",
    name,
    url,
    isPartOf: { "@type": "WebSite", name: workspace.name, url: siteUrl },
    publisher: { "@type": "Organization", name: workspace.name, url: siteUrl },
  };
  if (page.metaDescription?.trim()) {
    webPage.description = page.metaDescription.trim();
  }
  if (page.ogImage?.trim()) {
    webPage.primaryImageOfPage = page.ogImage.trim();
  }

  const graph: Record<string, unknown>[] = [webPage];

  // Remah roti hanya masuk akal kalau halaman ini memang bukan akarnya.
  if (!isHomePage) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: workspace.name,
          item: siteUrl,
        },
        { "@type": "ListItem", position: 2, name, item: url },
      ],
    });
  }

  return (
    <>
      {graph.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(entry).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
