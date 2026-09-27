import "server-only";

import { prisma } from "@/lib/prisma";
import { queueAffiliateEmailNotification } from "@/lib/store-notifications";

export async function sweepAffiliateLifecycle(now = new Date()) {
  const eligible = await prisma.commission.findMany({
    where: {
      status: "PENDING",
      OR: [{ availableAt: null }, { availableAt: { lte: now } }],
    },
    include: { affiliate: { include: { customer: { select: { id: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  let approved = 0;
  for (const commission of eligible) {
    const changed = await prisma.commission.updateMany({
      where: { id: commission.id, status: "PENDING" },
      data: { status: "APPROVED", approvedAt: now },
    });
    if (!changed.count) continue;
    approved += 1;
    await queueAffiliateEmailNotification(prisma, {
      workspaceId: commission.workspaceId,
      customerId: commission.affiliate.customer.id,
      recipient: commission.affiliate.customer.email,
      event: "COMMISSION_APPROVED",
      subject: "Commission approved",
      body: `Your commission of Rp${commission.amount.toLocaleString("id-ID")} is approved for payout.`,
    });
  }

  const privacyCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const anonymized = await prisma.referral.updateMany({
    where: {
      createdAt: { lt: privacyCutoff },
      OR: [
        { userAgent: { not: null } },
        { referrer: { not: null } },
        { ipHash: { not: null } },
      ],
    },
    data: { userAgent: null, referrer: null, ipHash: null },
  });
  return { approved, anonymized: anonymized.count };
}
