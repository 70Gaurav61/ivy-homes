import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { session, login, checking, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const location = useLocation();

  if (session) {
    const dest = location.state?.from?.pathname || "/listings";
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await login(email, password);
      console.log("Login Data:", data);
    } catch {
      // error is surfaced via context
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Sign in</h1>
        <div className="sub">One of your three demo accounts, plus the password from your registration email.</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo1@ivy.homes"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="submit" disabled={checking} style={{ width: "100%" }}>
            {checking ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
