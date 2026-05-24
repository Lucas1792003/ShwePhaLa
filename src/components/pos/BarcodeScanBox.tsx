import { BarcodeInput } from "../forms/BarcodeInput";

interface BarcodeScanBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const BarcodeScanBox = ({ value, onChange, onSubmit }: BarcodeScanBoxProps) => (
  <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
    <div className="text-xs text-slate-500">
      <span>Scan barcodes and press Enter.</span>
    </div>
    <BarcodeInput value={value} onChange={onChange} onSubmit={onSubmit} />
  </div>
);
