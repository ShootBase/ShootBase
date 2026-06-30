export const STAFF_PERMISSIONS = [
  "users.view",
  "users.edit",
  "users.suspend",
  "users.delete",
  "tickets.view",
  "tickets.reply",
  "tickets.manage",
  "coins.view",
  "coins.adjust",
  "coins.refund",
  "coins.bank_transfers",
  "leads.manage",
  "verification.manage",
  "staff.manage",
  "settings.manage",
  "audit.view",
  "analytics.view",
  "notifications.view",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_ROLES = [
  "super_admin",
  "country_admin",
  "admin",
  "team_member",
  "support_agent",
  "moderator",
  "finance_manager",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  country_admin: "Country Admin",
  admin: "Admin",
  team_member: "Team Member",
  support_agent: "Support Agent",
  moderator: "Moderator",
  finance_manager: "Finance Manager",
};

export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  super_admin: [...STAFF_PERMISSIONS],
  country_admin: [
    "users.view",
    "users.edit",
    "users.suspend",
    "tickets.view",
    "tickets.reply",
    "tickets.manage",
    "coins.view",
    "coins.adjust",
    "coins.refund",
    "leads.manage",
    "verification.manage",
    "audit.view",
    "analytics.view",
    "notifications.view",
  ],
  admin: [
    "users.view",
    "users.edit",
    "users.suspend",
    "tickets.view",
    "tickets.reply",
    "tickets.manage",
    "leads.manage",
    "verification.manage",
    "audit.view",
    "analytics.view",
    "notifications.view",
  ],
  team_member: [
    "tickets.view",
    "tickets.reply",
    "tickets.manage",
    "analytics.view",
    "notifications.view",
  ],
  support_agent: ["users.view", "tickets.view", "tickets.reply"],
  moderator: ["users.view", "users.suspend", "leads.manage", "verification.manage"],
  finance_manager: ["users.view", "coins.view", "coins.adjust", "coins.refund"],
};

/**
 * Active platform countries. Stored as the full country name on every record;
 * the code is only used internally for compact URLs and switcher values.
 */
export const PLATFORM_COUNTRIES = [
  { code: "GB", name: "United Kingdom" },
  { code: "NG", name: "Nigeria" },
] as const;

export type CountryCode = (typeof PLATFORM_COUNTRIES)[number]["code"];
export type CountryName = (typeof PLATFORM_COUNTRIES)[number]["name"];

export function countryNameForCode(code: string | null | undefined): string | null {
  if (!code || code === "all") return null;
  return PLATFORM_COUNTRIES.find((c) => c.code === code)?.name ?? null;
}

export function countryCodeForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return PLATFORM_COUNTRIES.find((c) => c.name === name)?.code ?? null;
}

export type StaffContext = {
  isStaff: boolean;
  role: StaffRole | null;
  permissions: StaffPermission[];
  /** The country this staff member is assigned to (null = all countries / super admin) */
  country: string | null;
  /** Full country names this staff member may view */
  allowedCountries: string[];
};

export function hasPerm(ctx: StaffContext | null | undefined, perm: StaffPermission): boolean {
  if (!ctx?.isStaff) return false;
  if (ctx.role === "super_admin") return true;
  return ctx.permissions.includes(perm);
}
