# Replace password login with a user-picker

## What changes
- Remove the email/password sign-in, sign-up, and forgot/reset-password flows from the UI.
- `/auth` becomes a grid of tiles listing every existing user (Name — Site, with a Role badge). Clicking a tile signs that person in as themselves — no password.
- Admins get a new **Users** section under Settings with an "Add user" form (Full name, Site, Role: Admin/Contributor). No public self-service sign-up.
- Session persistence: the selected user is remembered until they explicitly Sign out (which clears it and returns them to the picker).
- All existing users, projects, weekly updates, and approvals stay exactly as they are. Roles (Admin vs Contributor) continue to gate All Projects, Executive Summary, approvals, etc., exactly as today.

## Important honesty about the security model
This does **not** remove the underlying Supabase Auth dependency — it hides it. The app still needs a real signed session for RLS (`auth.uid()`) and for the `requireSupabaseAuth`-protected server functions (approvals, admin actions) to work. Ripping Supabase Auth out entirely would mean rewriting every RLS policy and every server function, and would leave the app with no server-verifiable identity at all — anyone hitting the API could claim to be anyone.

So the mechanism will be:
- Every user keeps their `auth.users` row.
- Each user gets a stable, non-secret **passphrase derived from their user id** (stored server-side, never shown). Clicking a tile calls a server route that returns a fresh session for that user, and the client stores it like a normal Supabase session.
- To the user: no password, just click your name. To the backend: still a real authenticated session, so RLS and role checks keep working unchanged.

This matches what you asked for (frictionless, name-only "login", admin-managed users, roles preserved) and keeps the data model intact. It is explicitly **trust-based** — anyone who can reach the app can click any tile — which is the model you described ("internal tool used only by a known, small team").

## Technical details

### Backend
1. **Migration**: add `public.user_login_secrets(user_id uuid PK → auth.users, secret text not null, created_at timestamptz default now())`. GRANT nothing to `anon`/`authenticated` — only `service_role`. RLS enabled, no policies (server-only).
2. **Backfill**: for every current `auth.users` row, insert a random 32-byte secret and call `supabaseAdmin.auth.admin.updateUserById(id, { password: <secret> })` so existing accounts (Kelvin, Keely, etc.) all work through the new flow.
3. **Server route** `POST /api/session-for-user` (auth-free but same-origin only; validates a CSRF-style token issued by the page render): looks up the user's secret, calls `signInWithPassword` server-side, returns the session JSON. Client stores it via `supabase.auth.setSession(...)`.
4. **Server function** `adminCreateUser` (protected by `requireSupabaseAuth` + `has_role(admin)`): creates the `auth.users` row via `supabaseAdmin.auth.admin.createUser({ email_confirm: true, user_metadata: { full_name, site } })`, inserts a fresh secret, and assigns the requested role. The existing `handle_new_user` trigger creates the profile and default `contributor` role; the admin function then upserts `admin` when requested.
5. Keep `handle_new_user`, `has_role`, all RLS policies, and all existing server functions untouched.

### Frontend
1. `/auth` → replaced with `UserPickerPage`: loader fetches `profiles` + `user_roles` via a public server fn (returns only `id`, `full_name`, `site`, `is_admin` — no emails). Renders one tile per user, grouped by site, with a Role badge. Click → call `/api/session-for-user` → `supabase.auth.setSession` → navigate to `/my-projects`.
2. Delete `src/routes/reset-password.tsx`, remove all forgot-password / sign-up UI, delete `src/lib/auth-host.ts` and the preview-host redirect (no longer needed — no password fetch to fail).
3. **Sign out**: existing `signOut()` in `auth-context` already calls `supabase.auth.signOut()`; add `queryClient.clear()` + `navigate('/auth', { replace: true })` per the sign-out hygiene rule so Back can't restore protected state.
4. **New route** `_authenticated/users.tsx` (admin-only via `has_role` check in the loader): list all users + "Add user" form (Full name, Site select, Role radio). Calls `adminCreateUser`. On success, new user immediately appears on `/auth`.
5. Add a "Users" nav link in Settings visible only to admins.

### Files touched
- New: `supabase` migration, `src/lib/users.functions.ts`, `src/routes/api/session-for-user.ts`, `src/routes/_authenticated/users.tsx`, `src/components/user-picker.tsx`.
- Rewritten: `src/routes/auth.tsx`.
- Deleted: `src/routes/reset-password.tsx`, `src/lib/auth-host.ts`.
- Minor edits: `src/lib/auth-context.tsx` (sign-out hygiene), `src/routes/_authenticated/settings.tsx` (link to Users, drop admin-code card if you want — or keep it).

## Open questions before I build
1. **Admin bootstrap** — after this change, the only way to add users is from inside the app by an existing admin. Kelvin currently has `admin`, so that's fine. Confirm you want me to keep the existing `redeemAdminCode` mechanism as a break-glass, or remove it?
2. **Email field** — new users need *some* email to satisfy `auth.users`. OK for me to auto-generate `<slug>@ci-tracker.local` behind the scenes (never shown in the UI), so admins only type name + site + role?
3. **User order on the picker** — group by site with users alphabetical inside each site? Or one flat alphabetical list?
