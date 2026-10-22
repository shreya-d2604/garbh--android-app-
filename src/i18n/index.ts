// i18n (PLAN.md §3). English only for now; one namespace per owner so agents never edit the
// same file: useTranslation('patient'), useTranslation('doctor'), ... Default namespace: 'common'.
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import admin from './en/admin.json';
import backend from './en/backend.json';
import common from './en/common.json';
import companion from './en/companion.json';
import doctor from './en/doctor.json';
import patient from './en/patient.json';
import reception from './en/reception.json';

export const resources = {
  en: { common, patient, companion, doctor, reception, admin, backend },
} as const;

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(resources.en),
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export default i18n;
