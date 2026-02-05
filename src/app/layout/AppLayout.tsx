import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export const AppLayout = () => (
  <div className="buyer-container">
    <Sidebar />
    <main className="main">
      <div className="app-content">
        <Outlet />
      </div>
    </main>
  </div>
);
