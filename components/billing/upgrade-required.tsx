import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  feature: string;
  currentPlan: string;
  description?: string;
};

/**
 * Empty-state surfaced when the current plan doesn't include a feature.
 * Reused by Affiliate, Membership, and Advanced analytics pages.
 */
export function UpgradeRequired({ feature, currentPlan, description }: Props) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
          <Lock className="h-5 w-5 text-zinc-400" />
        </div>
        <CardTitle>Upgrade required</CardTitle>
        <CardDescription>
          {description ??
            `${feature} isn't included in the ${currentPlan} plan.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center gap-2 pb-6">
        <Button asChild>
          <Link href="/pricing">See plans</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/billing">Manage billing</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
