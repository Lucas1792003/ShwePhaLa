import { BarcodeInput } from "../forms/BarcodeInput";

interface BarcodeScanBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  packMode: boolean;
  onTogglePack: (value: boolean) => void;
}

export const BarcodeScanBox = ({ value, onChange, onSubmit, packMode, onTogglePack }: BarcodeScanBoxProps) => (
  <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>Scan barcodes and press Enter.</span>
      <label className="flex items-center gap-2 text-slate-600">
        <span>Pack mode</span>
        <input
          type="checkbox"
          checked={packMode}
          onChange={(event) => onTogglePack(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
        />
      </label>
    </div>
    <BarcodeInput value={value} onChange={onChange} onSubmit={onSubmit} />
  </div>
);
