export type PlayerNameMatchKind = "exact" | "possible";

export function normalizePlayerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function sharesFirstNameRoot(left: string, right: string) {
  const shorterLength = Math.min(left.length, right.length);
  return shorterLength >= 3 && (left.startsWith(right) || right.startsWith(left));
}

export function playerNameMatchKind(leftValue: string, rightValue: string): PlayerNameMatchKind | null {
  const left = normalizePlayerName(leftValue);
  const right = normalizePlayerName(rightValue);
  if (!left || !right) return null;
  if (left === right) return "exact";
  if (left.length < 4 || right.length < 4) return null;

  const leftParts = left.split(" ");
  const rightParts = right.split(" ");
  if (leftParts.length >= 2 && rightParts.length >= 2) {
    const leftFirst = leftParts[0];
    const rightFirst = rightParts[0];
    const leftLast = leftParts[leftParts.length - 1];
    const rightLast = rightParts[rightParts.length - 1];
    if (leftLast === rightLast && leftFirst[0] === rightFirst[0]) return "possible";
    if (leftFirst === rightFirst && editDistance(leftLast, rightLast) <= 2) return "possible";
    if (sharesFirstNameRoot(leftFirst, rightFirst) && editDistance(leftLast, rightLast) <= 2) return "possible";
    if (leftFirst[0] === rightFirst[0] && editDistance(leftLast, rightLast) <= 1) return "possible";
  }

  const allowedDistance = Math.max(left.length, right.length) >= 12 ? 2 : 1;
  return editDistance(left, right) <= allowedDistance ? "possible" : null;
}
