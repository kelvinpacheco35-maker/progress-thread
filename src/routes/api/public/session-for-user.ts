import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// PUBLIC endpoint: sign in as a listed user. If a password has been set for
// the target user (profiles.has_password = true), verify it via Supabase
// Auth's signInWithPassword. Otherwise rotate the password to a random value
// and sign in — preserving the one-click experience.
export const Route = createFileRoute("/api/public/session-for-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { user_id?: string; password?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const userId = body.user_id;
        if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
          return new Response("Invalid user_id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Load profile: active check + password-required flag.
        const { data: profile, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, deactivated_at, has_password")
          .eq("id", userId)
          .maybeSingle();
        if (pErr) return new Response(pErr.message, { status: 500 });
        if (!profile) return new Response("User not found", { status: 404 });
        if ((profile as { deactivated_at: string | null }).deactivated_at) {
          return new Response("Account is deactivated", { status: 403 });
        }

        // Need the user's email either way.
        const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (uErr || !userRes.user?.email) {
          return new Response(uErr?.message ?? "User not found", { status: uErr ? 500 : 404 });
        }
        const email = userRes.user.email;

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabaseAnon = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (supabaseKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
                headers.delete("Authorization");
              }
              headers.set("apikey", supabaseKey);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const hasPassword = !!(profile as { has_password: boolean }).has_password;
        let password: string;

        if (hasPassword) {
          if (typeof body.password !== "string" || body.password.length === 0) {
            return new Response("Password required", { status: 401 });
          }
          password = body.password;
        } else {
          // Rotate to a fresh random password and sign in with it.
          password = crypto.randomUUID() + crypto.randomUUID();
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
          if (updErr) return new Response(updErr.message, { status: 500 });
        }

        const { data: signIn, error: signErr } = await supabaseAnon.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr || !signIn.session) {
          const msg = hasPassword ? "Incorrect password" : (signErr?.message ?? "Sign-in failed");
          return new Response(msg, { status: hasPassword ? 401 : 500 });
        }

        return Response.json({
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
          expires_at: signIn.session.expires_at,
          expires_in: signIn.session.expires_in,
          token_type: signIn.session.token_type,
          user: signIn.session.user,
        });
      },
    },
  },
});
