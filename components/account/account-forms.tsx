"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordAction,
  updateAccountNameAction,
} from "@/lib/actions/account";

type FieldErrors = Record<string, string[]>;

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(formData: FormData) {
    setFieldErrors({});
    startTransition(async () => {
      const res = await updateAccountNameAction(formData);
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success("Profil tersimpan");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="account-name">Nama</Label>
        <Input
          id="account-name"
          name="name"
          defaultValue={name}
          maxLength={80}
          required
        />
        <FieldError errors={fieldErrors.name} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Simpan profil
      </Button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formKey, setFormKey] = useState(0);

  function onSubmit(formData: FormData) {
    setFieldErrors({});
    startTransition(async () => {
      const res = await changePasswordAction(formData);
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success("Password diperbarui");
      // Kosongkan seluruh isian; membiarkan password tertinggal di form
      // setelah berhasil tidak ada gunanya.
      setFormKey((key) => key + 1);
    });
  }

  if (!hasPassword) {
    return (
      <p className="text-sm text-zinc-500">
        Akun ini masuk lewat penyedia login eksternal dan belum punya password.
        Gunakan tautan lupa password di halaman login untuk memasangnya.
      </p>
    );
  }

  return (
    <form key={formKey} action={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="currentPassword">Password saat ini</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError errors={fieldErrors.currentPassword} />
      </div>
      <div>
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError errors={fieldErrors.password} />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Ulangi password baru</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError errors={fieldErrors.confirmPassword} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Ganti password
      </Button>
    </form>
  );
}
