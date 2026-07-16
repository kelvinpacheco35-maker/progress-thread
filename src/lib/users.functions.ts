import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITES, type Site } from "@/lib/ci";

export type PickerUser = {
  id: string;
  full_name: string;
  site: Site;
  is_admin: boolean;
};

// PUBLIC — the login screen needs this before anyone is signed in.
// Returns only non-sensitive fields (no emails).
export const listPickerUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<PickerUser[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, site"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    return (profiles ?? [])
      .map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string) ?? "",
        site: p.site as Site,
        is_admin: adminSet.has(p.id as string),
      }))
      .sort((a, b) => a.site.localeCompare(b.site) || a.full_name.localeCompare(b.full_name));
  },
);

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 40) || "user";
}

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
    // Verify caller is admin (uses caller's RLS-scoped client)
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only admins can add users");

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

    // handle_new_user trigger inserts profile + contributor role. Upgrade to admin if asked.
    if (data.role === "admin") {
      const { error: upErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (upErr) throw new Error(upErr.message);
    }

    return { ok: true as const, id: created.user.id };
  });
