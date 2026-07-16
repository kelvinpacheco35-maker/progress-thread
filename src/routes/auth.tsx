import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
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
import { PUBLISHED_APP_ORIGIN, redirectToPublishedAuthHost } from "@/lib/auth-host";

type AuthSearch = { reset?: string };

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — CI Status Tracker" }] }),
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    reset: typeof search.reset === "string" ? search.reset : undefined,
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [site, setSite] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ from: "/auth" }) as AuthSearch;

  useEffect(() => {
    redirectToPublishedAuthHost();
  }, []);

  useEffect(() => {
    if (search.reset === "success") {
      toast.success("Password updated — please sign in");
    }
  }, [search.reset]);

  useEffect(() => {
    if (user) navigate({ to: "/my-projects", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${PUBLISHED_APP_ORIGIN}/reset-password`,
        });
        // Generic message — do not reveal whether the email exists
        toast.success("If that email is registered, a reset link has been sent.");
        setMode("signin");
        return;
      }
      if (mode === "signup") {
        if (!fullName.trim()) return toast.error("Full name is required");
        if (!site) return toast.error("Site is required");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/my-projects`,
            emailRedirectTo: `${PUBLISHED_APP_ORIGIN}/my-projects`,
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
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Internal tool for tracking CI project status across sites."
              : mode === "signup"
              ? "Your name and site are required — they appear on every entry you submit."
              : "Enter your email and we'll send you a link to reset your password."}
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
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </div>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? "Please wait…"
                : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                ? "Create account"
                : "Send reset link"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {mode === "forgot" ? (
                <button type="button" className="text-primary underline" onClick={() => setMode("signin")}>
                  Back to sign in
                </button>
              ) : mode === "signin" ? (
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
