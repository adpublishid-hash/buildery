// Shared (client + server safe) defaults and resolver for the public
// course-catalog hero. Editable values are stored on LmsSetting; when a
// field is blank we fall back to these defaults.

export const DEFAULT_LMS_CATALOG = {
  eyebrow: "learning catalog",
  heading: "Courses built for focused, self-paced learning.",
  subheading:
    "Browse available courses, preview the curriculum, and continue learning from the same link after enrollment.",
};

export type LmsCatalogContent = typeof DEFAULT_LMS_CATALOG;

type LmsSettingLike = {
  catalogEyebrow?: string | null;
  catalogHeading?: string | null;
  catalogSubheading?: string | null;
} | null;

export function resolveLmsCatalog(setting?: LmsSettingLike): LmsCatalogContent {
  return {
    eyebrow: setting?.catalogEyebrow?.trim() || DEFAULT_LMS_CATALOG.eyebrow,
    heading: setting?.catalogHeading?.trim() || DEFAULT_LMS_CATALOG.heading,
    subheading:
      setting?.catalogSubheading?.trim() || DEFAULT_LMS_CATALOG.subheading,
  };
}
