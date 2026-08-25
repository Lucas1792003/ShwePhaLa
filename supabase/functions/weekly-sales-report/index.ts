// ============================================================
// Edge Function: weekly-sales-report
//
// Called on a schedule (pg_cron — see supabase/schedule_weekly_sales_report.sql),
// every Monday at 00:00 Asia/Yangon time (Myanmar Time, UTC+6:30, no DST).
// Builds one receipt-line CSV per shop for the week that JUST ended
// (Mon 00:00 → Mon 00:00, MMT) and emails them all to every active ADMIN —
// mirroring the CSV shape src/features/sales/dailySalesReport.ts builds for
// the admin-triggered daily report, and the cron-auth/recipient-resolution
// pattern of rotate-audit-log. Email-only — never deletes or modifies sales
// data (unlike rotate-audit-log's archive-then-delete).
//
// Auth: the caller must present the project service-role key as
// `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (the cron job does).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

const csvCell = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value);
  // Formula-injection guard: a string field (product/shop/cashier name,
  // etc.) starting with one of these is interpreted as a formula by
  // Excel/Sheets when the CSV is opened. A leading single quote forces
  // text interpretation; Excel hides it in the displayed cell.
  const guarded = typeof value === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Same column order as src/features/sales/dailySalesReport.ts's
// dailySalesReportHeaders, minus "Report Date" (this report spans a week,
// not a single date) plus a "Report Week" label instead.
const CSV_HEADERS = [
  "Report Week",
  "Branch",
  "Branch Code",
  "Receipt No",
  "Sale Date Time",
  "Cashier Name",
  "Cashier Email",
  "Payment Method",
  "Sale Status",
  "Receipt Line",
  "Price Level",
  "Product Name",
  "Product SKU",
  "Product Alias",
  "Unit",
  "Quantity",
  "Unit Price MMK",
  "Item Discount %",
  "Line Total MMK",
  "Subtotal MMK",
  "Sale Discount MMK",
  "Cart Discount %",
  "Total MMK",
  "Paid MMK",
  "Change MMK",
];

// Myanmar Time is a fixed UTC+6:30 offset, no DST — safe to hardcode.
const MMT_OFFSET_MS = 6.5 * 60 * 60 * 1000;

/**
 * The most recent Monday 00:00, expressed as a real UTC instant, as if
 * "now" were wall-clock time in Asia/Yangon. Works by shifting `now` into
 * MMT, truncating to that shifted calendar's Monday-midnight using the
 * UTC-labelled Date fields (so getUTCDay()/setUTCHours() read the MMT wall
 * clock), then shifting back. This is what lets the report boundary stay
 * exactly aligned to real MMT weeks even if the cron fires a little early
 * or late — it doesn't matter WHEN this runs, only that it runs roughly
 * once a week; the boundary is always recomputed from a real calendar
 * Monday, not from "7 days before whenever this happened to execute".
 */
const mostRecentMondayMidnightMmt = (nowUtcMs: number): number => {
  const shifted = new Date(nowUtcMs + MMT_OFFSET_MS);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7; // 0=Sun..6=Sat → days since Monday
  shifted.setUTCDate(shifted.getUTCDate() - sinceMonday);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.getTime() - MMT_OFFSET_MS;
};

const formatMmtDate = (utcMs: number): string => {
  const shifted = new Date(utcMs + MMT_OFFSET_MS);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[shifted.getUTCMonth()]} ${shifted.getUTCDate()}, ${shifted.getUTCFullYear()}`;
};

const fileSafeShopKey = (shopCode: string | null | undefined, shopId: string): string => {
  const raw = (shopCode || shopId || "shop").trim();
  const normalised = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalised || "shop";
};

interface SaleRow {
  id: string;
  shop_id: string;
  receipt_no: string;
  cashier_id: string;
  status: string;
  subtotal_mmk: number;
  discount_mmk: number;
  cart_discount_pct: number | null;
  total_mmk: number;
  payment_method: string;
  paid_mmk: number;
  change_mmk: number;
  created_at: string;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  qty_units: number;
  unit_price_mmk: number;
  item_discount_pct: number | null;
  line_total_mmk: number;
  unit_label: string | null;
  unit_name_snapshot: string | null;
  price_level_name_snapshot: string | null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REPORT_EMAIL_FROM");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service configuration is missing." }, 500);
  }
  if (!resendApiKey || !fromEmail) {
    return jsonResponse({ error: "Email provider is not configured. Set RESEND_API_KEY and REPORT_EMAIL_FROM." }, 500);
  }

  // Only the cron job (holding the service-role key) may invoke this.
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const weekEndMs = mostRecentMondayMidnightMmt(Date.now());
  const weekStartMs = weekEndMs - 7 * 24 * 60 * 60 * 1000;
  const weekStartIso = new Date(weekStartMs).toISOString();
  const weekEndIso = new Date(weekEndMs).toISOString();
  const weekLabel = `${formatMmtDate(weekStartMs)} – ${formatMmtDate(weekEndMs - 1)}`;

  // 1. Sales in the target week.
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, shop_id, receipt_no, cashier_id, status, subtotal_mmk, discount_mmk, cart_discount_pct, total_mmk, payment_method, paid_mmk, change_mmk, created_at")
    .gte("created_at", weekStartIso)
    .lt("created_at", weekEndIso)
    .order("created_at", { ascending: false })
    .returns<SaleRow[]>();
  if (salesError) return jsonResponse({ error: salesError.message }, 500);

  if (!sales || sales.length === 0) {
    // Still email the admins — a silent no-op week is worth knowing about,
    // not indistinguishable from the job having failed to run at all.
    const { data: admins, error: adminError } = await supabase
      .from("users").select("email").eq("role", "ADMIN").eq("is_active", true).not("email", "is", null);
    if (adminError) return jsonResponse({ error: adminError.message }, 500);
    const recipients = [...new Set((admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e)))];
    if (recipients.length > 0) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: recipients,
          subject: `Shwe PhaLar weekly sales report — ${weekLabel} (no sales)`,
          text: `No sales were recorded across any branch for the week of ${weekLabel}.`,
        }),
      });
    }
    return jsonResponse({ sent: sales?.length ?? 0, weekStart: weekStartIso, weekEnd: weekEndIso, recipients: recipients.length });
  }

  // 2. Sale items for those sales.
  const saleIds = sales.map((s) => s.id);
  const { data: items, error: itemsError } = await supabase
    .from("sale_items")
    .select("id, sale_id, product_id, qty_units, unit_price_mmk, item_discount_pct, line_total_mmk, unit_label, unit_name_snapshot, price_level_name_snapshot")
    .in("sale_id", saleIds)
    .returns<SaleItemRow[]>();
  if (itemsError) return jsonResponse({ error: itemsError.message }, 500);

  // 3. Resolve names for a readable CSV (only the ids actually referenced).
  const shopIds = [...new Set(sales.map((s) => s.shop_id))];
  const cashierIds = [...new Set(sales.map((s) => s.cashier_id))];
  const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
  const [{ data: shops }, { data: cashiers }, { data: products }] = await Promise.all([
    shopIds.length ? supabase.from("shops").select("id, name, code").in("id", shopIds) : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
    cashierIds.length ? supabase.from("users").select("id, name, email").in("id", cashierIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string | null }[] }),
    productIds.length ? supabase.from("products").select("id, name, sku, alias_code").in("id", productIds) : Promise.resolve({ data: [] as { id: string; name: string; sku: string | null; alias_code: string | null }[] }),
  ]);
  const shopById = new Map((shops ?? []).map((s) => [s.id, s]));
  const cashierById = new Map((cashiers ?? []).map((c) => [c.id, c]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const itemsBySaleId = new Map<string, SaleItemRow[]>();
  for (const item of items ?? []) {
    const bucket = itemsBySaleId.get(item.sale_id);
    if (bucket) bucket.push(item);
    else itemsBySaleId.set(item.sale_id, [item]);
  }

  // 4. Build one CSV per shop (only shops with at least one sale).
  const salesByShop = new Map<string, SaleRow[]>();
  for (const sale of sales) {
    const bucket = salesByShop.get(sale.shop_id);
    if (bucket) bucket.push(sale);
    else salesByShop.set(sale.shop_id, [sale]);
  }

  interface ShopReport { shopId: string; shopName: string; shopCode: string; filename: string; csv: string; saleCount: number; rowCount: number }
  const shopReports: ShopReport[] = [];

  for (const [shopId, salesForShop] of salesByShop) {
    const shop = shopById.get(shopId);
    const rows: string[] = [];
    for (const sale of salesForShop) {
      const cashier = cashierById.get(sale.cashier_id);
      const saleFieldsBase = [
        weekLabel,
        shop?.name ?? sale.shop_id,
        shop?.code ?? "",
        sale.receipt_no,
        sale.created_at,
        cashier?.name ?? sale.cashier_id,
        cashier?.email ?? "",
        sale.payment_method,
        sale.status,
      ];
      const saleFieldsTail = [
        sale.subtotal_mmk,
        sale.discount_mmk,
        sale.cart_discount_pct ?? "",
        sale.total_mmk,
        sale.paid_mmk,
        sale.change_mmk,
      ];
      const saleItems = itemsBySaleId.get(sale.id) ?? [];
      if (saleItems.length === 0) {
        rows.push([...saleFieldsBase, "", "", "", "", "", "", "", "", "", ...saleFieldsTail].map(csvCell).join(","));
        continue;
      }
      saleItems.forEach((item, index) => {
        const product = productById.get(item.product_id);
        rows.push(
          [
            ...saleFieldsBase,
            index + 1,
            item.price_level_name_snapshot ?? "",
            product?.name ?? item.product_id,
            product?.sku ?? "",
            product?.alias_code ?? "",
            item.unit_name_snapshot ?? item.unit_label ?? "",
            item.qty_units,
            item.unit_price_mmk,
            item.item_discount_pct ?? "",
            item.line_total_mmk,
            ...saleFieldsTail,
          ]
            .map(csvCell)
            .join(","),
        );
      });
    }

    const shopKey = fileSafeShopKey(shop?.code, shopId);
    const weekStartDateOnly = new Date(weekStartMs).toISOString().slice(0, 10);
    shopReports.push({
      shopId,
      shopName: shop?.name ?? shopId,
      shopCode: shop?.code ?? "",
      filename: `weekly-sales-${shopKey}-${weekStartDateOnly}.csv`,
      csv: [CSV_HEADERS.join(","), ...rows].join("\n"),
      saleCount: salesForShop.length,
      rowCount: rows.length,
    });
  }
  shopReports.sort((a, b) => a.shopName.localeCompare(b.shopName));

  // 5. Recipients = every active ADMIN with an email.
  const { data: admins, error: adminError } = await supabase
    .from("users").select("email").eq("role", "ADMIN").eq("is_active", true).not("email", "is", null);
  if (adminError) return jsonResponse({ error: adminError.message }, 500);
  const recipients = [...new Set((admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e)))];
  if (recipients.length === 0) {
    return jsonResponse({ error: "No active admin email on file; report not sent." }, 422);
  }

  const totalSaleCount = sales.length;
  const totalRowCount = shopReports.reduce((sum, r) => sum + r.rowCount, 0);

  const textLines = [
    `Weekly sales report for ${weekLabel} (all branches).`,
    "",
    `Total sales: ${totalSaleCount}`,
    `Total CSV rows: ${totalRowCount}`,
    "",
    "Per-shop breakdown:",
    ...shopReports.map((r) => `  • ${r.shopName}${r.shopCode ? ` (${r.shopCode})` : ""} — ${r.saleCount} sale${r.saleCount === 1 ? "" : "s"}, ${r.rowCount} CSV rows — ${r.filename}`),
  ];
  const text = textLines.join("\n");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; max-width: 640px;">
      <h2 style="margin: 0 0 4px;">Weekly sales report</h2>
      <div style="color: #475569;">${escapeHtml(weekLabel)} — all branches</div>
      <table style="margin-top: 12px; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 2px 8px 2px 0; color: #475569;">Total sales</td><td style="padding: 2px 0; font-weight: 600;">${totalSaleCount}</td></tr>
        <tr><td style="padding: 2px 8px 2px 0; color: #475569;">Total CSV rows</td><td style="padding: 2px 0; font-weight: 600;">${totalRowCount}</td></tr>
      </table>
      <h3 style="margin: 16px 0 6px; font-size: 14px; color: #0f172a;">Per-shop breakdown</h3>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%;">
        <thead>
          <tr style="text-align: left; color: #475569; border-bottom: 1px solid #e2e8f0;">
            <th style="padding: 4px 8px 4px 0; font-weight: 600;">Shop</th>
            <th style="padding: 4px 8px; font-weight: 600; text-align: right;">Sales</th>
            <th style="padding: 4px 8px; font-weight: 600; text-align: right;">CSV rows</th>
            <th style="padding: 4px 0 4px 8px; font-weight: 600;">Attachment</th>
          </tr>
        </thead>
        <tbody>
          ${shopReports
            .map(
              (r) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 8px 6px 0;">${escapeHtml(r.shopName)}${r.shopCode ? ` <span style="color:#94a3b8;">(${escapeHtml(r.shopCode)})</span>` : ""}</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: 600;">${r.saleCount}</td>
                <td style="padding: 6px 8px; text-align: right;">${r.rowCount}</td>
                <td style="padding: 6px 0 6px 8px; color: #475569; font-family: monospace; font-size: 12px;">${escapeHtml(r.filename)}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p style="margin-top: 16px; font-size: 13px; color: #475569;">
        One receipt-line CSV per shop is attached. Sales data is unchanged by this report — nothing is deleted or modified.
      </p>
    </div>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject: `Shwe PhaLar weekly sales report — ${weekLabel}`,
      text,
      html,
      attachments: shopReports.map((r) => ({ filename: r.filename, content: toBase64(r.csv) })),
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse({ error: `Email send failed: ${errorText}` }, 502);
  }

  const result = await resendResponse.json();
  return jsonResponse({
    sent: true,
    recipients,
    id: result.id ?? null,
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    totalSaleCount,
    totalRowCount,
    shops: shopReports.length,
  });
});
