import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// PUBLIC endpoint: sign in as a listed user. Includes per-user brute-force
// protection: after 5 consecutive failed password attempts, sign-in is locked
// for 15 minutes. Successful sign-in clears the counter.
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

        const { data: profile, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, deactivated_at, has_password")
          .eq("id", userId)
          .maybeSingle();
        if (pErr) return new Response(pErr.message, { status: 500 });
        if (!profile) return new Response("User not found", { status: 404 });
        if ((profile as { deactivated_at: string | null }).deactivated_at) {
          return new Response("Account is deactivated", { status: 403 });
        }

        const hasPassword = !!(profile as { has_password: boolean }).has_password;

        // Brute-force lockout check (password sign-in only).
        if (hasPassword) {
          const { data: lock } = await supabaseAdmin
            .from("auth_lockouts")
            .select("failed_attempts, locked_until")
            .eq("user_id", userId)
            .maybeSingle();
          const lockedUntil = lock?.locked_until ? new Date(lock.locked_until as string) : null;
          if (lockedUntil && lockedUntil.getTime() > Date.now()) {
            const mins = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
            return new Response(
              `Too many attempts — try again in ${mins} minute${mins === 1 ? "" : "s"}`,
              { status: 429 },
            );
          }
        }

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

        let password: string;

        if (hasPassword) {
          if (typeof body.password !== "string" || body.password.length === 0) {
            return new Response("Password required", { status: 401 });
          }
          password = body.password;
        } else {
          password = crypto.randomUUID() + crypto.randomUUID();
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
          if (updErr) return new Response(updErr.message, { status: 500 });
        }

        const { data: signIn, error: signErr } = await supabaseAnon.auth.signInWithPassword({
          email,
          password,
        });

        if (signErr || !signIn.session) {
          if (hasPassword) {
            // Record failed attempt & potentially lock out.
            const { data: existing } = await supabaseAdmin
              .from("auth_lockouts")
              .select("failed_attempts")
              .eq("user_id", userId)
              .maybeSingle();
            const attempts = ((existing?.failed_attempts as number | undefined) ?? 0) + 1;
            const shouldLock = attempts >= MAX_ATTEMPTS;
            const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
            await supabaseAdmin.from("auth_lockouts").upsert(
              {
                user_id: userId,
                failed_attempts: shouldLock ? 0 : attempts,
                locked_until: lockedUntil,
                last_failed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );

            if (shouldLock) {
              await supabaseAdmin.from("admin_audit_log").insert({
                actor_id: userId,
                actor_name: "system",
                action: "lockout",
                target_user_id: userId,
                target_name: (profile as { full_name: string | null }).full_name ?? null,
                details: { minutes: 15, reason: "5 failed password attempts" },
              });
              return new Response(
                "Too many attempts — try again in 15 minutes",
                { status: 429 },
              );
            }
            const remaining = MAX_ATTEMPTS - attempts;
            return new Response(
              `Incorrect password (${remaining} attempt${remaining === 1 ? "" : "s"} left)`,
              { status: 401 },
            );
          }
          return new Response(signErr?.message ?? "Sign-in failed", { status: 500 });
        }

        // Success — clear any lockout counter.
        if (hasPassword) {
          await supabaseAdmin
            .from("auth_lockouts")
            .delete()
            .eq("user_id", userId);
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
