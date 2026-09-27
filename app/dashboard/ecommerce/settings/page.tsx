import { redirect } from "next/navigation";

export default function EcommerceSettingsRedirect() {
  redirect("/dashboard/settings?tab=ecommerce");
}
