import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPickerUsers, type PickerUser } from "@/lib/users.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Choose your name — CI Status Tracker" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fetchUsers = useServerFn(listPickerUsers);
  const [signingInId, setSigningInId] = useState<string | null>(null);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["picker-users"],
    queryFn: () => fetchUsers(),
  });

  useEffect(() => {
    if (user) navigate({ to: "/my-projects", replace: true });
  }, [user, navigate]);

  const signInAs = async (u: PickerUser) => {
    setSigningInId(u.id);
    try {
      const res = await fetch("/api/public/session-for-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.id }),
      });
      if (!res.ok) {
        toast.error(`Sign-in failed: ${await res.text()}`);
        return;
      }
      const session = await res.json();

      // The Lovable editor preview proxy blocks /auth/v1/user, which
      // supabase.auth.setSession() calls internally. On preview we write
      // the session directly to localStorage; supabase-js will pick it up
      // and auto-refresh on next initialization.
      //
      // On the published domain there is no proxy — use setSession() so the
      // client registers its refresh timer immediately and the access token
      // keeps refreshing throughout the session (~1h token lifetime).
      const isPreview = typeof window !== "undefined"
        && /(^|\.)lovable\.app$/i.test(window.location.hostname)
        && window.location.hostname.includes("id-preview");

      if (isPreview) {
        const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
        const storageKey = `sb-${projectRef}-auth-token`;
        window.localStorage.setItem(storageKey, JSON.stringify(session));
        window.location.replace("/my-projects");
      } else {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (error) {
          toast.error(`Sign-in failed: ${error.message}`);
          return;
        }
        window.location.replace("/my-projects");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setSigningInId(null);
    }
  };

  const bySite = new Map<string, PickerUser[]>();
  for (const u of users ?? []) {
    if (!bySite.has(u.site)) bySite.set(u.site, []);
    bySite.get(u.site)!.push(u);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-primary font-semibold mb-2">
            <span className="inline-block w-2 h-6 bg-primary rounded-sm" />
            CI Status Tracker
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Choose your name</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Click your tile to continue. New team members are added by an admin under Settings.
          </p>
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Loading team…</p>}
        {error && (
          <p className="text-center text-sm text-destructive">
            Couldn't load team list: {(error as Error).message}
          </p>
        )}

        {!isLoading && users && users.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No users yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {[...bySite.entries()].map(([site, list]) => (
            <div key={site}>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {site}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {list.map((u) => {
                  const busy = signingInId === u.id;
                  return (
                    <Card
                      key={u.id}
                      className="cursor-pointer hover:border-primary transition-colors data-[busy=true]:opacity-60"
                      data-busy={busy}
                      onClick={() => !signingInId && signInAs(u)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                          <span className="truncate">{u.full_name}</span>
                          {u.is_admin && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary">
                              Admin
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs">{u.site}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 pb-4">
                        <span className="text-xs text-primary">
                          {busy ? "Signing in…" : "Continue as this user →"}
                        </span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
