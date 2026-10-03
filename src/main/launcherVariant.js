const PUBLIC_VARIANT = 'public';
const DEVELOPER_VARIANT = 'developer';

function normalizeVariant(value) {
  return value === DEVELOPER_VARIANT ? DEVELOPER_VARIANT : PUBLIC_VARIANT;
}

function variantCapabilities(value) {
  const variant = normalizeVariant(value);
  return Object.freeze({
    variant,
    isPublic: variant === PUBLIC_VARIANT,
    isDeveloper: variant === DEVELOPER_VARIANT,
    developerTools: variant === DEVELOPER_VARIANT,
    publishing: variant === DEVELOPER_VARIANT
  });
}

module.exports = { PUBLIC_VARIANT, DEVELOPER_VARIANT, normalizeVariant, variantCapabilities };
