/** Shared AIOS branding + product constants. Single source of truth. */

export const APP_NAME = "AIOS";
export const APP_FULL_NAME = "AIOS Platform";
export const APP_DESCRIPTION =
  "Artificial Intelligence Operating Systems for life and business.";

export const PRODUCTS = {
  harmony: {
    name: "Harmony",
    tagline: "Personal Operating System",
    description:
      "Organize life, manage goals, complete tasks, and grow with AI-powered assistance.",
  },
  opera: {
    name: "Opera",
    tagline: "Business Operating System",
    description:
      "Organize operations, manage knowledge, and accelerate growth. (Coming later.)",
  },
} as const;

/** AIOS guiding principles — surfaced in marketing + docs. */
export const AIOS_PRINCIPLES = [
  "Human in control",
  "Trust before automation",
  "Global first",
  "Accessibility first",
  "Users own their data",
] as const;
