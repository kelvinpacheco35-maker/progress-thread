import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITES } from "@/lib/ci";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — CI Status Tracker" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [site, setSite] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate({ to: "/my-projects", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim()) return toast.error("Full name is required");
        if (!site) return toast.error("Site is required");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/my-projects`,
            data: { full_name: fullName.trim(), site },
          },
        });
        if (error) return toast.error(error.message);
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return toast.error(error.message);
      }
      navigate({ to: "/my-projects", replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-12 bg-background">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader className="space-y-1">
          <div className="inline-flex items-center gap-2 text-primary font-semibold">
            <span className="inline-block w-2 h-6 bg-primary rounded-sm" />
            CI Status Tracker
          </div>
          <CardTitle className="text-xl pt-2">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Internal tool for tracking CI project status across sites."
              : "Your name and site are required — they appear on every entry you submit."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="site">Site</Label>
                  <Select value={site} onValueChange={setSite}>
                    <SelectTrigger id="site"><SelectValue placeholder="Select your site" /></SelectTrigger>
                    <SelectContent>
                      {SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {mode === "signin" ? (
                <>Need an account?{" "}
                  <button type="button" className="text-primary underline" onClick={() => setMode("signup")}>Sign up</button>
                </>
              ) : (
                <>Have an account?{" "}
                  <button type="button" className="text-primary underline" onClick={() => setMode("signin")}>Sign in</button>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
      <Link to="/" className="sr-only">Home</Link>
    </div>
  );
}
