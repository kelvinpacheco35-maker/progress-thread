import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITES, type Site } from "@/lib/ci";

export type PickerUser = {
  id: string;
  full_name: string;
  site: Site;
  is_admin: boolean;
  password_required: boolean;
};

export type AdminUser = {
  id: string;
  full_name: string;
  site: Site;
  is_admin: boolean;
  deactivated: boolean;
  has_password: boolean;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  actor_name: string;
  action: string;
  target_name: string | null;
  details: string | null;
  created_at: string;
};

// PUBLIC — sign-in picker. Excludes deactivated users. Reports whether a
// password is required (so the client can prompt), never the password itself.
export const listPickerUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<PickerUser[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: creds, error: cErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, site, deactivated_at"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("user_credentials").select("user_id"),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (cErr) throw new Error(cErr.message);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    const credSet = new Set((creds ?? []).map((c) => c.user_id as string));
    return (profiles ?? [])
      .filter((p) => !(p as { deactivated_at: string | null }).deactivated_at)
      .map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string) ?? "",
        site: p.site as Site,
        is_admin: adminSet.has(p.id as string),
        password_required: credSet.has(p.id as string),
      }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.full_name.localeCompare(b.full_name));
  },
);

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admins only");
}

async function actorName(supabaseAdmin: any, userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return (data?.full_name as string) ?? "Unknown admin";
}

async function logAction(
  supabaseAdmin: any,
  args: {
    actor_id: string;
    actor_name: string;
    action: string;
    target_user_id?: string | null;
    target_name?: string | null;
    details?: Record<string, unknown> | null;
  },
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: args.actor_id,
    actor_name: args.actor_name,
    action: args.action,
    target_user_id: args.target_user_id ?? null,
    target_name: args.target_name ?? null,
    details: args.details ?? null,
  });
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 40) || "user";
}

// ---------- Admin: list users (full) ----------
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: creds, error: cErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, site, deactivated_at, created_at"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("user_credentials").select("user_id"),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (cErr) throw new Error(cErr.message);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    const credSet = new Set((creds ?? []).map((c) => c.user_id as string));
    return (profiles ?? [])
      .map((p: any) => ({
        id: p.id as string,
        full_name: (p.full_name as string) ?? "",
        site: p.site as Site,
        is_admin: adminSet.has(p.id as string),
        deactivated: !!p.deactivated_at,
        has_password: credSet.has(p.id as string),
        created_at: p.created_at as string,
      }))
      .sort(
        (a, b) =>
          Number(a.deactivated) - Number(b.deactivated) ||
          a.site.localeCompare(b.site) ||
          a.full_name.localeCompare(b.full_name),
      );
  });

// ---------- Admin: audit log ----------
export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditEntry[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_name, action, target_name, details, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      actor_name: r.actor_name as string,
      action: r.action as string,
      target_name: (r.target_name as string) ?? null,
      details: r.details ? JSON.stringify(r.details) : null,
      created_at: r.created_at as string,
    }));
  });

// ---------- Admin: create user ----------
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { full_name: string; site: Site; role: "admin" | "contributor" }) => {
      const full_name = data.full_name?.trim();
      if (!full_name) throw new Error("Full name is required");
      if (!SITES.includes(data.site)) throw new Error("Invalid site");
      if (data.role !== "admin" && data.role !== "contributor") throw new Error("Invalid role");
      return { full_name, site: data.site, role: data.role };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = `${slugify(data.full_name)}.${crypto.randomUUID().slice(0, 8)}@ci-tracker.local`;
    const password = crypto.randomUUID() + crypto.randomUUID();

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, site: data.site },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    if (data.role === "admin") {
      const { error: upErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (upErr) throw new Error(upErr.message);
    }

    await logAction(supabaseAdmin, {
      actor_id: context.userId,
      actor_name: await actorName(supabaseAdmin, context.userId),
      action: "created",
      target_user_id: created.user.id,
      target_name: data.full_name,
      details: { site: data.site, role: data.role },
    });

    return { ok: true as const, id: created.user.id };
  });

// ---------- Admin: edit user ----------
export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; full_name: string; site: Site; role: "admin" | "contributor" }) => {
      if (!/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Invalid id");
      const full_name = data.full_name?.trim();
      if (!full_name) throw new Error("Full name is required");
      if (!SITES.includes(data.site)) throw new Error("Invalid site");
      if (data.role !== "admin" && data.role !== "contributor") throw new Error("Invalid role");
      return { id: data.id, full_name, site: data.site, role: data.role };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.full_name, site: data.site })
      .eq("id", data.id);
    if (pErr) throw new Error(pErr.message);

    // Role management: keep contributor row always; add/remove admin row.
    if (data.role === "admin") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.id, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      // Don't demote yourself.
      if (data.id === context.userId) throw new Error("You cannot remove your own admin role");
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.id)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }

    await logAction(supabaseAdmin, {
      actor_id: context.userId,
      actor_name: await actorName(supabaseAdmin, context.userId),
      action: "edited",
      target_user_id: data.id,
      target_name: data.full_name,
      details: { site: data.site, role: data.role },
    });
    return { ok: true as const };
  });

// ---------- Admin: deactivate / reactivate ----------
export const adminSetDeactivated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; deactivated: boolean }) => {
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Invalid id");
    return { id: data.id, deactivated: !!data.deactivated };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.deactivated && data.id === context.userId) {
      throw new Error("You cannot deactivate your own account");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error } = await supabaseAdmin
      .from("profiles")
      .update({ deactivated_at: data.deactivated ? new Date().toISOString() : null })
      .eq("id", data.id)
      .select("full_name")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await logAction(supabaseAdmin, {
      actor_id: context.userId,
      actor_name: await actorName(supabaseAdmin, context.userId),
      action: data.deactivated ? "deactivated" : "reactivated",
      target_user_id: data.id,
      target_name: (prof?.full_name as string) ?? null,
    });
    return { ok: true as const };
  });

// ---------- Admin: set/clear password ----------
async function hashPassword(password: string) {
  const { pbkdf2Sync, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

async function verifyPassword(password: string, salt: string, expected: string) {
  const { pbkdf2Sync, timingSafeEqual } = await import("node:crypto");
  const actual = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const exp = Buffer.from(expected, "hex");
  if (actual.length !== exp.length) return false;
  return timingSafeEqual(actual, exp);
}

export { verifyPassword };

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; password: string | null }) => {
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Invalid id");
    if (data.password !== null) {
      if (typeof data.password !== "string" || data.password.length < 4) {
        throw new Error("Password must be at least 4 characters, or null to remove");
      }
    }
    return { id: data.id, password: data.password };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let action: string;
    if (data.password === null) {
      const { error } = await supabaseAdmin.from("user_credentials").delete().eq("user_id", data.id);
      if (error) throw new Error(error.message);
      action = "password_removed";
    } else {
      const { salt, hash } = await hashPassword(data.password);
      const { error } = await supabaseAdmin
        .from("user_credentials")
        .upsert(
          { user_id: data.id, password_hash: hash, salt, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw new Error(error.message);
      action = "password_set";
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", data.id)
      .maybeSingle();

    await logAction(supabaseAdmin, {
      actor_id: context.userId,
      actor_name: await actorName(supabaseAdmin, context.userId),
      action,
      target_user_id: data.id,
      target_name: (prof?.full_name as string) ?? null,
    });
    return { ok: true as const };
  });

// ---------- Admin: delete user ----------
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; reassign_to?: string | null }) => {
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Invalid id");
    if (data.reassign_to && !/^[0-9a-f-]{36}$/i.test(data.reassign_to)) {
      throw new Error("Invalid reassignment target");
    }
    return { id: data.id, reassign_to: data.reassign_to ?? null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId) throw new Error("You cannot delete your own account");
    if (data.reassign_to && data.reassign_to === data.id) {
      throw new Error("Cannot reassign to the user being deleted");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check for owned entries
    const [{ count: pCount }, { count: uCount }] = await Promise.all([
      supabaseAdmin.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", data.id),
      supabaseAdmin.from("weekly_updates").select("id", { count: "exact", head: true }).eq("author_id", data.id),
    ]);
    const hasEntries = (pCount ?? 0) > 0 || (uCount ?? 0) > 0;

    if (hasEntries) {
      if (!data.reassign_to) {
        return {
          ok: false as const,
          needs_reassign: true,
          projects: pCount ?? 0,
          updates: uCount ?? 0,
        };
      }
      // Verify target exists
      const { data: target, error: tErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("id", data.reassign_to)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!target) throw new Error("Reassignment target not found");

      const { error: e1 } = await supabaseAdmin
        .from("projects")
        .update({ owner_id: data.reassign_to })
        .eq("owner_id", data.id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabaseAdmin
        .from("weekly_updates")
        .update({ author_id: data.reassign_to })
        .eq("author_id", data.id);
      if (e2) throw new Error(e2.message);
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", data.id)
      .maybeSingle();

    // Delete the auth user. Profile / roles / credentials cascade.
    const { error: dErr } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (dErr) throw new Error(dErr.message);

    await logAction(supabaseAdmin, {
      actor_id: context.userId,
      actor_name: await actorName(supabaseAdmin, context.userId),
      action: "deleted",
      target_user_id: data.id,
      target_name: (prof?.full_name as string) ?? null,
      details: { reassigned_to: data.reassign_to },
    });

    return { ok: true as const, needs_reassign: false as const };
  });
