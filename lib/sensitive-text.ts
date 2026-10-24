// Shared conservative guard for operational free text; never log matching input.
export const containsSensitiveText = (value: string): boolean =>
  /\b(?:senha|password|passwd|passphrase|token|secret|credential|credencial|authorization|api[_-]?key)\b|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]+|-----BEGIN [\w ]*PRIVATE KEY-----|https?:\/\/[^\s/]+:[^\s/]+@|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/i.test(
    value,
  );
