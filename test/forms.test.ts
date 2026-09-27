import { describe, expect, it } from "vitest";

import {
  csvHeaderRow,
  csvRow,
  isFieldVisible,
  optionsFromText,
  parseFieldOptions,
  parseVisibleIf,
  readSubmissionCell,
  submissionsToCsv,
} from "@/lib/forms";
import { evaluateVisible, parseVisibleIfRule } from "@/lib/forms-shared";

describe("optionsFromText", () => {
  it("splits lines, trims, and drops blanks", () => {
    expect(optionsFromText("Sales\n Support \n\nOther")).toEqual([
      "Sales",
      "Support",
      "Other",
    ]);
  });

  it("returns an empty array for nullish input", () => {
    expect(optionsFromText(null)).toEqual([]);
    expect(optionsFromText("")).toEqual([]);
  });
});

describe("parseFieldOptions", () => {
  it("keeps only string entries from JSON", () => {
    expect(parseFieldOptions(["a", "b"])).toEqual(["a", "b"]);
    expect(parseFieldOptions(["a", 2, null])).toEqual(["a"]);
    expect(parseFieldOptions("not-an-array")).toEqual([]);
  });
});

describe("readSubmissionCell", () => {
  it("reads string values by field name", () => {
    expect(readSubmissionCell({ email: "a@b.com" }, "email")).toBe("a@b.com");
  });

  it("renders booleans as yes/no and joins arrays", () => {
    expect(readSubmissionCell({ agree: true }, "agree")).toBe("yes");
    expect(readSubmissionCell({ tags: ["x", "y"] }, "tags")).toBe("x, y");
  });

  it("returns an empty string for missing fields", () => {
    expect(readSubmissionCell({}, "missing")).toBe("");
    expect(readSubmissionCell(null, "missing")).toBe("");
  });
});

describe("submissionsToCsv", () => {
  it("builds a header row plus one row per submission", () => {
    const csv = submissionsToCsv(
      [
        { name: "full_name", label: "Full name" },
        { name: "email", label: "Email" },
      ],
      [
        {
          data: { full_name: "Ada", email: "ada@example.com" },
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]
    );
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe("Submitted at,Full name,Email");
    expect(rows[1]).toContain("Ada");
    expect(rows[1]).toContain("ada@example.com");
  });

  it("escapes values containing commas and quotes", () => {
    const csv = submissionsToCsv(
      [{ name: "msg", label: "Message" }],
      [{ data: { msg: 'hi, "there"' }, createdAt: new Date() }]
    );
    expect(csv).toContain('"hi, ""there"""');
  });
});

describe("readSubmissionCell with file values", () => {
  it("renders file objects as their url", () => {
    expect(
      readSubmissionCell(
        { attachment: { url: "/uploads/x.pdf", name: "x.pdf" } },
        "attachment"
      )
    ).toBe("/uploads/x.pdf");
  });
});

describe("parseVisibleIfRule", () => {
  it("returns null for invalid input", () => {
    expect(parseVisibleIfRule(null)).toBeNull();
    expect(parseVisibleIfRule({ field: "", op: "eq" })).toBeNull();
    expect(parseVisibleIfRule({ field: "x", op: "bogus" })).toBeNull();
  });

  it("parses an eq rule with a string value", () => {
    expect(parseVisibleIfRule({ field: "x", op: "eq", value: "a" })).toEqual({
      field: "x",
      op: "eq",
      value: "a",
    });
  });

  it("parses an in rule with an array value", () => {
    expect(
      parseVisibleIfRule({ field: "x", op: "in", value: ["a", "b"] })
    ).toEqual({ field: "x", op: "in", value: ["a", "b"] });
  });

  it("parses contains and checkbox visibility operators", () => {
    expect(
      parseVisibleIfRule({ field: "message", op: "contains", value: "urgent" })
    ).toEqual({ field: "message", op: "contains", value: "urgent" });
    expect(parseVisibleIfRule({ field: "consent", op: "checked" })).toEqual({
      field: "consent",
      op: "checked",
      value: undefined,
    });
  });

  it("parses grouped all/any visibility rules", () => {
    expect(
      parseVisibleIfRule({
        logic: "any",
        rules: [
          { field: "source", op: "eq", value: "Google" },
          { field: "budget", op: "filled" },
        ],
      })
    ).toEqual({
      logic: "any",
      rules: [
        { field: "source", op: "eq", value: "Google" },
        { field: "budget", op: "filled", value: undefined },
      ],
    });
  });
});

describe("evaluateVisible", () => {
  it("is visible when there is no rule", () => {
    expect(evaluateVisible(null, {})).toBe(true);
  });

  it("eq matches exact value", () => {
    const rule = { field: "x", op: "eq" as const, value: "yes" };
    expect(evaluateVisible(rule, { x: "yes" })).toBe(true);
    expect(evaluateVisible(rule, { x: "no" })).toBe(false);
    expect(evaluateVisible(rule, {})).toBe(false);
  });

  it("filled checks whether the field has content", () => {
    const rule = { field: "x", op: "filled" as const };
    expect(evaluateVisible(rule, { x: "abc" })).toBe(true);
    expect(evaluateVisible(rule, { x: "" })).toBe(false);
  });

  it("in matches against arrays of strings", () => {
    const rule = { field: "x", op: "in" as const, value: ["a", "b"] };
    expect(evaluateVisible(rule, { x: "a" })).toBe(true);
    expect(evaluateVisible(rule, { x: ["b", "c"] })).toBe(true);
    expect(evaluateVisible(rule, { x: "z" })).toBe(false);
  });

  it("contains matches text case-insensitively", () => {
    const rule = {
      field: "message",
      op: "contains" as const,
      value: "urgent",
    };
    expect(evaluateVisible(rule, { message: "This is URGENT" })).toBe(true);
    expect(evaluateVisible(rule, { message: "Normal request" })).toBe(false);
  });

  it("checked and unchecked match checkbox-like values", () => {
    expect(
      evaluateVisible({ field: "agree", op: "checked" }, { agree: "on" })
    ).toBe(true);
    expect(
      evaluateVisible({ field: "agree", op: "unchecked" }, { agree: "" })
    ).toBe(true);
  });

  it("evaluates all/any grouped conditions", () => {
    const rules = [
      { field: "source", op: "eq" as const, value: "Google" },
      { field: "budget", op: "filled" as const },
    ];
    expect(
      evaluateVisible({ logic: "all", rules }, { source: "Google", budget: "5" })
    ).toBe(true);
    expect(
      evaluateVisible({ logic: "all", rules }, { source: "Google", budget: "" })
    ).toBe(false);
    expect(
      evaluateVisible({ logic: "any", rules }, { source: "Instagram", budget: "5" })
    ).toBe(true);
  });
});

/**
 * The server enforces visibility on submit (`submitFormAction` skips
 * validation for a hidden field), while the browser decides what to render.
 * These used to be two hand-written copies of the same 120 lines, and only
 * the client copy was covered. Asserting they are the *same function* is
 * what stops a second copy from reappearing.
 */
describe("server and client visibility entry points", () => {
  it("are backed by one implementation, not two copies", () => {
    expect(parseVisibleIf).toBe(parseVisibleIfRule);
    expect(isFieldVisible).toBe(evaluateVisible);
  });

  it("parses rules identically through the server import", () => {
    expect(parseVisibleIf({ field: "x", op: "eq", value: "a" })).toEqual({
      field: "x",
      op: "eq",
      value: "a",
    });
    expect(parseVisibleIf({ field: "x", op: "bogus" })).toBeNull();
    expect(
      parseVisibleIf({
        logic: "any",
        rules: [
          { field: "source", op: "eq", value: "Google" },
          { field: "budget", op: "filled" },
        ],
      })
    ).toEqual({
      logic: "any",
      rules: [
        { field: "source", op: "eq", value: "Google" },
        { field: "budget", op: "filled", value: undefined },
      ],
    });
  });

  it("evaluates every operator identically through the server import", () => {
    const cases: Array<{
      condition: Parameters<typeof isFieldVisible>[0];
      values: Record<string, unknown>;
      visible: boolean;
    }> = [
      { condition: null, values: {}, visible: true },
      { condition: { field: "x", op: "eq", value: "a" }, values: { x: "a" }, visible: true },
      { condition: { field: "x", op: "neq", value: "a" }, values: { x: "b" }, visible: true },
      { condition: { field: "x", op: "in", value: ["a", "b"] }, values: { x: "b" }, visible: true },
      { condition: { field: "x", op: "nin", value: ["a"] }, values: { x: "z" }, visible: true },
      { condition: { field: "x", op: "contains", value: "urg" }, values: { x: "URGENT" }, visible: true },
      { condition: { field: "x", op: "not_contains", value: "urg" }, values: { x: "calm" }, visible: true },
      { condition: { field: "x", op: "filled" }, values: { x: "abc" }, visible: true },
      { condition: { field: "x", op: "empty" }, values: { x: "" }, visible: true },
      { condition: { field: "x", op: "checked" }, values: { x: "on" }, visible: true },
      { condition: { field: "x", op: "unchecked" }, values: { x: "" }, visible: true },
    ];

    for (const { condition, values, visible } of cases) {
      expect(isFieldVisible(condition, values)).toBe(visible);
      // And the client would agree — that agreement is the whole point.
      expect(isFieldVisible(condition, values)).toBe(
        evaluateVisible(condition, values)
      );
    }
  });

  it("treats a field hidden by its rule as not enforced", () => {
    // Mirrors the submit path: a hidden field is skipped before validation,
    // so a required-but-hidden field must never block a submission.
    const condition = parseVisibleIf({ field: "wants_call", op: "checked" });
    expect(isFieldVisible(condition, { wants_call: "" })).toBe(false);
    expect(isFieldVisible(condition, { wants_call: "on" })).toBe(true);
  });
});

/**
 * The export route streams these two directly, one row at a time, instead of
 * building the whole CSV in memory. They must keep producing exactly what
 * submissionsToCsv used to.
 */
describe("csv row helpers", () => {
  const fields = [
    { name: "name", label: "Name" },
    { name: "email", label: "Email" },
  ];

  it("builds the header row", () => {
    expect(csvHeaderRow(fields)).toBe("Submitted at,Name,Email");
  });

  it("builds one submission row", () => {
    expect(
      csvRow(fields, {
        data: { name: "Budi", email: "budi@contoh.id" },
        createdAt: new Date("2026-09-12T10:00:00.000Z"),
      })
    ).toBe("2026-09-12T10:00:00.000Z,Budi,budi@contoh.id");
  });

  it("escapes the same way the whole-file renderer does", () => {
    const submissions = [
      {
        data: { name: 'Budi, "BD"', email: "budi@contoh.id" },
        createdAt: new Date("2026-09-12T10:00:00.000Z"),
      },
    ];

    expect([csvHeaderRow(fields), ...submissions.map((s) => csvRow(fields, s))].join("\r\n")).toBe(
      submissionsToCsv(fields, submissions)
    );
  });

  it("leaves a missing field as an empty cell", () => {
    expect(
      csvRow(fields, {
        data: { name: "Budi" },
        createdAt: new Date("2026-09-12T10:00:00.000Z"),
      })
    ).toBe("2026-09-12T10:00:00.000Z,Budi,");
  });
});
