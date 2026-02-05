import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useNavigate } from "react-router-dom";

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <Card>
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Button className="mt-4" onClick={() => navigate("/app/pos")}>Back to POS</Button>
    </Card>
  );
};
