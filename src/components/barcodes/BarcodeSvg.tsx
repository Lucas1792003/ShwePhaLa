import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeSvgProps {
  value: string;
  /** CODE128 supports alphanumerics — works for both numeric EAN-style
   * barcodes and alphanumeric SKUs (e.g. `BEE-001`). */
  format?: "CODE128" | "CODE39" | "EAN13" | "UPC";
  /** Width of a single bar unit (px). Higher = wider barcode. */
  width?: number;
  /** Height of the bars (px). */
  height?: number;
  /** Show the human-readable value beneath the bars. */
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

/**
 * jsbarcode-backed CODE128 SVG renderer. Renders into a real <svg/> via
 * a ref so jsbarcode can populate it. Re-renders only when inputs change.
 */
export const BarcodeSvg = ({
  value,
  format = "CODE128",
  width = 2,
  height = 50,
  displayValue = true,
  fontSize = 14,
  className,
}: BarcodeSvgProps) => {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        margin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // jsbarcode throws synchronously when the value cannot be encoded
      // (e.g. EAN13 needs exactly 12-13 numeric digits). Clear the SVG so
      // the caller can show an error fallback instead of a stale render.
      ref.current.innerHTML = "";
    }
  }, [value, format, width, height, displayValue, fontSize]);

  return <svg ref={ref} className={className} />;
};
