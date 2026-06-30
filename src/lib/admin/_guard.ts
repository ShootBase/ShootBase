import type { StaffPermission } from "./permissions";

export async function requirePermission(
  supabase: any,
  userId: string,
  perm: StaffPermission,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_staff_permission", {
    _uid: userId,
    _perm: perm,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    await supabase.rpc("log_admin_action", {
      _action: "permission.denied",
      _entity_type: "permission",
      _entity_id: perm,
      _metadata: {},
    });
    throw new Error(`Forbidden: missing permission ${perm}`);
  }
}

export async function auditLog(
  supabase: any,
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await supabase.rpc("log_admin_action", {
    _action: action,
    _entity_type: entityType,
    _entity_id: entityId,
    _metadata: metadata,
  });
}
