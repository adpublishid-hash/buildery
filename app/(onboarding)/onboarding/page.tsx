import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WizardSteps } from "@/components/onboarding/wizard-steps";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your workspace · My Landing" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  // Must verify email before creating a workspace.
  if (!user?.emailVerified) redirect("/verify");

  // Already has a workspace — onboarding is done.
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (membership) redirect("/dashboard");

  return (
    <div>
      <WizardSteps current={2} />
      <OnboardingWizard userName={session.user.name?.split(" ")[0] ?? "there"} />
    </div>
  );
}
