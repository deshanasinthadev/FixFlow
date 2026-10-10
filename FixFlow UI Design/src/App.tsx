import { useEffect } from "react";
import { StoreProvider, useSession } from "./app/store";
import { LOGIN_PATH, navigate as go, useRoute, type Route } from "./app/router";
import { AppShell } from "./components/layout/AppShell";
import { navGroups } from "./app/navigation";
import { Card, EmptyState, PlannedModule } from "./components/ui";
import { LoginPage } from "./modules/auth/LoginPage";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { RepairsPage } from "./modules/repairs/RepairsPage";
import { RepairBoardPage } from "./modules/repairs/RepairBoardPage";
import { RepairIntakePage } from "./modules/repairs/RepairIntakePage";
import { RepairDetailPage } from "./modules/repairs/RepairDetailPage";
import { PortalPage } from "./modules/portal/PortalPage";

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}

function Router() {
  const session = useSession();
  const route = useRoute();

  // Signed-out users always land on the login screen; signed-in users never stay there.
  useEffect(() => {
    const path = window.location.hash.slice(1) || "/dashboard";
    if (!session && path !== LOGIN_PATH) go(LOGIN_PATH);
    if (session && path === LOGIN_PATH) go(session.role === "customer" ? "/portal" : "/dashboard");
  }, [session, route.path]);

  if (!session) return <LoginPage />;
  return <AppShell path={route.path}>{renderPage(route, session.role)}</AppShell>;
}

function renderPage(route: Route, role: string) {
  switch (route.section) {
    case "portal":
      return route.path === "/portal" ? <PortalPage /> : <NotFound path={route.path} />;

    case "dashboard":
      return route.path === "/dashboard" ? <DashboardPage /> : <NotFound path={route.path} />;

    case "repairs":
      if (route.path === "/repairs") return <RepairsPage />;
      if (route.path === "/repairs/new") return <RepairIntakePage />;
      if (route.path === "/repairs/board") return <RepairBoardPage />;
      if (route.id) return <RepairDetailPage repairId={route.id} />;
      return <NotFound path={route.path} />;

    default:
      return <PlannedRoute path={route.path} role={role} />;
  }
}

/**
 * Modules that are not built yet say so plainly and show the roadmap phase
 * from the navigation config, rather than rendering an empty screen.
 */
function PlannedRoute({ path, role }: { path: string; role: string }) {
  const items = navGroups(role as never, () => true).flatMap((group) => group.items);
  const entry = items.find((item) => item.path === path) ?? items.find((item) => path.startsWith(`${item.path}/`));

  return (
    <PlannedModule
      title={entry?.label ?? path.replace(/^\//, "").replace(/-/g, " ")}
      phase={entry?.phase ?? 2}
      description={
        entry
          ? "The navigation entry and permissions for this module are wired up; the screen itself is still to be built."
          : "This route is registered but has no screen yet."
      }
    />
  );
}

function NotFound({ path }: { path: string }) {
  return (
    <Card>
      <EmptyState
        icon="alert"
        title="Page not found"
        message={`No screen is registered for ${path}.`}
        action={
          <button type="button" className="btn primary" onClick={() => go("/dashboard")}>
            Back to dashboard
          </button>
        }
      />
    </Card>
  );
}
