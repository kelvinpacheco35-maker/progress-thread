import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// PUBLIC endpoint: sign in as a listed user. If a password/PIN has been set
// for the target user by an admin, it must be supplied and is verified
// server-side before a session is minted. Deactivated users cannot sign in.
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

        // Enforce active profile
        const { data: profile, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, deactivated_at")
          .eq("id", userId)
          .maybeSingle();
        if (pErr) return new Response(pErr.message, { status: 500 });
        if (!profile) return new Response("User not found", { status: 404 });
        if ((profile as { deactivated_at: string | null }).deactivated_at) {
          return new Response("Account is deactivated", { status: 403 });
        }

        // Enforce password if set
        const { data: cred, error: cErr } = await supabaseAdmin
          .from("user_credentials")
          .select("password_hash, salt")
          .eq("user_id", userId)
          .maybeSingle();
        if (cErr) return new Response(cErr.message, { status: 500 });

        if (cred) {
          if (typeof body.password !== "string" || body.password.length === 0) {
            return new Response("Password required", { status: 401 });
          }
          const { verifyPassword } = await import("@/lib/password.server");
          const ok = verifyPassword(body.password, (cred as any).salt, (cred as any).password_hash);
          if (!ok) return new Response("Incorrect password", { status: 401 });
        }

        // Rotate the password AND fetch the user in one admin call.
        const password = crypto.randomUUID() + crypto.randomUUID();
        const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        if (updErr || !updated.user?.email) {
          return new Response(updErr?.message ?? "User not found", { status: updErr ? 500 : 404 });
        }
        const email = updated.user.email;

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

        const { data: signIn, error: signErr } = await supabaseAnon.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr || !signIn.session) {
          return new Response(signErr?.message ?? "Sign-in failed", { status: 500 });
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
