export const GREENHITHE_LEGION_LOCATION_NAME = "Greenhithe Legion Social Club";

export function slugFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
