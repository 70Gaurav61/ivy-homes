import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/listings", label: "Listings", icon: "🏠" },
  { to: "/rentals",  label: "Rentals",  icon: "🔑" },
  { to: "/projects", label: "Projects", icon: "🏗️" },
  { to: "/saved",    label: "Saved",    icon: "★" },
  { to: "/insights", label: "Insights", icon: "📊" },
];

export default function Nav() {
  const { session, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">
        Ivy Homes
        <small>property explorer</small>
      </div>

      <nav>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
            <span style={{ fontSize: 15 }}>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="session">
        {session?.user?.email && (
          <div title={session.user.email}>
            {session.user.email}
          </div>
        )}
        <button onClick={logout} id="signout-btn">Sign out</button>
      </div>
    </aside>
  );
}
