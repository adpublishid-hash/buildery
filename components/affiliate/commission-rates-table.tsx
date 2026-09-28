"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setItemCommissionRateAction, type CommissionRateTarget } from "@/lib/actions/affiliate";
import { commissionAmount } from "@/lib/affiliate-rates";
import { formatPrice } from "@/lib/utils";

export type RateRow = {
  id: string;
  name: string;
  /** Status or type shown under the name, e.g. "Digital · Active". */
  detail: string;
  price: number;
  percent: number | null;
};

export function CommissionRatesTable({
  target,
  rows,
  programPercent,
  canManage,
  emptyText,
}: {
  target: CommissionRateTarget;
  rows: RateRow[];
  programPercent: number;
  canManage: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="px-[16px] py-[28px] text-center text-[12px] text-kv-muted-fg">{emptyText}</p>;
  }
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-[14px]">Item</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="w-[210px]">Commission rate</TableHead>
          <TableHead className="pr-[14px] text-right">Partner earns</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <RateRowView key={row.id} target={target} row={row} programPercent={programPercent} canManage={canManage} />
        ))}
      </TableBody>
    </Table>
  );
}

function RateRowView({
  target,
  row,
  programPercent,
  canManage,
}: {
  target: CommissionRateTarget;
  row: RateRow;
  programPercent: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const saved = row.percent == null ? "" : String(row.percent);
  const [value, setValue] = useState(saved);
  const dirty = value.trim() !== saved;
  const effective = value.trim() === "" ? programPercent : Number(value);
  const valid = value.trim() === "" || (Number.isInteger(effective) && effective >= 0 && effective <= 100);

  function save(next: string) {
    startTransition(async () => {
      const res = await setItemCommissionRateAction(target, row.id, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next.trim() ? `${row.name}: ${next.trim()}% commission` : `${row.name} uses the default rate`);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="pl-[14px]">
        <p className="text-[13px] font-medium text-kv-fg">{row.name}</p>
        <p className="text-[11px] text-kv-muted-fg">{row.detail}</p>
      </TableCell>
      <TableCell className="kv-tabular text-right text-[13px] text-kv-secondary-fg">
        {row.price > 0 ? formatPrice(row.price) : "Free"}
      </TableCell>
      <TableCell>
        {canManage ? (
          <form
            className="flex items-center gap-[6px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && valid) save(value);
            }}
          >
            <div className="relative w-[96px]">
              <Input
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                placeholder={`${programPercent}`}
                aria-label={`Commission rate for ${row.name}`}
                aria-invalid={!valid}
                className="h-[28px] pr-[22px] text-[12px]"
              />
              <span className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 text-[12px] text-kv-muted-fg">%</span>
            </div>
            {dirty ? (
              <Button type="submit" size="icon-sm" disabled={pending || !valid} aria-label="Save rate">
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
              </Button>
            ) : row.percent != null ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={pending}
                aria-label="Reset to default rate"
                title="Reset to default"
                onClick={() => {
                  setValue("");
                  save("");
                }}
              >
                <RotateCcw />
              </Button>
            ) : (
              <Badge variant="secondary" className="h-[20px] px-[6px] text-[10px]">Default</Badge>
            )}
          </form>
        ) : (
          <span className="text-[13px] text-kv-fg">
            {row.percent ?? programPercent}%{row.percent == null ? <span className="text-kv-muted-fg"> (default)</span> : null}
          </span>
        )}
      </TableCell>
      <TableCell className="kv-tabular pr-[14px] text-right text-[13px] font-medium text-kv-fg">
        {valid && row.price > 0 ? formatPrice(commissionAmount(row.price, effective * 100)) : "—"}
      </TableCell>
    </TableRow>
  );
}
