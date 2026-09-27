import "server-only";

import type { Workspace } from "@prisma/client";

import { publicBlogIndex } from "@/lib/public-blog";
import { publicSiteUrl } from "@/lib/public-url";
import { stripRichText } from "@/lib/rich-text";

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function renderBlogFeed(
  workspace: Pick<Workspace, "id" | "slug" | "name">
) {
  const result = await publicBlogIndex({
    workspaceId: workspace.id,
    page: 1,
    pageSize: 1000,
  });
  const blogUrl = publicSiteUrl(workspace.slug, "blog");
  const feedUrl = publicSiteUrl(workspace.slug, "blog/feed.xml");
  const items = result.posts
    .map((post) => {
      const url = publicSiteUrl(workspace.slug, `blog/${post.slug}`);
      const description =
        post.excerpt || stripRichText(post.body).trim().slice(0, 280);
      return [
        "    <item>",
        `      <title>${xml(post.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        post.publishedAt
          ? `      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`
          : null,
        `      <description>${xml(description)}</description>`,
        post.authorName ? `      <dc:creator>${xml(post.authorName)}</dc:creator>` : null,
        ...post.tags.map((tag) => `      <category>${xml(tag.name)}</category>`),
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(`${workspace.name} Blog`)}</title>
    <link>${xml(blogUrl)}</link>
    <description>${xml(`Articles and updates from ${workspace.name}.`)}</description>
    <atom:link href="${xml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
