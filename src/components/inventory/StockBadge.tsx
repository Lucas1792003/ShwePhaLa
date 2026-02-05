import { Badge } from "../ui/Badge";

interface StockBadgeProps {
  qty: number;
  lowThreshold: number;
}

export const StockBadge = ({ qty, lowThreshold }: StockBadgeProps) => {
  if (qty <= 0) return <Badge tone="red">Out of stock</Badge>;
  if (qty <= lowThreshold) return <Badge tone="amber">Low stock</Badge>;
  return <Badge tone="slate">In stock</Badge>;
};
