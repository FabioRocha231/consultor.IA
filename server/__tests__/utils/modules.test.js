const {
  enabledModules,
  isModuleEnabled,
  isToolEnabled,
} = require("../../utils/modules");

describe("business modules", () => {
  const original = process.env.ENABLED_MODULES;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = original;
  });

  test("nothing enabled by default; generic tools stay on", () => {
    delete process.env.ENABLED_MODULES;
    expect(enabledModules()).toEqual([]);
    expect(isToolEnabled("getMenu")).toBe(false);
    expect(isToolEnabled("createOrder")).toBe(false);
    expect(isToolEnabled("createLead")).toBe(true);
  });

  test("parses list, ignores unknown names and casing", () => {
    process.env.ENABLED_MODULES = " Menu , bogus ";
    expect(enabledModules()).toEqual(["menu"]);
    expect(isToolEnabled("getMenuInteractive")).toBe(true);
    expect(isToolEnabled("createOrder")).toBe(false);
  });

  test("orders implies menu", () => {
    process.env.ENABLED_MODULES = "orders";
    expect(isModuleEnabled("menu")).toBe(true);
    expect(isToolEnabled("updateOrderStatus")).toBe(true);
  });
});
