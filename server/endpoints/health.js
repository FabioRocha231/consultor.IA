function healthEndpoints(app) {
  if (!app) return;

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json({ status: "ready" });
  });
}

module.exports = {
  healthEndpoints,
};
