/* eslint-disable @next/next/no-img-element -- payment QR images can come from configured external providers */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";

import { EnrollmentPaymentProofForm } from "@/components/learn/enrollment-payment-proof-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { formatPrice } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CourseManualPaymentPage({ params, searchParams }: { params: { workspaceSlug: string; courseSlug: string }; searchParams: { payment?: string; access?: string } }) {
  const member = await getMemberSession(params.workspaceSlug);
  if (!member || !searchParams.payment || !searchParams.access || !verifyPublicAccessToken(searchParams.access, "payment", searchParams.payment)) notFound();
  const payment = await prisma.payment.findFirst({
    where: { id: searchParams.payment, workspaceId: member.workspaceId, enrollment: { customerId: member.customerId, course: { slug: params.courseSlug } } },
    include: { enrollment: { include: { course: true } } },
  });
  if (!payment?.enrollment || !payment.provider.startsWith("manual:")) notFound();
  const method = await prisma.manualPaymentMethod.findFirst({ where: { id: payment.provider.slice(7), workspaceId: member.workspaceId } });
  if (!method) notFound();
  return <main className="min-h-screen bg-zinc-50 px-4 py-10"><div className="mx-auto max-w-xl"><Link href={publicSiteContextHref(params.workspaceSlug, `courses/${params.courseSlug}`)} className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500"><ArrowLeft className="h-4 w-4" />Back to course</Link><Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Manual payment</CardTitle></CardHeader><CardContent className="space-y-5"><div><p className="text-sm text-zinc-500">Course</p><p className="font-medium">{payment.enrollment.course.title}</p><p className="mt-1 text-2xl font-semibold">{formatPrice(payment.amount)}</p></div><div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm"><p className="font-medium">{method.name}</p>{method.accountName ? <p className="mt-2">Account name: {method.accountName}</p> : null}{method.accountNumber ? <p>Account number: <span className="font-mono font-semibold">{method.accountNumber}</span></p> : null}{method.instructions ? <p className="mt-2 whitespace-pre-wrap text-zinc-600">{method.instructions}</p> : null}{method.qrImageUrl ? <img src={method.qrImageUrl} alt={`QR ${method.name}`} className="mt-3 max-h-64 max-w-full" /> : null}</div><EnrollmentPaymentProofForm enrollmentId={payment.enrollment.id} accessToken={searchParams.access} initialStatus={payment.manualProofStatus} /></CardContent></Card></div></main>;
}
