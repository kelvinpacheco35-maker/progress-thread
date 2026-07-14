import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex gap-2 justify-center">
          <Button onClick={() => { router.invalidate(); reset(); }}>Try again</Button>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">Go home</Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CI Status Tracker" },
      { name: "description", content: "Track Continuous Improvement project status across SunOpta manufacturing sites." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "CI Status Tracker" },
      { property: "og:description", content: "Track Continuous Improvement project status across SunOpta manufacturing sites." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "CI Status Tracker" },
      { name: "twitter:description", content: "Track Continuous Improvement project status across SunOpta manufacturing sites." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6d56460b-dbc1-4294-86b9-80fa81f4a0fd/id-preview-df6e7fa9--14ee75ce-27a4-424a-a601-54bf0773385e.lovable.app-1783967511576.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6d56460b-dbc1-4294-86b9-80fa81f4a0fd/id-preview-df6e7fa9--14ee75ce-27a4-424a-a601-54bf0773385e.lovable.app-1783967511576.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AuthInvalidator() {
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthInvalidator />
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) { setPendingCount(0); return; }
    let cancelled = false;
    const refresh = async () => {
      const { count } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("pending_approval", true)
        .eq("archived", false);
      if (!cancelled) setPendingCount(count ?? 0);
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAdmin]);
  return (
    <div className="min-h-screen flex flex-col">
      {user && (
        <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="font-semibold tracking-tight text-base">
                CI Status Tracker
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink to="/my-projects">My Projects</NavLink>
                {isAdmin && (
                  <NavLink to="/all-projects">
                    <span className="inline-flex items-center gap-1.5">
                      All Projects
                      {pendingCount > 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--status-atrisk)] text-white"
                          title={`${pendingCount} closure${pendingCount === 1 ? "" : "s"} awaiting approval`}
                        >
                          {pendingCount}
                        </span>
                      )}
                    </span>
                  </NavLink>
                )}
                <NavLink to="/summary">Summary</NavLink>
                <NavLink to="/executive-summary">Executive Summary</NavLink>
              </nav>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {profile && (
                <span className="text-sidebar-foreground/80">
                  {profile.full_name} · {profile.site}
                  {isAdmin && <span className="ml-2 rounded px-1.5 py-0.5 bg-sidebar-accent text-xs">Admin</span>}
                </span>
              )}
              <Link to="/settings" className="text-sidebar-foreground/80 hover:text-sidebar-foreground">Settings</Link>
              <button
                onClick={() => signOut()}
                className="text-sidebar-foreground/80 hover:text-sidebar-foreground"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
      )}
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors"
      activeProps={{ className: "px-3 py-1.5 rounded bg-sidebar-accent text-sidebar-foreground font-medium" }}
    >
      {children}
    </Link>
  );
}
