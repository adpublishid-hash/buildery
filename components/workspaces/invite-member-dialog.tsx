"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteMemberAction } from "@/lib/actions/members";
import {
  inviteMemberSchema,
  type InviteMemberInput,
} from "@/lib/zod";
import {
  MEMBER_ROLE_DESCRIPTION,
  MEMBER_ROLE_LABEL,
} from "@/lib/permissions";

type Props = {
  workspaceId: string;
  assignableRoles: Array<"ADMIN" | "EDITOR" | "VIEWER">;
};

export function InviteMemberDialog({ workspaceId, assignableRoles }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultRole = (assignableRoles[1] ?? assignableRoles[0] ?? "EDITOR") as
    | "ADMIN"
    | "EDITOR"
    | "VIEWER";

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: defaultRole },
  });
  const selectedRole = watch("role");

  function onSubmit(values: InviteMemberInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("email", values.email);
    fd.set("role", values.role);

    startTransition(async () => {
      const res = await inviteMemberAction(workspaceId, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof InviteMemberInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success("Invitation sent");
      reset({ email: "", role: defaultRole });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setServerError(null);
          reset({ email: "", role: defaultRole });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Undang anggota
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undang anggota</DialogTitle>
          <DialogDescription>
            Kami akan mengirim email undangan. Akses aktif otomatis saat
            penerima masuk dengan email yang sama.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="teammate@company.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Peran</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {MEMBER_ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {MEMBER_ROLE_DESCRIPTION[selectedRole]}
            </p>
            {errors.role && (
              <p className="text-xs text-red-600">{errors.role.message}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" /> Mengirim...
                </>
              ) : (
                "Kirim undangan"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
