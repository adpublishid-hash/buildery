import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BadgeCheck } from "lucide-react";

import { CertificateActions } from "@/components/learn/certificate-actions";
import { prisma } from "@/lib/prisma";
import { publicSiteHref } from "@/lib/public-url";

export const dynamic = "force-dynamic";

async function certificate(code: string) {
  return prisma.courseCertificate.findUnique({
    where: { verificationCode: code.toUpperCase() },
    include: { enrollment: { include: { workspace: { select: { name: true, slug: true } }, course: { select: { slug: true, instructorName: true } } } } },
  });
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const item = await certificate(params.code);
  return { title: item ? `Certificate · ${item.courseTitle}` : "Certificate not found", robots: { index: Boolean(item && !item.revokedAt) } };
}

export default async function CertificatePage({ params }: { params: { code: string } }) {
  const item = await certificate(params.code);
  if (!item) notFound();
  const valid = !item.revokedAt && item.enrollment.status === "COMPLETED";
  return <main className="min-h-screen bg-zinc-100 px-4 py-10 print:bg-white print:p-0">
    <div className="mx-auto mb-4 flex max-w-4xl justify-end print:hidden"><CertificateActions /></div>
    <article className="mx-auto flex min-h-[600px] max-w-4xl flex-col items-center justify-center border border-zinc-300 bg-white px-8 py-14 text-center shadow-sm print:min-h-screen print:max-w-none print:border-0 print:shadow-none">
      <Award className="h-14 w-14 text-amber-500" />
      <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-zinc-500">Certificate of completion</p>
      <h1 className="mt-8 text-4xl font-semibold text-zinc-950">{item.recipientName}</h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">has successfully completed</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-950">{item.courseTitle}</p>
      {item.enrollment.course.instructorName ? <p className="mt-3 text-sm text-zinc-500">Instructor: {item.enrollment.course.instructorName}</p> : null}
      <p className="mt-8 text-sm text-zinc-500">Issued {item.issuedAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
      <div className={`mt-8 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}><BadgeCheck className="h-4 w-4" />{valid ? "Verified certificate" : "Certificate revoked"}</div>
      <p className="mt-4 font-mono text-xs text-zinc-500">{item.verificationCode}</p>
      <Link className="mt-8 text-sm underline print:hidden" href={publicSiteHref(item.enrollment.workspace.slug, `courses/${item.enrollment.course.slug}`)}>View course</Link>
    </article>
  </main>;
}
