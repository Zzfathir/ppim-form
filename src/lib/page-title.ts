import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export type TitleKey =
  | "signIn"
  | "welcome"
  | "myForms"
  | "templates"
  | "editTemplate"
  | "overview"
  | "allForms"
  | "form"
  | "people"
  | "departments"
  | "chapters"
  | "categories"
  | "manageTemplates"
  | "settings";

/** `export const generateMetadata = pageTitle("myForms")`: browser-tab titles in the visitor's language. */
export function pageTitle(key: TitleKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("titles");
    return { title: t(key) };
  };
}
