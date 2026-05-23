import { useParams } from "react-router-dom";
import { ReceiptDetail } from "../components/receipt/ReceiptDetail";

export const ReceiptPage = () => {
  const { saleId } = useParams();
  if (!saleId) return <div className="p-8 text-center text-slate-500">Receipt not found.</div>;
  return <ReceiptDetail saleId={saleId} backTo="/app/sales" />;
};
