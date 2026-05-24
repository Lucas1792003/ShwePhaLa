import { useMemo } from "react";
import { useDataStore } from "../../../stores/dataStore";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";

export const BarcodesAdminPage = () => {
  const barcodes = useDataStore((state) => state.barcodes);
  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const productMap = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product.name])), [products]);
  const unitMap = useMemo(
    () => Object.fromEntries(productUnits.map((unit) => [unit.id, unit.name])),
    [productUnits],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Barcodes" subtitle="Manage barcode mappings for products." />
      <Card>
        <Table>
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Barcode</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Type</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Product</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Unit</th>
            </tr>
          </thead>
          <tbody>
            {barcodes.map((barcode) => (
              <tr key={barcode.id} className="border-t border-slate-200/70">
                <td className="px-4 py-3 text-sm text-slate-700">{barcode.value}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{barcode.type}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{productMap[barcode.productId]}</td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {barcode.productUnitId ? unitMap[barcode.productUnitId] ?? "Unit" : "Default"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};
