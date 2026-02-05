export const toCsv = (rows: Record<string, string | number | boolean | null | undefined>[]) => {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeValue = (value: unknown) => {
    const stringValue = String(value ?? "");
    if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
  };
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeValue(row[header])).join(","));
  });
  return lines.join("\n");
};

export const downloadCsv = (filename: string, rows: Record<string, string | number | boolean | null | undefined>[]) => {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
