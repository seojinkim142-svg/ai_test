/* global __APP_AUTH_ENABLED__ */

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);
export const AUTH_DEFAULT_ENABLED = true;
const BUILD_AUTH_ENABLED_RAW =
  typeof __APP_AUTH_ENABLED__ !== "undefined" ? __APP_AUTH_ENABLED__ : "";

function parseEnvBoolean(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (value == null) return defaultValue;
  const trimmed = String(value).trim();
  const unquoted = trimmed.replace(/^['"]|['"]$/g, "");
  const normalized = unquoted.toLowerCase();
  if (!normalized) return defaultValue;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

export const AUTH_ENABLED = parseEnvBoolean(
  BUILD_AUTH_ENABLED_RAW,
  AUTH_DEFAULT_ENABLED
);
