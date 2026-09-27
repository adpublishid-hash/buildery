import { redirect } from "next/navigation";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { EditorHeader, EditorSection, EditorStatus } from "@/components/dashboard/editor-shell";
import { FormMetaForm } from "@/components/forms/form-meta-form";

export const metadata = { title: "New form · My Landing" };

export default async function NewFormPage() {
  const { role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/forms");

  return (
    <div className="w-full min-w-0">
      <EditorHeader
        backHref="/dashboard/forms"
        backLabel="Kembali ke form"
        eyebrow="Form baru"
        title="Form tanpa judul"
        status={<EditorStatus tone="draft">Draft</EditorStatus>}
        meta="Mulai dari judul dan slug. Field ditambahkan setelah form dibuat."
      />

      <div className="kv-editor max-w-[880px]">
      <EditorSection title="Detail form" description="Tampil di atas form publik.">
          <FormMetaForm
            mode="create"
            defaultValues={{
              title: "",
              slug: "",
              description: "",
              successMessage: "Thanks! We received your submission.",
              submitLabel: "Submit",
              isOpen: "false",
              multiStep: "false",
              notifyEmail: "",
              webhookUrl: "",
              redirectUrl: "",
              opensAt: "",
              closesAt: "",
              maxSubmissions: "",
              closedMessage:
                "This form is closed and no longer accepting submissions.",
            }}
          />
      </EditorSection>
      </div>
    </div>
  );
}
