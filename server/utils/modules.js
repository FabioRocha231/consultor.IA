// Optional business modules, switched per deployment via ENABLED_MODULES.
// ponytail: env var, not a DB column — 1 deployment = 1 company (ADR-003),
// so whoever provisions the deployment decides. Move to Organization if one
// deployment ever serves more than one company.
const MODULE_TOOLS = {
  menu: ["getMenu", "getMenuInteractive"],
  orders: [
    "createOrder",
    "getOrderStatus",
    "listMyOrders",
    "updateOrderStatus",
  ],
};

/**
 * @returns {string[]} known modules enabled for this deployment. `orders`
 * implies `menu` because order items are priced from the menu.
 */
function enabledModules() {
  const modules = String(process.env.ENABLED_MODULES || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => Object.hasOwn(MODULE_TOOLS, name));
  if (modules.includes("orders")) modules.push("menu");
  return [...new Set(modules)];
}

function isModuleEnabled(name) {
  return enabledModules().includes(name);
}

/** Tools not owned by any module are always enabled. */
function isToolEnabled(toolName) {
  const owner = Object.keys(MODULE_TOOLS).find((name) =>
    MODULE_TOOLS[name].includes(toolName)
  );
  return !owner || isModuleEnabled(owner);
}

module.exports = { enabledModules, isModuleEnabled, isToolEnabled };
