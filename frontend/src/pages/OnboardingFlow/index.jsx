import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Organization from "@/models/organization";
import System from "@/models/system";
import paths from "@/utils/paths";
import CompanySetup from "./Steps/CompanySetup";
import Segment from "./Steps/Segment";
import Objective from "./Steps/Objective";
import Knowledge from "./Steps/Knowledge";
import Tone from "./Steps/Tone";
import Test from "./Steps/Test";
import Publish from "./Steps/Publish";

const STEPS = [1, 2, 3, 4, 5, 6, 7];
const STEP_COMPONENTS = {
  1: CompanySetup,
  2: Segment,
  3: Objective,
  4: Knowledge,
  5: Tone,
  6: Test,
  7: Publish,
};

const VALIDATORS = {
  1: (formData) => !!formData.companyName?.trim() && !!formData.slug?.trim(),
  2: (formData) => !!formData.segment,
  3: (formData) => !!formData.objective,
  4: (formData) =>
    !!formData.knowledge?.length ||
    !!formData.knowledgeUrl?.trim() ||
    !!formData.knowledgeText?.trim(),
  5: (formData) => !!formData.tone,
  6: () => true,
  7: () => true,
};

export default function OnboardingFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [formData, setFormData] = useState({});
  const [publishedAt, setPublishedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      const state = await Organization.getOnboardingState();
      if (cancelled) return;
      if (!state) {
        setLoading(false);
        return;
      }
      setCurrentStep(state.currentStep || 1);
      setCompletedSteps(state.completedSteps || []);
      setFormData(state.formData || {});
      setPublishedAt(state.publishedAt || null);
      setLoading(false);
      if (state.publishedAt) navigate(paths.home(), { replace: true });
    }
    loadState();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function updateFormData(patch) {
    setFormData((previous) => ({ ...previous, ...patch }));
  }

  async function handleNext() {
    if (!VALIDATORS[currentStep](formData)) {
      setAttempted(true);
      return;
    }

    setSaving(true);
    setError("");
    const nextStep = Math.min(currentStep + 1, 7);
    const nextCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];

    try {
      if (currentStep === 1) {
        const updated = await Organization.update({
          name: formData.companyName,
          slug: formData.slug,
        });
        if (updated.error) throw new Error(updated.error);
      }
      if (currentStep === 2) {
        const updated = await Organization.update({
          segment: formData.segment,
        });
        if (updated.error) throw new Error(updated.error);
      }

      const state = await Organization.updateOnboardingState({
        currentStep: nextStep,
        completedSteps: nextCompleted,
        formData,
      });
      if (!state) throw new Error("Failed to update onboarding state.");

      setCurrentStep(state.currentStep);
      setCompletedSteps(state.completedSteps);
      setFormData(state.formData);
      setAttempted(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setCurrentStep((step) => Math.max(step - 1, 1));
    setAttempted(false);
    setError("");
  }

  async function handlePublish() {
    setPublishing(true);
    setError("");
    const result = await Organization.publishOnboarding();
    if (result.error) {
      setError(result.error);
      setPublishing(false);
      return;
    }

    setPublishedAt(result.publishedAt);
    await System.markOnboardingComplete();
    setTimeout(() => navigate(paths.home(), { replace: true }), 1200);
  }

  if (loading)
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-zinc-950 text-white light:bg-slate-50 light:text-slate-700">
        {t("common.loading")}
      </div>
    );

  const StepComponent = STEP_COMPONENTS[currentStep];
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === 7;
  const isCurrentStepValid = VALIDATORS[currentStep](formData);

  return (
    <div className="min-h-screen bg-zinc-950 light:bg-slate-50 px-4 py-10 sm:py-14">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <p className="text-sm font-medium text-theme-text-secondary">
            {t("onboarding.progress", { current: currentStep, total: 7 })}
          </p>
          <div className="flex flex-1 gap-1 max-w-[280px]">
            {STEPS.map((step) => (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full ${
                  step <= currentStep ? "bg-sky-500" : "bg-theme-sidebar-border"
                }`}
              />
            ))}
          </div>
        </div>

        {currentStep === 1 && (
          <div className="mb-8 rounded-lg border border-sky-400/30 bg-sky-400/10 px-5 py-4 text-sm text-sky-300">
            {t("onboarding.welcome")}
          </div>
        )}

        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-theme-text-primary sm:text-3xl">
            {t(`onboarding.step.${currentStep}.title`)}
          </h1>
          <p className="mt-2 text-sm text-theme-text-secondary sm:text-base">
            {t(`onboarding.step.${currentStep}.description`)}
          </p>
        </header>

        {error && (
          <div className="mb-5 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <StepComponent
          formData={formData}
          updateFormData={updateFormData}
          attempted={attempted}
          completedSteps={completedSteps}
          publishedAt={publishedAt}
          publishing={publishing}
          onPublish={handlePublish}
        />

        {!isLastStep && (
          <div className="mt-10 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={isFirstStep || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-theme-sidebar-border px-4 py-2.5 text-sm font-medium text-theme-text-primary hover:bg-theme-bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={16} />
              {t("onboarding.back")}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!isCurrentStepValid || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.continue")}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
