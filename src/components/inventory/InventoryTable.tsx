import type { Product, ProductUnit } from "../../types";
import { Button } from "../ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { StockBadge } from "./StockBadge";
import { formatDateTime } from "../../lib/utils";
import { formatStockQuantity } from "../../features/inventory/stockDisplay";

interface InventoryRow {
  product: Product;
  qty: number;
  lastMovement?: string;
}

interface InventoryTableProps {
  rows: InventoryRow[];
  /**
   * All product units in the store. Used to render the human-friendly
   * "8 Package 22 Can" line under the raw base-unit count. Pass an empty
   * array (or omit) to fall back to the raw count + `product.unitType`.
   */
  productUnits?: ProductUnit[];
  /** Omit to render the table read-only (no Adjust action / column). */
  onAdjust?: (productId: string) => void;
}

export const InventoryTable = ({ rows, productUnits = [], onAdjust }: InventoryTableProps) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
    <Table className="min-w-[640px]">
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>Category</TH>
          <TH>On-hand</TH>
          <TH>Last movement</TH>
          {onAdjust && <TH></TH>}
        </TR>
      </THead>
      <TBody>
        {rows.map(({ product, qty, lastMovement }) => {
          // Inventory is stored in base units; the decomposed label is a
          // display-only convenience computed at render time.
          const decomposedLabel = formatStockQuantity(
            qty,
            productUnits,
            product.id,
            product.unitType,
          );
          const baseUnitLabel = product.unitType || "unit";
          // Suppress the second line when the decomposition matches the
          // primary "<n> <unit>" string — avoids noisy duplicates for
          // single-tier products (e.g. a product whose only unit is
          // baseQuantity 1).
          const primary = `${qty} ${baseUnitLabel}`.trim();
          const showSecondary = decomposedLabel !== String(qty) && decomposedLabel !== primary;
          return (
            <TR key={product.id}>
              <TD>{product.name}</TD>
              <TD>{product.category}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  <StockBadge qty={qty} lowThreshold={product.lowStockThreshold} />
                  <span className="font-medium">{qty} {baseUnitLabel}</span>
                </div>
                {showSecondary && (
                  <div className="mt-0.5 text-xs text-slate-500">{decomposedLabel}</div>
                )}
              </TD>
              <TD>{lastMovement ? formatDateTime(lastMovement) : "-"}</TD>
              {onAdjust && (
                <TD>
                  <Button variant="secondary" size="sm" onClick={() => onAdjust(product.id)}>
                    Adjust
                  </Button>
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  </div>
);
