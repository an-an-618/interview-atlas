const LIST_MARKER =
  /^(?:(?:[-*•·●▪◦])|(?:\d{1,2}[.)、．])|(?:[一二三四五六七八九十]{1,3}[、.．)]))\s*/u;

export function answerPoints(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter(Boolean);
}

export function formatAnswer(value: string | string[]): string {
  const lines = Array.isArray(value)
    ? value.flatMap((line) => line.split(/\r?\n/))
    : value.split(/\r?\n/);
  return lines
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter(Boolean)
    .join("\n");
}

function sentences(value: string): string[] {
  return (
    value.match(/[^。！？!?；;]+(?:[。！？!?；;]+|$)/gu) ?? [value]
  )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Reflows legacy paragraphs without changing their words or order.
 * AI-generated answers use explicit semantic points; this is only the safe
 * local fallback for data that predates that contract.
 */
export function migrateLegacyAnswer(value: string): string {
  const normalized = formatAnswer(value);
  if (!normalized || normalized.includes("\n") || normalized.length < 80) {
    return normalized;
  }

  const parts = sentences(normalized);
  if (parts.length < 2) return normalized;

  const points: string[] = [];
  let current = "";
  for (const sentence of parts) {
    if (current && current.length + sentence.length > 86) {
      points.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) points.push(current);

  return points.length > 1 ? points.join("\n") : normalized;
}
