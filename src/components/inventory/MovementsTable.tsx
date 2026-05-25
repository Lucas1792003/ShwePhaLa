import type { InventoryMovement, Product, StockMovementType } from "../../types";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { Badge } from "../ui/Badge";
import { formatDateTime } from "../../lib/utils";

interface MovementsTableProps {
  movements: InventoryMovement[];
  products: Product[];
}

const movementTypeLabels: Record<StockMovementType, string> = {
  PURCHASE_IN: "Purchase In",
  SALE_OUT: "Sale Out",
  TRANSFER_OUT: "Transfer Out",
  TRANSFER_IN: "Transfer In",
  ADJUSTMENT: "Adjustment",
  DAMAGE: "Damage/Expiry",
  RETURN_IN: "Customer Return",
  RETURN_OUT: "Return to Supplier",
};

const movementTypeColors: Record<StockMovementType, "green" | "red" | "blue" | "yellow" | "gray"> = {
  PURCHASE_IN: "green",
  SALE_OUT: "red",
  TRANSFER_OUT: "yellow",
  TRANSFER_IN: "blue",
  ADJUSTMENT: "gray",
  DAMAGE: "red",
  RETURN_IN: "green",
  RETURN_OUT: "red",
};

export const MovementsTable = ({ movements, products }: MovementsTableProps) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
    <Table className="min-w-[720px]">
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>Type</TH>
          <TH>Change</TH>
          <TH>Before / After</TH>
          <TH>Reason</TH>
          <TH>Date</TH>
        </TR>
      </THead>
      <TBody>
        {movements.map((movement) => {
          const product = products.find((item) => item.id === movement.productId);
          const qtyChange = movement.qtyChange ?? (movement as { qtyBaseUnits?: number }).qtyBaseUnits ?? 0;
          const isPositive = qtyChange > 0;
          const baseUnitName = product?.unitType || "unit";
          // Render the snapshot sub-line when migration 028 captured the
          // user-entered unit. The base-unit number on `qtyChange` is the
          // authoritative inventory delta; the snapshot is UI-only context.
          const snapshotName = movement.unitNameSnapshot;
          const snapshotQty = movement.selectedUnitQuantity;
          const snapshotBase = movement.unitBaseQuantitySnapshot;
          const showSnapshot =
            snapshotName !== undefined &&
            snapshotQty !== undefined &&
            snapshotBase !== undefined &&
            snapshotBase > 1;
          return (
            <TR key={movement.id}>
              <TD>{product?.name}</TD>
              <TD>
                <Badge color={movementTypeColors[movement.type] ?? "gray"}>
                  {movementTypeLabels[movement.type] ?? movement.type}
                </Badge>
              </TD>
              <TD>
                <div className={isPositive ? "text-green-600" : "text-red-600"}>
                  {isPositive ? "+" : ""}{qtyChange} {baseUnitName}
                </div>
                {showSnapshot && (
                  <div className="text-[11px] text-slate-500">
                    Entered as {snapshotQty} {snapshotName}
                  </div>
                )}
              </TD>
              <TD className="text-slate-500 text-xs">
                {movement.qtyBefore !== undefined && movement.qtyAfter !== undefined
                  ? `${movement.qtyBefore} → ${movement.qtyAfter}`
                  : "-"}
              </TD>
              <TD className="max-w-xs truncate">{movement.reason}</TD>
              <TD>{formatDateTime(movement.createdAt)}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  </div>
);
