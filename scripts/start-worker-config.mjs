export const BOOTSTRAP_USER_BINDING = 'OPUSLOG_BOOTSTRAP_GLPI_USER_ID';

export function bootstrapVariableArgs(value) {
  if (value === undefined) return [];

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('OPUSLOG_BOOTSTRAP_GLPI_USER_ID deve ser um inteiro positivo.');
  }

  const userId = Number(normalized);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('OPUSLOG_BOOTSTRAP_GLPI_USER_ID deve ser um inteiro positivo.');
  }

  return ['--var', `${BOOTSTRAP_USER_BINDING}:${userId}`];
}
