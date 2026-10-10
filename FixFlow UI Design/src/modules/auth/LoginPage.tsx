import { useState } from "react";
import { useStore } from "../../app/store";
import { DEFAULT_PATH } from "../../app/router";
import { navigate as go } from "../../app/router";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../persistence/seedData";
import { Button, Card, Field, TextInput } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";

/**
 * Sign-in screen.
 *
 * NOTE ON SECURITY: this is a local demonstration. Credentials are checked in
 * the browser against the seeded `demoPassword` field, and the session is kept
 * in React state. It is NOT authentication — anyone can read the stored data.
 * The production build must verify credentials server-side and issue a signed
 * session that every request is authorised against.
 */
export function LoginPage() {
  const { login, db } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter both your email address and password.");
      return;
    }
    setBusy(true);
    const result = login(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    go(result.value.role === "customer" ? "/portal" : DEFAULT_PATH);
  };

  return (
    <div className="app auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand">
          <div className="brand auth-logo-row">
            <div className="logo">
              <Icon name="tool" size={22} />
            </div>
            <div>
              <strong>{db.business.name}</strong>
              <small>{db.business.tagline}</small>
            </div>
          </div>
          <div className="auth-message">
            <span className="auth-kicker">ONE CONNECTED WORKFLOW</span>
            <h1>Run your repair business with clarity.</h1>
            <p>Repairs, inventory, sales and customer care — organized intelligently in one reliable workspace.</p>
          </div>
          <div className="auth-flow">
            {(
              [
                ["Repair intake", "tool"],
                ["Smart diagnosis", "brain"],
                ["Payment & warranty", "shield"],
              ] as const
            ).map(([label, icon], index) => (
              <div key={label}>
                <span>
                  <Icon name={icon} />
                </span>
                <strong>{label}</strong>
                {index < 2 && <Icon name="arrow" size={14} />}
              </div>
            ))}
          </div>
          <div className="auth-trust">
            <Icon name="alert" />
            <span>
              <strong>Local demonstration build</strong>
              <small>
                Data is stored in this browser under <code>{db ? "fixflow.demo.v1" : ""}</code>. Sign-in is simulated —
                accounts are not protected in this build.
              </small>
            </span>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <Card className="login-card">
          <div className="login-heading">
            <span>WELCOME BACK</span>
            <h2>Sign in to {db.business.name}</h2>
            <p>Use a demonstration account below, or enter credentials manually.</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <Icon name="alert" />
              <span>
                <strong>Unable to sign in</strong>
                {error}
              </span>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label="Email address" required>
              <div className="auth-input">
                <Icon name="users" />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  placeholder="name@company.com"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>

            <Field label="Password" required>
              <div className="auth-input">
                <Icon name="lock" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  placeholder="Enter your password"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            <Button type="submit" full>
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="demo-divider">
            <span>Demonstration accounts</span>
          </div>
          <div className="demo-roles">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className={email === account.email ? "selected" : ""}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                  setError("");
                }}
              >
                <span>
                  <Icon
                    name={
                      account.role === "Admin"
                        ? "shield"
                        : account.role === "Manager"
                          ? "branch"
                          : account.role === "Technician"
                            ? "tool"
                            : account.role === "Cashier"
                              ? "cash"
                              : "users"
                    }
                  />
                </span>
                <strong>{account.role}</strong>
                <small>{account.scope}</small>
              </button>
            ))}
          </div>
          <p className="demo-hint">
            Demo password: <strong>{DEMO_PASSWORD}</strong>
          </p>
        </Card>
        <p className="auth-footer">
          Prototype environment · Local browser storage · Not a secure authentication system
        </p>
      </div>
    </div>
  );
}
