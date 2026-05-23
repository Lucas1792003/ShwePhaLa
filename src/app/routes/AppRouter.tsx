import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layout/AppLayout";
import { RequireAuth } from "./guards/RequireAuth";
import { RequireRole } from "./guards/RequireRole";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { PosPage } from "../../features/pos/pages/PosPage";
import { SalesListPage } from "../../features/sales/pages/SalesListPage";
import { SaleDetailPage } from "../../features/sales/pages/SaleDetailPage";
import { ShiftsPage } from "../../features/shifts/pages/ShiftsPage";
import { InventoryPage } from "../../features/inventory/pages/InventoryPage";
import { TransfersPage } from "../../features/transfers/pages/TransfersPage";
import { PurchasesPage } from "../../features/purchases/pages/PurchasesPage";
import { ShopReportsPage } from "../../features/reports/pages/ShopReportsPage";
import { GlobalReportsPage } from "../../features/reports/pages/GlobalReportsPage";
import { ProfitReportsPage } from "../../features/reports/pages/ProfitReportsPage";
import { ApprovalsPage } from "../../features/approvals/pages/ApprovalsPage";
import { ShopsAdminPage } from "../../features/admin/pages/ShopsAdminPage";
import { UsersAdminPage } from "../../features/admin/pages/UsersAdminPage";
import { ProductsAdminPage } from "../../features/admin/pages/ProductsAdminPage";
import { BarcodesAdminPage } from "../../features/admin/pages/BarcodesAdminPage";
import { SuppliersPage } from "../../features/admin/pages/SuppliersPage";
import { PricingPage } from "../../features/admin/pages/PricingPage";
import { AuditLogPage } from "../../features/admin/pages/AuditLogPage";
import { CatalogPage } from "../../features/catalog/pages/CatalogPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { BarcodeLabelsPage } from "../../pages/BarcodeLabelsPage";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { useAuthStore } from "../../stores/authStore";
import { useDataStore } from "../../stores/dataStore";
import { ROUTE_PERMISSIONS } from "../../lib/permissions";

const DefaultAppRoute = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role === "BUYER") return <Navigate to="/app/catalog" replace />;
  return <Navigate to="/app/pos" replace />;
};

export const AppRouter = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/app"
      element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }
    >
      <Route index element={<DefaultAppRoute />} />
      <Route
        path="dashboard"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.dashboard}>
            <DashboardPage />
          </RequireRole>
        }
      />
      <Route
        path="pos"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.pos}>
            <PosPage />
          </RequireRole>
        }
      />
      <Route
        path="sales"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.sales}>
            <SalesListPage />
          </RequireRole>
        }
      />
      <Route
        path="sales/:saleId"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.saleDetail}>
            <SaleDetailPage />
          </RequireRole>
        }
      />
      <Route
        path="shifts"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.shifts}>
            <ShiftsPage />
          </RequireRole>
        }
      />
      <Route
        path="inventory"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.inventory}>
            <InventoryPage />
          </RequireRole>
        }
      />
      <Route
        path="transfers"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.transfers}>
            <TransfersPage />
          </RequireRole>
        }
      />
      <Route
        path="purchases"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.purchases}>
            <PurchasesPage />
          </RequireRole>
        }
      />
      <Route
        path="approvals"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.approvals}>
            <ApprovalsPage />
          </RequireRole>
        }
      />
      <Route
        path="reports"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.reports}>
            <ShopReportsPage />
          </RequireRole>
        }
      />
      <Route
        path="reports/profit"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.reportsProfit}>
            <ProfitReportsPage />
          </RequireRole>
        }
      />
      <Route
        path="catalog"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.catalog}>
            <CatalogPage />
          </RequireRole>
        }
      />
      <Route
        path="barcode-labels"
        element={
          <RequireRole allowed={["ADMIN", "MANAGER"]} permission={ROUTE_PERMISSIONS.barcodeLabels}>
            <BarcodeLabelsPage />
          </RequireRole>
        }
      />
      <Route
        path="suppliers"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.suppliers}>
            <SuppliersPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/shops"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminShops}>
            <ShopsAdminPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/users"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminUsers}>
            <UsersAdminPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/products"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminProducts}>
            <ProductsAdminPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/barcodes"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminBarcodes}>
            <BarcodesAdminPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/suppliers"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminSuppliers}>
            <SuppliersPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/pricing"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminPricing}>
            <PricingPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/reports"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminReports}>
            <GlobalReportsPage />
          </RequireRole>
        }
      />
      <Route
        path="admin/audit"
        element={
          <RequireRole permission={ROUTE_PERMISSIONS.adminAudit}>
            <AuditLogPage />
          </RequireRole>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/app" replace />} />
  </Routes>
);
