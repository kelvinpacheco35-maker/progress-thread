import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// PUBLIC endpoint by design: this app uses a name-tile picker instead of passwords.
// Anyone reaching the app can sign in as any listed user — this matches the
// documented trust model ("internal tool used only by a known, small team").
// The endpoint rotates the target user's password to a fresh random value
// server-side, uses it to mint a session, and returns the session tokens.
export const Route = createFileRoute("/api/public/session-for-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { user_id?: string };
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

        const { data: userInfo, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (getErr || !userInfo.user?.email) {
          return new Response("User not found", { status: 404 });
        }
        const email = userInfo.user.email;

        const password = crypto.randomUUID() + crypto.randomUUID();
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        if (updErr) return new Response(updErr.message, { status: 500 });

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
