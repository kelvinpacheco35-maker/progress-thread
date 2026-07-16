import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminCreateUser, listPickerUsers, type PickerUser } from "@/lib/users.functions";
import { SITES, type Site } from "@/lib/ci";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — CI Status Tracker" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listPickerUsers);
  const createUser = useServerFn(adminCreateUser);

  const [fullName, setFullName] = useState("");
  const [site, setSite] = useState<Site | "">("");
  const [role, setRole] = useState<"admin" | "contributor">("contributor");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/my-projects", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data: users } = useQuery({
    queryKey: ["picker-users"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !site) {
      toast.error("Name and site are required");
      return;
    }
    setSubmitting(true);
    try {
      await createUser({ data: { full_name: fullName.trim(), site, role } });
      toast.success(`Added ${fullName.trim()}`);
      setFullName("");
      setSite("");
      setRole("contributor");
      await qc.invalidateQueries({ queryKey: ["picker-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !isAdmin) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everyone listed here appears on the sign-in screen. Only admins can add new users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>Name, site, and role. No password required.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site">Site</Label>
              <Select value={site} onValueChange={(v) => setSite(v as Site)}>
                <SelectTrigger id="site">
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {SITES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "contributor")}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add user"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(users ?? []).map((u: PickerUser) => (
            <div key={u.id} className="py-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{u.full_name}</div>
                <div className="text-xs text-muted-foreground">{u.site}</div>
              </div>
              <span
                className={
                  u.is_admin
                    ? "text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary"
                    : "text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground"
                }
              >
                {u.is_admin ? "Admin" : "Contributor"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
