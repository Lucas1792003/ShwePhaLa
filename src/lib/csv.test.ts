import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv formula-injection guard", () => {
  it("prefixes a string cell starting with =, +, -, @, tab, or CR with a single quote", () => {
    const rows = [
      { name: "=cmd|'/c calc'!A1" },
      { name: "+1234" },
      { name: "-2+3" },
      { name: "@SUM(A1:A2)" },
      { name: "\tTabbed" },
    ];
    const csv = toCsv(rows, ["name"]);
    const lines = csv.split("\n").slice(1);
    expect(lines[0]).toBe("'=cmd|'/c calc'!A1");
    expect(lines[1]).toBe("'+1234");
    expect(lines[2]).toBe("'-2+3");
    expect(lines[3]).toBe("'@SUM(A1:A2)");
    expect(lines[4]).toBe("'\tTabbed");
  });

  it("does not guard a normal string, or a real number/negative number", () => {
    const rows = [{ name: "Ordinary product" }, { qty: -5 }, { qty: 42 }];
    expect(toCsv([rows[0]], ["name"]).split("\n")[1]).toBe("Ordinary product");
    expect(toCsv([rows[1]], ["qty"]).split("\n")[1]).toBe("-5");
    expect(toCsv([rows[2]], ["qty"]).split("\n")[1]).toBe("42");
  });

  it("still quote-wraps a guarded value that also contains a comma", () => {
    const csv = toCsv([{ name: "=A,B" }], ["name"]);
    expect(csv.split("\n")[1]).toBe('"\'=A,B"');
  });
});
