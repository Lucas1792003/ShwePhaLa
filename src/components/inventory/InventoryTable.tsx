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
  onAdjust: (productId: string) => void;
}

export const InventoryTable = ({ rows, onAdjust }: InventoryTableProps) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>Category</TH>
          <TH>On-hand</TH>
          <TH>Last movement</TH>
          <TH></TH>
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
            <TD>
              <Button variant="secondary" size="sm" onClick={() => onAdjust(product.id)}>
                Adjust
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  </div>
);
