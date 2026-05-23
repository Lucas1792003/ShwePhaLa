import { Link } from "react-router-dom";
import { useDataStore } from "../../stores/dataStore";
import { Badge } from "../ui/Badge";
import { Drawer } from "../ui/Drawer";
import { ReceiptDetail } from "../receipt/ReceiptDetail";

interface SaleDetailDrawerProps {
  open: boolean;
  saleId: string | null;
  onClose: () => void;
}

export const SaleDetailDrawer = ({ open, saleId, onClose }: SaleDetailDrawerProps) => {
  const sale = useDataStore((state) => state.sales.find((item) => item.id === saleId));

  return (
    <Drawer
      open={open && !!saleId}
      title={sale ? `Receipt ${sale.receiptNo}` : "Receipt"}
      onClose={onClose}
      header={
        sale && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge tone={sale.status === "NORMAL" ? "green" : sale.status === "VOID" ? "red" : "amber"}>
              {sale.status}
            </Badge>
            <span>{sale.paymentMethod}</span>
          </div>
        )
      }
      footer={
        sale && (
          <Link
            to={`/app/sales/${sale.id}`}
            onClick={onClose}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Open full receipt →
          </Link>
        )
      }
    >
      {saleId && <ReceiptDetail saleId={saleId} variant="drawer" />}
    </Drawer>
  );
};
