import type { ProductUnit } from "../../types";
import { convertToBaseQuantity } from "../inventory/stockDisplay";

export interface UnitTransferLine {
  lineId?: string;
  productId: string;
  productUnitId?: string;
  selectedUnitQuantity?: number;
  requestedQty?: number;
}

export const getTransferLineUnit = (
  line: UnitTransferLine,
  productUnits: ProductUnit[],
): ProductUnit | undefined =>
  line.productUnitId
    ? productUnits.find((unit) => unit.id === line.productUnitId && unit.productId === line.productId)
    : undefined;

export const getTransferLineBaseQuantity = (
  line: UnitTransferLine,
  productUnits: ProductUnit[],
): number => {
  const unit = getTransferLineUnit(line, productUnits);
  if (unit) {
    return convertToBaseQuantity(line.selectedUnitQuantity ?? 0, unit);
  }
  const legacyQty = Number.isFinite(line.requestedQty ?? NaN) ? line.requestedQty ?? 0 : 0;
  return Math.max(0, Math.trunc(legacyQty));
};

export const getTransferProductBaseTotal = (
  lines: UnitTransferLine[],
  productId: string,
  productUnits: ProductUnit[],
  exceptLineId?: string,
): number =>
  lines
    .filter((line) => line.productId === productId && line.lineId !== exceptLineId)
    .reduce((total, line) => total + getTransferLineBaseQuantity(line, productUnits), 0);

export const getMaxTransferUnitQuantity = (
  lines: UnitTransferLine[],
  line: UnitTransferLine,
  productUnits: ProductUnit[],
  availableBaseQuantity: number,
): number => {
  const unit = getTransferLineUnit(line, productUnits);
  const factor = Math.max(1, Math.trunc(unit?.baseQuantity ?? 1));
  const otherBase = getTransferProductBaseTotal(lines, line.productId, productUnits, line.lineId);
  const remainingBase = Math.max(0, Math.trunc(availableBaseQuantity) - otherBase);
  return Math.floor(remainingBase / factor);
};

export const transferProductExceedsStock = (
  lines: UnitTransferLine[],
  productId: string,
  productUnits: ProductUnit[],
  availableBaseQuantity: number,
): boolean =>
  getTransferProductBaseTotal(lines, productId, productUnits) >
  Math.max(0, Math.trunc(availableBaseQuantity));
