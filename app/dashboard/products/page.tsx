import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Plus,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { ProductStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { effectivePrice, formatPrice, hasDiscount } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRowActions } from "@/components/products/product-row-actions";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Products · My Landing" };

const STATUS_VARIANT: Record<
  ProductStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  ARCHIVED: "outline",
};

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");
  const page = parsePage(searchParams.page);

  const ecommerceSetting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId: workspace.id },
    select: { lowStockThreshold: true },
  });
  const defaultLowStockThreshold = ecommerceSetting?.lowStockThreshold ?? 5;

  // The inventory stats cover the whole catalogue, not the page on screen, so
  // they are counted in the database rather than derived from the list.
  const [products, totalProducts, stockStats] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId: workspace.id },
      include: { category: true, image: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where: { workspaceId: workspace.id } }),
    prisma.$queryRaw<Array<{ active: bigint; low: bigint; out: bigint }>>`
      SELECT
        COUNT(*)::bigint AS active,
        COUNT(*) FILTER (
          WHERE "stock" <= GREATEST(0, COALESCE("lowStockThreshold", ${defaultLowStockThreshold}))
        )::bigint AS low,
        COUNT(*) FILTER (WHERE "stock" <= 0)::bigint AS out
      FROM "Product"
      WHERE "workspaceId" = ${workspace.id}
        AND "type" = 'PHYSICAL'::"ProductType"
        AND "status" = 'ACTIVE'::"ProductStatus"
    `,
  ]);
  const activePhysicalCount = Number(stockStats[0]?.active ?? 0);
  const lowStockCount = Number(stockStats[0]?.low ?? 0);
  const outOfStockCount = Number(stockStats[0]?.out ?? 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Products"
        description="Physical and digital products for your store."
        action={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard/products/settings">
                  <Settings2 /> Halaman katalog
                </Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/products/new">
                  <Plus /> New product
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {totalProducts === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product to start selling from your store."
          action={
            canEdit ? (
              <Button asChild>
                <Link href="/dashboard/products/new">
                  <Plus /> Add product
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <InventoryStat
              icon={Package}
              label="Produk fisik aktif"
              value={activePhysicalCount}
              tone="zinc"
            />
            <InventoryStat
              icon={AlertTriangle}
              label="Stok rendah"
              value={lowStockCount}
              tone={lowStockCount > 0 ? "amber" : "zinc"}
            />
            <InventoryStat
              icon={outOfStockCount > 0 ? AlertTriangle : CheckCircle2}
              label="Stok habis"
              value={outOfStockCount}
              tone={outOfStockCount > 0 ? "red" : "emerald"}
            />
          </div>

          <Card className="min-w-0 max-w-full overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="hidden sm:table-cell">Stock</TableHead>
                    {canEdit && (
                      <TableHead className="w-12 pr-4 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const threshold = productLowStockThreshold(
                      product,
                      defaultLowStockThreshold
                    );
                    const lowStock = isLowStock(product, defaultLowStockThreshold);
                    const outOfStock =
                      product.type === "PHYSICAL" && product.stock <= 0;
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="max-w-[11rem] pl-4 sm:max-w-none">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                              {product.image ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={product.image.url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-4 w-4 text-zinc-400" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {product.name}
                              </p>
                              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {product.category?.name ?? "Uncategorized"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[product.status]}>
                            {product.status.charAt(0) +
                              product.status.slice(1).toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:table-cell">
                          {productTypeLabel(product.type)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {formatPrice(effectivePrice(product))}
                          </span>
                          {hasDiscount(product) && (
                            <span className="ml-1.5 text-xs text-zinc-400 line-through">
                              {formatPrice(product.price)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:table-cell">
                          {product.type === "PHYSICAL" ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span>{product.stock}</span>
                                {outOfStock ? (
                                  <Badge variant="destructive">Habis</Badge>
                                ) : lowStock ? (
                                  <Badge className="border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                    Rendah
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-zinc-400">
                                Alert {"<="} {threshold}
                              </p>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="pr-4 text-right">
                            <ProductRowActions
                              productId={product.id}
                              productName={product.name}
                              status={product.status}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                total={totalProducts}
                pageSize={PAGE_SIZE}
                basePath="/dashboard/products"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "zinc" | "amber" | "red" | "emerald";
}) {
  // Monochrome, but still four distinguishable steps: hue used to separate
  // these, so weight and fill have to do it now — flattening them all to the
  // same grey would have hidden "habis" behind "aman".
  const toneClass = {
    zinc: "bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
    emerald: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    amber:
      "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
    red: "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function productLowStockThreshold(
  product: { lowStockThreshold: number | null },
  defaultThreshold: number
) {
  return Math.max(0, product.lowStockThreshold ?? defaultThreshold);
}

function isLowStock(
  product: {
    type: string;
    status: string;
    stock: number;
    lowStockThreshold: number | null;
  },
  defaultThreshold: number
) {
  return (
    product.type === "PHYSICAL" &&
    product.status === "ACTIVE" &&
    product.stock <= productLowStockThreshold(product, defaultThreshold)
  );
}

function productTypeLabel(type: string) {
  if (type === "PHYSICAL") return "Physical";
  if (type === "DIGITAL") return "Digital";
  return type;
}
