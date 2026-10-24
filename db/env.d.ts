declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    NOC_TIME_ZONE?: string;
    NOC_DAY_SHIFT_START?: string;
    NOC_NIGHT_SHIFT_START?: string;
    GLPI_BASE_URL?: string;
    GLPI_PRIVATE_HTTP_HOST?: string;
    GLPI_HTTP_HOST?: string;
    GLPI_APP_TOKEN?: string;
    GLPI_USER_TOKEN?: string;
    GLPI_API_VERSION?: string;
    GLPI_TIMEOUT_MS?: string;
    OPUSLOG_BOOTSTRAP_GLPI_USER_ID?: string;
  }
}
