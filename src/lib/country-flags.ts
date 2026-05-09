export function countryCodeToFlagEmoji(code?: string | null) {
  const trimmed = code?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(trimmed)) return null;
  return Array.from(trimmed)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}
