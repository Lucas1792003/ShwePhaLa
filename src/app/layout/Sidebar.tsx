import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useDataStore } from "../../stores/dataStore";
import { cn } from "../../lib/utils";
import type { Permission, Role } from "../../types";
import { hasPermission, ROUTE_PERMISSIONS } from "../../lib/permissions";
import { ShopSwitcher } from "./ShopSwitcher";
import { LanguageSwitcher } from "../../components/layout/LanguageSwitcher";
import { useTranslation } from "../../hooks/useTranslation";
import { useViewportWidth } from "../../hooks/useViewportWidth";

interface NavItem {
  to: string;
  labelKey: string;
  permission: Permission;
  icon: string;
  /** Optional role gate layered on top of the permission. The route guard
   * checks this too — see AppRouter. */
  allowedRoles?: Role[];
}

interface NavSection {
  titleKey?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    // Main navigation - no title
    items: [
      { to: "/app/dashboard", labelKey: "dashboard", permission: ROUTE_PERMISSIONS.dashboard, icon: "dashboard" },
      { to: "/app/pos", labelKey: "pos", permission: ROUTE_PERMISSIONS.pos, icon: "point_of_sale" },
    ],
  },
  {
    titleKey: "salesOperations",
    items: [
      { to: "/app/sales", labelKey: "salesHistory", permission: ROUTE_PERMISSIONS.sales, icon: "receipt_long" },
      { to: "/app/shifts", labelKey: "shifts", permission: ROUTE_PERMISSIONS.shifts, icon: "schedule" },
      { to: "/app/approvals", labelKey: "approvals", permission: ROUTE_PERMISSIONS.approvals, icon: "fact_check" },
      { to: "/app/barcode-labels", labelKey: "barcodeLabels", permission: ROUTE_PERMISSIONS.barcodeLabels, icon: "qr_code_2", allowedRoles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    titleKey: "inventorySection",
    items: [
      { to: "/app/inventory", labelKey: "inventory", permission: ROUTE_PERMISSIONS.inventory, icon: "inventory_2" },
      { to: "/app/transfers", labelKey: "transfers", permission: ROUTE_PERMISSIONS.transfers, icon: "swap_horiz" },
      { to: "/app/purchases", labelKey: "purchases", permission: ROUTE_PERMISSIONS.purchases, icon: "local_shipping" },
      { to: "/app/suppliers", labelKey: "suppliers", permission: ROUTE_PERMISSIONS.suppliers, icon: "handshake" },
    ],
  },
  {
    titleKey: "settings",
    items: [
      { to: "/app/admin/shops", labelKey: "shops", permission: ROUTE_PERMISSIONS.adminShops, icon: "store" },
      { to: "/app/admin/users", labelKey: "users", permission: ROUTE_PERMISSIONS.adminUsers, icon: "group" },
      { to: "/app/admin/products", labelKey: "products", permission: ROUTE_PERMISSIONS.adminProducts, icon: "inventory", allowedRoles: ["ADMIN", "MANAGER"] },
      // Unit Types + Pricing removed from sidebar — both surfaces are
      // now edited inline from the Product form (Units & Prices section).
      // The routes themselves still exist for direct linking / deep-links.
      { to: "/app/admin/audit", labelKey: "auditLog", permission: ROUTE_PERMISSIONS.adminAudit, icon: "policy" },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = "retails-shop.sidebarCollapsed";

const readSidebarCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};

export const Sidebar = () => {
  const navigate = useNavigate();
  const { currentUserId, logout } = useAuthStore();
  const setShopId = useAppStore((state) => state.setShopId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);
  const { t } = useTranslation();
  const viewportWidth = useViewportWidth();
  const isTabletNav = viewportWidth < 1024;
  const effectiveCollapsed = isTabletNav || isSidebarCollapsed;

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    } catch {
      // Ignore storage failures; the toggle still works for this session.
    }
  }, [isSidebarCollapsed]);

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    setShopId(null);
    navigate("/login");
  };

  return (
    <aside className={cn("sidebar print-hidden", effectiveCollapsed && "sidebar-collapsed")}>
      <div className="sidebar-header">
        {/* mix-blend-multiply is a safety net: if the PNG has a white
            background it blends into the sidebar's white panel; if it
            is already transparent the blend mode is a no-op. */}
        <img
          src="/logo_real.png"
          alt="Shwe Pha Lar logo"
          className="header-logo mix-blend-multiply"
        />
        <div className="sidebar-brand-copy">
          <div className="shopName">Shwe Pha Lar</div>
          <div className="shop-meta">Multi-shop console</div>
        </div>
        {!isTabletNav && (
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            aria-label={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            title={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          >
            <span className="material-symbols-rounded">
              {isSidebarCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
            </span>
          </button>
        )}
      </div>

      <div className="sidebar-content">
        <div className="sidebar-shop">
          <ShopSwitcher />
        </div>

        <nav className="nav">
          {navSections.map((section, sectionIndex) => {
            // Filter items by permission AND optional role gate.
            const visibleItems = section.items.filter((item) => {
              if (!hasPermission(currentUser, item.permission)) return false;
              if (item.allowedRoles && currentUser && !item.allowedRoles.includes(currentUser.role)) return false;
              return true;
            });

            // Skip section if no visible items.
            if (visibleItems.length === 0) return null;

            const sectionTitle = section.titleKey ? t("sidebar", section.titleKey) : undefined;
            const isCollapsed = sectionTitle ? collapsedSections.has(sectionTitle) : false;
            const showItems = isSidebarCollapsed || !isCollapsed;

            return (
              <div key={section.titleKey || `section-${sectionIndex}`} className="nav-section">
                {sectionTitle && !effectiveCollapsed && (
                  <button
                    type="button"
                    className="section-header"
                    onClick={() => toggleSection(sectionTitle)}
                  >
                    <span className="section-title">{sectionTitle}</span>
                    <span className={cn("material-symbols-rounded section-arrow", isCollapsed && "collapsed")}>
                      expand_more
                    </span>
                  </button>
                )}
                {showItems && (
                  <ul className="menu-list">
                    {visibleItems.map((item) => (
                      <li key={item.to} className="menu-item">
                        <NavLink
                          to={item.to}
                          className={({ isActive }) => cn("menu-link", isActive && "active")}
                          title={effectiveCollapsed ? t("sidebar", item.labelKey) : undefined}
                        >
                          <span className="material-symbols-rounded">{item.icon}</span>
                          <span className="menu-label">{t("sidebar", item.labelKey)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <LanguageSwitcher className="sidebar-language mb-3" />
        <div className="sidebar-user">
          <div className="user-name">{currentUser?.name ?? "User"}</div>
          <div className="user-role">{currentUser?.role ?? ""}</div>
        </div>
        <button
          type="button"
          className="logout-btn"
          onClick={handleLogout}
          title={effectiveCollapsed ? t("common", "logout") : undefined}
          aria-label={t("common", "logout")}
        >
          <span className="material-symbols-rounded">logout</span>
          <span>{t("common", "logout")}</span>
        </button>
      </div>
    </aside>
  );
};
