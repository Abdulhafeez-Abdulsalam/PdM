/**
 * The text catalog (ADR-0009). Every visible sentence comes from en.json via t("key").
 * Adding a language later = adding fr.json etc. here.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes text
  returnNull: false,
});

export default i18n;
