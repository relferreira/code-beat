export function parseModelListValue(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const parsedJson = parseJsonStringArray(trimmed);
  if (parsedJson) {
    return parsedJson;
  }

  const withoutBrackets = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return withoutBrackets
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/^-\s*/, "").replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

function parseJsonStringArray(value: string): string[] | undefined {
  if (!value.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  } catch {
    return undefined;
  }
}
