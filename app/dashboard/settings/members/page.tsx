import { redirect } from "next/navigation";

export default function MembersSettingsRedirect() {
  redirect("/dashboard/settings?tab=anggota");
}
