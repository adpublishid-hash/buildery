import { AuthFrame } from "@/components/auth/auth-card";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame back={{ href: "/", label: "Beranda" }}>{children}</AuthFrame>;
}
