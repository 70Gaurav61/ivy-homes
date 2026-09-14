import { Outlet } from "react-router-dom";
import Nav from "./Nav";

export default function Layout() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
