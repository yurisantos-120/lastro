declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GLPI_BASE_URL?: string;
    GLPI_APP_TOKEN?: string;
    GLPI_USER_TOKEN?: string;
    GLPI_API_VERSION?: string;
    GLPI_TIMEOUT_MS?: string;
    OPUSLOG_BOOTSTRAP_GLPI_USER_ID?: string;
  }
}
