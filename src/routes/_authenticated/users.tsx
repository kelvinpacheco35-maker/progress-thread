import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateUser,
  adminUpdateUser,
  adminSetDeactivated,
  adminSetPassword,
  adminDeleteUser,
  adminListUsers,
  adminListAudit,
  type AdminUser,
} from "@/lib/users.functions";
import { SITES, type Site } from "@/lib/ci";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Power, KeyRound, Trash2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  ssr: false,
  head: () => ({ meta: [{ title: "Users — CI Status Tracker" }] }),
  // Server-side guard (runs before render): non-admins are redirected away.
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (error || !isAdmin) throw redirect({ to: "/my-projects" });
  },
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchUsers = useServerFn(adminListUsers);
  const fetchAudit = useServerFn(adminListAudit);
  const createUser = useServerFn(adminCreateUser);
  const updateUser = useServerFn(adminUpdateUser);
  const setDeactivated = useServerFn(adminSetDeactivated);
  const setPassword = useServerFn(adminSetPassword);
  const deleteUser = useServerFn(adminDeleteUser);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/my-projects", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });
  const { data: audit } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => fetchAudit(),
    enabled: isAdmin,
  });

  // --- Add form ---
  const [fullName, setFullName] = useState("");
  const [site, setSite] = useState<Site | "">("");
  const [role, setRole] = useState<"admin" | "contributor">("contributor");
  const [submitting, setSubmitting] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-users"] }),
      qc.invalidateQueries({ queryKey: ["admin-audit"] }),
      qc.invalidateQueries({ queryKey: ["picker-users"] }),
      qc.invalidateQueries({ queryKey: ["profiles"] }),
    ]);
  };

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
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Edit dialog ---
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editSite, setEditSite] = useState<Site | "">("");
  const [editRole, setEditRole] = useState<"admin" | "contributor">("contributor");
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setEditName(u.full_name);
    setEditSite(u.site);
    setEditRole(u.is_admin ? "admin" : "contributor");
  };
  const saveEdit = async () => {
    if (!editing || !editSite) return;
    setEditBusy(true);
    try {
      await updateUser({
        data: { id: editing.id, full_name: editName.trim(), site: editSite, role: editRole },
      });
      toast.success("User updated");
      setEditing(null);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditBusy(false);
    }
  };

  // --- Password dialog ---
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const savePassword = async (clear = false) => {
    if (!pwUser) return;
    if (!clear && pwValue.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    setPwBusy(true);
    try {
      await setPassword({ data: { id: pwUser.id, password: clear ? null : pwValue } });
      toast.success(clear ? "Password removed" : "Password set");
      setPwUser(null);
      setPwValue("");
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPwBusy(false);
    }
  };

  // --- Delete dialog ---
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [deleteInfo, setDeleteInfo] = useState<{ projects: number; updates: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = (u: AdminUser) => {
    setDeleting(u);
    setReassignTo("");
    setDeleteInfo(null);
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await deleteUser({
        data: { id: deleting.id, reassign_to: reassignTo || null },
      });
      if (!res.ok && res.needs_reassign) {
        setDeleteInfo({ projects: res.projects, updates: res.updates });
        return;
      }
      toast.success("User deleted");
      setDeleting(null);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleDeactivate = async (u: AdminUser) => {
    try {
      await setDeactivated({ data: { id: u.id, deactivated: !u.deactivated } });
      toast.success(u.deactivated ? "Reactivated" : "Deactivated");
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (loading || !isAdmin) return null;
  const currentId = user?.id;
  const reassignChoices = (users ?? []).filter(
    (u) => !u.deactivated && u.id !== deleting?.id,
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage team members, roles, passwords, and access. Admins only.
        </p>
      </div>

      {/* Add user */}
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

      {/* Team list */}
      <Card>
        <CardHeader>
          <CardTitle>Team ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => {
                const isSelf = u.id === currentId;
                return (
                  <TableRow key={u.id} className={u.deactivated ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm">{u.site}</TableCell>
                    <TableCell>
                      <span
                        className={
                          u.is_admin
                            ? "text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary"
                            : "text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground"
                        }
                      >
                        {u.is_admin ? "Admin" : "Contributor"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.deactivated ? (
                        <span className="text-xs text-destructive font-medium">Deactivated</span>
                      ) : (
                        <span className="text-xs text-green-700 font-medium">Active</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.has_password ? (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <Lock className="h-3 w-3" /> Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Unlock className="h-3 w-3" /> None
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setPwUser(u);
                            setPwValue("");
                          }}
                          title="Set password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleDeactivate(u)}
                          disabled={isSelf}
                          title={u.deactivated ? "Reactivate" : "Deactivate"}
                        >
                          <Power className={`h-4 w-4 ${u.deactivated ? "text-destructive" : ""}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDelete(u)}
                          disabled={isSelf}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit */}
      <Card>
        <CardHeader>
          <CardTitle>Recent admin activity</CardTitle>
          <CardDescription>Last 100 admin actions.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {(audit ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
          )}
          {(audit ?? []).map((a) => (
            <div key={a.id} className="py-2 flex items-start justify-between gap-4">
              <div className="text-sm">
                <span className="font-medium">{a.actor_name}</span>{" "}
                <span className="text-muted-foreground">{a.action.replace(/_/g, " ")}</span>
                {a.target_name && (
                  <>
                    {" "}
                    <span className="font-medium">{a.target_name}</span>
                  </>
                )}
                {a.details && (
                  <div className="text-xs text-muted-foreground mt-0.5">{a.details}</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={editSite} onValueChange={(v) => setEditSite(v as Site)}>
                <SelectTrigger>
                  <SelectValue />
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
              <Label>Role</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as "admin" | "contributor")}
                disabled={editing?.id === currentId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {editing?.id === currentId && (
                <p className="text-xs text-muted-foreground">You can't change your own role.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={editBusy}>
              {editBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password dialog */}
      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password for {pwUser?.full_name}</DialogTitle>
            <DialogDescription>
              Leave blank and click Remove to allow one-click sign-in again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="At least 4 characters"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPwUser(null)}>
              Cancel
            </Button>
            {pwUser?.has_password && (
              <Button variant="destructive" onClick={() => savePassword(true)} disabled={pwBusy}>
                Remove password
              </Button>
            )}
            <Button onClick={() => savePassword(false)} disabled={pwBusy || pwValue.length < 4}>
              {pwBusy ? "Saving…" : "Save password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.full_name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the account. Their projects and updates are preserved. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteInfo && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <p>
                This user owns <strong>{deleteInfo.projects}</strong> project(s) and{" "}
                <strong>{deleteInfo.updates}</strong> update(s). Reassign them to another user
                before deletion.
              </p>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Reassign to…" />
                </SelectTrigger>
                <SelectContent>
                  {reassignChoices.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} — {u.site}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBusy || (deleteInfo !== null && !reassignTo)}
            >
              {deleteBusy ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
