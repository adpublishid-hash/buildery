import { redirect } from "next/navigation";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { isAiConfigured } from "@/lib/ai/config";
import { getUserPlan, planHasFeature } from "@/lib/saas-limits";
import { ProductForm } from "@/components/products/product-form";

export const metadata = { title: "New product · My Landing" };

export default async function NewProductPage() {
  const { role, workspace } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/products");
  }

  const plan = await getUserPlan(workspace.createdById);
  const aiEnabled = isAiConfigured() && planHasFeature(plan, "aiAssistant");

  return (
    <div className="w-full min-w-0">
      <ProductForm
        aiEnabled={aiEnabled}
        mode="create"
        defaultImageUrl={null}
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          details: "",
          type: "PHYSICAL",
          status: "DRAFT",
          pricingMode: "ONE_TIME",
          price: "",
          costPrice: "",
          discountPrice: "",
          stock: "0",
          sku: "",
          lowStockThreshold: "",
          category: "",
          imageId: "",
          galleryImageIds: [],
          metaTitle: "",
          metaDescription: "",
          downloadUrl: "",
          downloadLabel: "",
          digitalAccessItems: [],
          serviceLocation: "",
          serviceDurationMinutes: "",
          eventStartsAt: "",
          eventEndsAt: "",
          eventLocation: "",
          weightGrams: "",
          lengthCm: "",
          widthCm: "",
          heightCm: "",
        }}
      />
    </div>
  );
}
