"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CertificateActions() {
  return <Button type="button" variant="outline" onClick={() => window.print()}><Printer />Print / save PDF</Button>;
}
