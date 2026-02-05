import { Button } from "../ui/Button";

interface ReprintButtonProps {
  onReprint: () => void;
}

export const ReprintButton = ({ onReprint }: ReprintButtonProps) => (
  <Button variant="secondary" onClick={onReprint}>Reprint receipt</Button>
);
