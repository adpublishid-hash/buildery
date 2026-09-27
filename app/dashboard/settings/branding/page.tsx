import { redirect } from "next/navigation";

export default function BrandingSettingsRedirect() {
  redirect("/dashboard/settings?tab=tampilan");
}
