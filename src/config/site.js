/**
 * The site's own address, for the rare places the app needs to name itself.
 *
 * Vite's define replaces this token in script source — so read it here, in
 * a const, and never write __SITE_URL__ straight into a template. A bare
 * identifier in a template compiles to a component-context lookup and
 * silently renders as nothing, which is exactly how the version number
 * disappeared off the Settings page once already.
 *
 * The value lives in site.config.js at the repo root.
 */
export const SITE_URL = __SITE_URL__
