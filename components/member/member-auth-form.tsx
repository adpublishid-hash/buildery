"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginMemberAction,
  requestMemberPasswordResetAction,
  registerMemberAction,
  resetMemberPasswordAction,
} from "@/lib/actions/member-auth";
import { publicSiteHref } from "@/lib/public-url";
import { safeCallbackUrl } from "@/lib/safe-redirect";

type Props = {
  mode: "login" | "register";
  workspaceSlug: string;
  workspaceName: string;
  callbackUrl?: string;
};

export function MemberAuthForm({
  mode,
  workspaceSlug,
  workspaceName,
  callbackUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const isRegister = mode === "register";
  const defaultRedirect = publicSiteHref(workspaceSlug, "member/account");
  const redirectTarget = safeCallbackUrl(callbackUrl, defaultRedirect);
  const loginHref =
    publicSiteHref(workspaceSlug, "member/login") +
    (callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "");
  const registerHref =
    publicSiteHref(workspaceSlug, "member/register") +
    (callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "");

  function submit(formData: FormData) {
    setServerError(null);
    setFieldErrors({});

    startTransition(async () => {
      const res = isRegister
        ? await registerMemberAction(workspaceSlug, formData)
        : await loginMemberAction(workspaceSlug, formData);
      if (!res.ok) {
        setServerError(res.error);
        const next: Record<string, string> = {};
        for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
          if (messages?.[0]) next[field] = messages[0];
        }
        setFieldErrors(next);
        return;
      }
      if (isRegister && res.data?.verificationRequired) {
        setVerificationRequired(true);
        setDevCode(res.data.devCode ?? null);
        return;
      }
      router.push(redirectTarget);
      router.refresh();
    });
  }

  function submitReset(formData: FormData) {
    setServerError(null);
    startTransition(async () => {
      if (!resetCodeSent) {
        const email = String(formData.get("email") || "");
        const result = await requestMemberPasswordResetAction(workspaceSlug, email);
        if (!result.ok) return setServerError(result.error);
        setResetEmail(email);
        setResetCodeSent(true);
        setDevCode(result.data?.devCode ?? null);
        return;
      }
      formData.set("email", resetEmail);
      const result = await resetMemberPasswordAction(workspaceSlug, formData);
      if (!result.ok) return setServerError(result.error);
      router.push(redirectTarget);
      router.refresh();
    });
  }

  if (!isRegister && resetMode) {
    return (
      <Card>
        <CardHeader><CardTitle>Reset password</CardTitle><CardDescription>{resetCodeSent ? "Enter the code from your email and choose a new password." : "We'll send a verification code when that member account exists."}</CardDescription></CardHeader>
        <CardContent>
          <form action={submitReset} className="space-y-4">
            {!resetCodeSent ? <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" name="email" type="email" required /></div> : <>
              <div className="space-y-2"><Label htmlFor="reset-code">Verification code</Label><Input id="reset-code" name="verificationCode" inputMode="numeric" maxLength={6} defaultValue={devCode ?? ""} required /></div>
              <div className="space-y-2"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" name="password" type="password" minLength={8} required /></div>
            </>}
            {serverError ? <p className="text-xs text-red-600">{serverError}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{resetCodeSent ? "Set new password" : "Send reset code"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setResetMode(false); setResetCodeSent(false); setServerError(null); }}>Back to login</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isRegister ? "Create member account" : "Member login"}</CardTitle>
        <CardDescription>
          {isRegister
            ? `Sign up to manage your ${workspaceName} memberships and courses.`
            : `Continue to your ${workspaceName} member area.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          {isRegister ? (
            <div className="space-y-2">
              <Label htmlFor="member-name">Full name</Label>
              <Input
                id="member-name"
                name="name"
                autoComplete="name"
                disabled={pending}
              />
              {fieldErrors.name ? (
                <p className="text-xs text-red-600">{fieldErrors.name}</p>
              ) : null}
            </div>
          ) : null}

          {verificationRequired ? (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-start gap-2 text-sm text-zinc-700">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Enter the code sent to this email before activating member
                  login.
                </p>
              </div>
              <Label htmlFor="member-verification-code">Verification code</Label>
              <Input
                id="member-verification-code"
                name="verificationCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                defaultValue={devCode ?? ""}
                disabled={pending}
              />
              {fieldErrors.verificationCode ? (
                <p className="text-xs text-red-600">
                  {fieldErrors.verificationCode}
                </p>
              ) : null}
              {devCode ? (
                <p className="text-xs text-zinc-500">Local code: {devCode}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={pending}
            />
            {fieldErrors.email ? (
              <p className="text-xs text-red-600">{fieldErrors.email}</p>
            ) : null}
          </div>

          {isRegister ? (
            <div className="space-y-2">
              <Label htmlFor="member-phone">Phone</Label>
              <Input
                id="member-phone"
                name="phone"
                autoComplete="tel"
                disabled={pending}
              />
              {fieldErrors.phone ? (
                <p className="text-xs text-red-600">{fieldErrors.phone}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="member-password">Password</Label>
            <Input
              id="member-password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              disabled={pending}
            />
            {fieldErrors.password ? (
              <p className="text-xs text-red-600">{fieldErrors.password}</p>
            ) : null}
          </div>

          {isRegister ? (
            <div className="space-y-2">
              <Label htmlFor="member-confirm-password">Confirm password</Label>
              <Input
                id="member-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                disabled={pending}
              />
              {fieldErrors.confirmPassword ? (
                <p className="text-xs text-red-600">
                  {fieldErrors.confirmPassword}
                </p>
              ) : null}
            </div>
          ) : null}

          {serverError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {serverError}
            </div>
          ) : null}

          {pending ? (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-950" />
              <div>
                <p className="font-medium text-zinc-950">
                  {isRegister
                    ? "Memproses pendaftaran..."
                    : "Memproses login..."}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {isRegister
                    ? "Akun member sedang dibuat."
                    : "Akses member sedang diverifikasi."}
                </p>
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : isRegister ? (
              <UserPlus className="h-4 w-4" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {pending
              ? isRegister
                ? "Memproses pendaftaran..."
                : "Memproses login..."
              : isRegister
                ? "Create account"
                : "Log in"}
          </Button>
          {!isRegister ? <Button type="button" variant="link" className="w-full" onClick={() => setResetMode(true)}>Forgot password?</Button> : null}
        </form>

        <div className="mt-5 border-t border-zinc-100 pt-4 text-center text-sm text-zinc-500">
          {isRegister ? (
            <>
              Already have a member account?{" "}
              <Link
                href={loginHref}
                className="font-medium text-zinc-900 hover:underline"
              >
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link
                href={registerHref}
                className="font-medium text-zinc-900 hover:underline"
              >
                Create an account
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
