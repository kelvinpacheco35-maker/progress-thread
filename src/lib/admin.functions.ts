import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const redeemAdminCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data, context }) => {
    const expected = process.env.ADMIN_SETUP_CODE;
    if (!expected) throw new Error("Admin setup is not configured");
    if (!data.code || data.code.trim() !== expected) {
      return { ok: false as const, error: "Invalid admin code" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
