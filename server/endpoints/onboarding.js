const prisma = require("../utils/prisma");
const { Organization } = require("../models/organization");
const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

const REQUIRED_COMPLETED_STEPS = [1, 2, 3, 4];
const VALID_TONES = {
  profissional: "Resposta profissional: ",
  amigavel: "Resposta amigável: ",
  comercial: "Resposta comercial: ",
  objetivo: "Resposta objetiva: ",
};

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function wizardStateOf(organization) {
  const state = organization?.wizardState || {};
  return {
    currentStep: Number.isInteger(state.currentStep) ? state.currentStep : 1,
    completedSteps: Array.isArray(state.completedSteps)
      ? state.completedSteps
      : [],
    formData:
      state.formData && typeof state.formData === "object"
        ? state.formData
        : {},
  };
}

function onboardingState(organization) {
  return {
    ...wizardStateOf(organization),
    publishedAt: organization?.publishedAt || null,
    organization: organization || null,
  };
}

function validateStatePatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { error: "Invalid onboarding state body." };

  const allowedFields = ["currentStep", "completedSteps", "formData"];
  if (
    Object.keys(body).length === 0 ||
    Object.keys(body).some((field) => !allowedFields.includes(field))
  )
    return { error: "Invalid onboarding state fields." };

  if (body.currentStep !== undefined) {
    if (
      !Number.isInteger(body.currentStep) ||
      body.currentStep < 1 ||
      body.currentStep > 7
    )
      return { error: "currentStep must be an integer between 1 and 7." };
  }

  if (body.completedSteps !== undefined) {
    if (
      !Array.isArray(body.completedSteps) ||
      !body.completedSteps.every(
        (step) => Number.isInteger(step) && step >= 1 && step <= 7
      )
    )
      return {
        error: "completedSteps must be an array of integers between 1 and 7.",
      };
  }

  if (
    body.formData !== undefined &&
    (!body.formData ||
      typeof body.formData !== "object" ||
      Array.isArray(body.formData))
  )
    return { error: "formData must be an object." };

  return { error: null };
}

function onboardingEndpoints(app) {
  if (!app) return;

  app.get("/onboarding/state", [validatedRequest], async (_, response) => {
    try {
      const organization = await currentOrganization();
      if (!organization)
        return response.status(404).json({ error: "No organization found." });
      response.status(200).json(onboardingState(organization));
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.patch(
    "/onboarding/state",
    [validatedRequest],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });

        const body = reqBody(request);
        const { error } = validateStatePatch(body);
        if (error) return response.status(400).json({ error });

        const existing = wizardStateOf(organization);
        const nextState = {
          currentStep: body.currentStep ?? existing.currentStep,
          completedSteps: body.completedSteps ?? existing.completedSteps,
          formData: body.formData
            ? { ...existing.formData, ...body.formData }
            : existing.formData,
        };

        const { organization: updated, error: updateError } =
          await Organization.update(organization.id, {
            wizardState: nextState,
          });
        if (!updated) return response.status(400).json({ error: updateError });
        response.status(200).json(onboardingState(updated));
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post("/onboarding/publish", [validatedRequest], async (_, response) => {
    try {
      const organization = await currentOrganization();
      if (!organization)
        return response.status(404).json({ error: "No organization found." });

      const { completedSteps } = wizardStateOf(organization);
      const hasRequiredSteps = REQUIRED_COMPLETED_STEPS.every((step) =>
        completedSteps.includes(step)
      );
      if (!hasRequiredSteps)
        return response.status(400).json({
          error: "Complete onboarding steps 1-4 before publishing.",
        });

      const updated = await prisma.organization.update({
        where: { id: organization.id },
        data: { publishedAt: new Date() },
      });
      const publicOrganization = await Organization.get(updated.id);
      response.status(200).json({
        publishedAt: updated.publishedAt,
        organization: publicOrganization,
      });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/onboarding/test",
    [validatedRequest],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });

        const body = reqBody(request);
        if (
          !body ||
          typeof body !== "object" ||
          typeof body.message !== "string" ||
          !body.message.trim()
        )
          return response.status(400).json({ error: "message is required." });

        const { formData } = wizardStateOf(organization);
        const prefix = VALID_TONES[formData?.tone] || "Resposta: ";
        response.status(200).json({
          response: `${prefix}${body.message.trim()}`,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { onboardingEndpoints };
