import type { Sale } from "../../types";

export const summarizeShift = (sales: Sale[]) => {
  const totalSales = sales.reduce((sum, sale) => sum + sale.totalMmk, 0);
  const cashSales = sales.filter((sale) => sale.paymentMethod === "CASH").reduce((sum, sale) => sum + sale.totalMmk, 0);
  return {
    totalSales,
    cashSales,
    otherSales: totalSales - cashSales,
    count: sales.length,
  };
};
