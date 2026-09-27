import { AuthFrame } from "@/components/auth/auth-card";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthFrame logoHref="/dashboard" width="max-w-[440px]">
      {children}
    </AuthFrame>
  );
}
