import { createI18n } from 'vue-i18n'
import th from './th.json'
import en from './en.json'

const STORAGE_KEY = 'locale'
const SUPPORTED_LOCALES = ['th', 'en']
const DEFAULT_LOCALE = 'th'

function getInitialLocale() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES.includes(saved)) return saved
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { th, en },
})

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.setAttribute('lang', locale)
}

export { SUPPORTED_LOCALES }
