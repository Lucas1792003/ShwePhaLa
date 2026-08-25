export type CsvCell = string | number | boolean | null | undefined;

export const toCsv = (
  rows: Record<string, CsvCell>[],
  headers?: string[],
) => {
  const resolvedHeaders = headers ?? Object.keys(rows[0] ?? {});
  if (resolvedHeaders.length === 0) return "";
  const escapeValue = (value: unknown) => {
    const stringValue = String(value ?? "");
    // Formula-injection guard: a string cell (numbers/booleans never hit
    // this branch — they're never typeof "string") starting with one of
    // these is interpreted as a formula by Excel/Sheets when the CSV is
    // opened, which can execute arbitrary commands. A leading single
    // quote forces text interpretation; Excel hides it in the displayed
    // cell, so this is invisible for ordinary text.
    const guarded =
      typeof value === "string" && /^[=+\-@\t\r]/.test(stringValue) ? `'${stringValue}` : stringValue;
    if (/[",\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
    return guarded;
  };
  const lines = [resolvedHeaders.join(",")];
  rows.forEach((row) => {
    lines.push(resolvedHeaders.map((header) => escapeValue(row[header])).join(","));
  });
  return lines.join("\n");
};

export const downloadCsv = (
  filename: string,
  rows: Record<string, CsvCell>[],
  headers?: string[],
) => {
  const csv = toCsv(rows, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.length > 0) || rows.length > 0) {
    rows.push(row);
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted value.");
  }

  return rows;
};

export const parseCsvRecords = (text: string): Record<string, string>[] => {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header.length === 0)) {
    throw new Error("CSV headers cannot be blank.");
  }

  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
};
