/** Only allow known internal destinations for privileged account actions. */
export function adminSettingsRedirect(
  formData: FormData,
  kind: "role" | "reset",
  status: string,
): string {
  return formData.get("returnTo") === "/admin/settings"
    ? `/admin/settings?${kind}=${encodeURIComponent(status)}`
    : `/admin?${kind}=${encodeURIComponent(status)}#students`;
}
