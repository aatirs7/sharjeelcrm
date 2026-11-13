/** Public base URL of this CRM, for links handed to outside services. */
export function crmBaseUrl(): string {
  return (process.env.APP_URL?.trim() || 'https://shahmircrm.vercel.app').replace(/\/+$/, '')
}
