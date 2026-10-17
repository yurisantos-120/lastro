export interface GlpiConfig {
  baseUrl: string;
  appToken: string;
  userToken: string;
  timeoutMs: number;
  ticketCreateTimeoutMs: number;
  apiVersion: 'v1';
}

export interface GlpiTicketInput {
  title: string;
  content: string;
}
export interface GlpiTicket {
  id: number;
}
export interface GlpiTicketDetails extends GlpiTicket {
  title: string;
  content: string;
  status?: number;
  createdAt?: string;
}
export type GlpiErrorCode =
  | 'GLPI_CONFIG_ERROR'
  | 'GLPI_AUTH_ERROR'
  | 'GLPI_SESSION_ERROR'
  | 'GLPI_TICKET_NOT_FOUND'
  | 'GLPI_FORBIDDEN'
  | 'GLPI_CONNECTION_ERROR'
  | 'GLPI_TIMEOUT'
  | 'GLPI_NOT_FOUND'
  | 'GLPI_TICKET_CREATE_ERROR'
  | 'GLPI_TICKET_UNCERTAIN'
  | 'GLPI_INVALID_RESPONSE'
  | 'GLPI_VALIDATION_ERROR';
export interface GlpiFailure {
  success: false;
  message: string;
  code: GlpiErrorCode;
}
export type GlpiTestResult = { success: true; message: string; version: string } | GlpiFailure;
export type GlpiTicketResult =
  | { success: true; ticket: GlpiTicket }
  | GlpiFailure;
