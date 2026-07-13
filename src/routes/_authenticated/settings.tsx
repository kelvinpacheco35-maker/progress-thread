import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { redeemAdminCode } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — CI Status Tracker" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, isAdmin, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const redeem = useServerFn(redeemAdminCode);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await redeem({ data: { code } });
      if (!res.ok) return toast.error(res.error);
      toast.success("Admin access granted");
      setCode("");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Your account and access.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Name:</span> {profile?.full_name}</div>
          <div><span className="text-muted-foreground">Site:</span> {profile?.site}</div>
          <div><span className="text-muted-foreground">Role:</span> {isAdmin ? "Admin" : "Contributor"}</div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Admin access</CardTitle>
            <CardDescription>Enter the admin setup code to unlock the All Projects view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Admin code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} type="password" />
            </div>
            <Button onClick={submit} disabled={saving || !code.trim()}>{saving ? "Verifying…" : "Grant admin access"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
