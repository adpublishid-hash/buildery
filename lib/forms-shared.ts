export type VisibleIfRule = {
  field: string;
  op:
    | "eq"
    | "neq"
    | "in"
    | "nin"
    | "contains"
    | "not_contains"
    | "filled"
    | "empty"
    | "checked"
    | "unchecked";
  value?: string | string[];
};

export type VisibleIfCondition =
  | VisibleIfRule
  | { logic: "all" | "any"; rules: VisibleIfRule[] };

function parseRule(raw: unknown): VisibleIfRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.field !== "string" || !obj.field) return null;
  const op = obj.op;
  if (
    op !== "eq" &&
    op !== "neq" &&
    op !== "in" &&
    op !== "nin" &&
    op !== "contains" &&
    op !== "not_contains" &&
    op !== "filled" &&
    op !== "empty" &&
    op !== "checked" &&
    op !== "unchecked"
  ) {
    return null;
  }
  let value: VisibleIfRule["value"] = undefined;
  if (typeof obj.value === "string") value = obj.value;
  else if (Array.isArray(obj.value)) {
    value = obj.value.filter((v): v is string => typeof v === "string");
  }
  return { field: obj.field, op, value };
}

export function parseVisibleIfRule(raw: unknown): VisibleIfCondition | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.rules)) {
    const logic = obj.logic === "any" ? "any" : "all";
    const rules = obj.rules
      .map((rule) => parseRule(rule))
      .filter((rule): rule is VisibleIfRule => Boolean(rule));
    return rules.length > 0 ? { logic, rules } : null;
  }
  return parseRule(raw);
}

export function evaluateVisible(
  condition: VisibleIfCondition | null,
  values: Record<string, unknown>
): boolean {
  if (!condition) return true;
  if ("rules" in condition) {
    return condition.logic === "any"
      ? condition.rules.some((rule) => evaluateRule(rule, values))
      : condition.rules.every((rule) => evaluateRule(rule, values));
  }
  return evaluateRule(condition, values);
}

function evaluateRule(
  rule: VisibleIfRule,
  values: Record<string, unknown>
): boolean {
  const v = values[rule.field];
  const asArray = Array.isArray(v)
    ? v.map(String)
    : v == null
      ? []
      : [String(v)];
  const filled = asArray.some((s) => s !== "" && s !== "false");
  const checked = asArray.some(
    (s) => s === "on" || s === "true" || s === "1"
  );
  const wanted = String(rule.value ?? "").toLowerCase();
  const haystack = asArray.map((s) => s.toLowerCase());

  switch (rule.op) {
    case "filled":
      return filled;
    case "empty":
      return !filled;
    case "checked":
      return checked;
    case "unchecked":
      return !checked;
    case "eq":
      return asArray.includes(String(rule.value ?? ""));
    case "neq":
      return !asArray.includes(String(rule.value ?? ""));
    case "contains":
      return Boolean(wanted) && haystack.some((s) => s.includes(wanted));
    case "not_contains":
      return !Boolean(wanted) || !haystack.some((s) => s.includes(wanted));
    case "in": {
      const list = Array.isArray(rule.value)
        ? rule.value
        : rule.value
          ? [rule.value]
          : [];
      return list.some((opt) => asArray.includes(String(opt)));
    }
    case "nin": {
      const list = Array.isArray(rule.value)
        ? rule.value
        : rule.value
          ? [rule.value]
          : [];
      return !list.some((opt) => asArray.includes(String(opt)));
    }
  }
}
