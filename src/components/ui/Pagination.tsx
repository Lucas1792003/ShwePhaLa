import { Button } from "./Button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export const Pagination = ({ page, totalPages, onChange }: PaginationProps) => (
  <div className="flex flex-wrap items-center justify-end gap-2">
    <Button variant="secondary" size="sm" onClick={() => onChange(Math.max(1, page - 1))}>
      Prev
    </Button>
    <span className="text-xs text-slate-500">
      Page {page} / {totalPages}
    </span>
    <Button variant="secondary" size="sm" onClick={() => onChange(Math.min(totalPages, page + 1))}>
      Next
    </Button>
  </div>
);
