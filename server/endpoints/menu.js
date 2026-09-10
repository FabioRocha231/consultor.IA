const { MenuItem, DEFAULT_ORGANIZATION_ID } = require("../models/menuItems");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { isSingleUserMode } = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");

function menuError(response, status, message) {
  return response.status(status).json({ success: false, error: message });
}

function menuEndpoints(app) {
  if (!app) return;

  app.get(
    "/menu/items",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const items = await MenuItem.list({
          organizationId: DEFAULT_ORGANIZATION_ID,
          category: request.query.category || null,
          availableOnly:
            request.query.available === "true" ||
            request.query.available === "1",
        });
        return response.status(200).json({ items });
      } catch (error) {
        console.error("Menu list failed:", error.message);
        return menuError(response, 500, "Failed to list menu items.");
      }
    }
  );

  app.post(
    "/menu/items",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const { item, error } = await MenuItem.create(reqBody(request) || {});
        if (!item) return menuError(response, 400, error);
        return response.status(200).json({ item });
      } catch (error) {
        console.error("Menu create failed:", error.message);
        return menuError(response, 500, "Failed to create menu item.");
      }
    }
  );

  app.get(
    "/menu/items/:id",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const item = await MenuItem.get({
          id: Number(request.params.id),
          organizationId: DEFAULT_ORGANIZATION_ID,
        });
        if (!item) return menuError(response, 404, "Menu item not found.");
        return response.status(200).json({ item });
      } catch (error) {
        console.error("Menu detail failed:", error.message);
        return menuError(response, 500, "Failed to get menu item.");
      }
    }
  );

  app.patch(
    "/menu/items/:id",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const { item, error } = await MenuItem.update({
          id: Number(request.params.id),
          organizationId: DEFAULT_ORGANIZATION_ID,
          ...(reqBody(request) || {}),
        });
        if (!item)
          return error === "Menu item not found."
            ? menuError(response, 404, error)
            : menuError(response, 400, error);
        return response.status(200).json({ item });
      } catch (error) {
        console.error("Menu update failed:", error.message);
        return menuError(response, 500, "Failed to update menu item.");
      }
    }
  );

  app.delete(
    "/menu/items/:id",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const deleted = await MenuItem.delete({
          id: Number(request.params.id),
          organizationId: DEFAULT_ORGANIZATION_ID,
        });
        if (!deleted) return menuError(response, 404, "Menu item not found.");
        return response.status(200).json({ success: true });
      } catch (error) {
        console.error("Menu delete failed:", error.message);
        return menuError(response, 500, "Failed to delete menu item.");
      }
    }
  );
}

module.exports = { menuEndpoints };
