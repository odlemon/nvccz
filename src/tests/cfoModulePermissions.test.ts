import {
  CFO_MODULE_PERMISSIONS,
  isCfoUser,
  isModulePrivilegedUser,
  mergeCfoModulePermissions,
  userHasEffectivePermission,
} from "../config/cfoModulePermissions";

const cfoUser = {
  roleCode: "CFO",
  role: { name: "Chief Financial Officer", permissions: [] },
};

const regularUser = {
  roleCode: "FIN_ASST",
  role: { name: "Finance Assistant", permissions: [{ name: "view_accounting", value: true }] },
};

describe("cfoModulePermissions", () => {
  test("isCfoUser matches roleCode and role name", () => {
    expect(isCfoUser(cfoUser)).toBe(true);
    expect(isCfoUser({ roleCode: null, role: { name: "Chief Financial Officer" } })).toBe(true);
    expect(isCfoUser(regularUser)).toBe(false);
  });

  test("userHasEffectivePermission grants CFO accounting and events perms without JSON", () => {
    expect(userHasEffectivePermission(cfoUser, "manage_accounting")).toBe(true);
    expect(userHasEffectivePermission(cfoUser, "accounting.period_lock.override")).toBe(true);
    expect(userHasEffectivePermission(cfoUser, "view_business_operations")).toBe(true);
    expect(userHasEffectivePermission(cfoUser, "edit_events")).toBe(true);
    expect(userHasEffectivePermission(cfoUser, "manage_users")).toBe(false);
  });

  test("userHasEffectivePermission uses role JSON when present", () => {
    expect(userHasEffectivePermission(regularUser, "view_accounting")).toBe(true);
    expect(userHasEffectivePermission(regularUser, "manage_accounting")).toBe(false);
  });

  test("isModulePrivilegedUser includes CFO but not regular finance user", () => {
    expect(isModulePrivilegedUser(cfoUser)).toBe(true);
    expect(isModulePrivilegedUser({ roleCode: "ADMIN", role: { name: "Admin" } })).toBe(true);
    expect(isModulePrivilegedUser(regularUser)).toBe(false);
  });

  test("mergeCfoModulePermissions adds missing grants without dropping existing", () => {
    const merged = mergeCfoModulePermissions([
      { name: "manage_users", value: true },
      { name: "view_accounting", value: false },
    ]);
    const byName = new Map(merged.map((p) => [p.name, p.value]));
    expect(byName.get("manage_users")).toBe(true);
    expect(byName.get("view_accounting")).toBe(true);
    expect(byName.get("edit_events")).toBe(true);
    expect(merged.length).toBeGreaterThanOrEqual(CFO_MODULE_PERMISSIONS.length);
  });
});
