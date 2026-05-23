import type { Product } from "../../types";
import { Button } from "../ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { StockBadge } from "./StockBadge";
import { formatDateTime } from "../../lib/utils";

interface InventoryRow {
  product: Product;
  qty: number;
  lastMovement?: string;
}

interface InventoryTableProps {
  rows: InventoryRow[];
  /** Omit to render the table read-only (no Adjust action / column). */
  onAdjust?: (productId: string) => void;
}

export const InventoryTable = ({ rows, onAdjust }: InventoryTableProps) => (
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
        {rows.map(({ product, qty, lastMovement }) => (
          <TR key={product.id}>
            <TD>{product.name}</TD>
            <TD>{product.category}</TD>
            <TD className="flex items-center gap-2">
              <StockBadge qty={qty} lowThreshold={product.lowStockThreshold} /> {qty}
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
        ))}
      </TBody>
    </Table>
  </div>
);
