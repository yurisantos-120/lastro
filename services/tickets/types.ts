import type { TicketResultState } from '@/db/schema';

export interface LocalTicket {
  id: number;
  operationKey: string;
  glpiTicketId: number | null;
  title: string;
  content: string;
  status: number | null;
  resultState: TicketResultState;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  glpiCreatedAt: string | null;
  lastSyncedAt: string | null;
  createdBy: number | null;
  revision: number;
}

export interface CreateTicketRequest {
  operationKey: string;
  title: string;
  content: string;
  createdBy?: number | null;
}

export interface TicketRepository {
  createPending(input: CreateTicketRequest): Promise<{ ticket: LocalTicket; inserted: boolean }>;
  markCreated(id: number, ticket: { id: number }): Promise<LocalTicket>;
  markFailed(id: number, failureCode: string): Promise<void>;
  markUncertain(id: number, failureCode: string, glpiTicketId?: number): Promise<LocalTicket | null>;
  list(limit?: number): Promise<LocalTicket[]>;
  getByGlpiId(id: number): Promise<LocalTicket | null>;
  syncFromGlpi(ticket: {
    id: number;
    title: string;
    content: string;
    status?: number;
    createdAt?: string;
  }): Promise<LocalTicket | null>;
}

export type TicketCreationResult =
  | { resultState: 'created'; ticket: LocalTicket; reused: boolean }
  | { resultState: 'pending' | 'uncertain' | 'failed'; ticket: LocalTicket; reused: boolean; code: string };

export interface TicketCreateFailure {
  success: false;
  resultState: 'failed' | 'uncertain';
  message: string;
  code: string;
  ticket: LocalTicket;
}

export type TicketCreateApiResponse =
  | { success: true; ticket: LocalTicket; reused: boolean; message?: string }
  | {
      success: false;
      resultState?: 'pending' | 'failed' | 'uncertain';
      code: string;
      message: string;
      ticket?: LocalTicket;
      reused?: boolean;
    };

export interface TicketListApiResponse {
  success: true;
  tickets: LocalTicket[];
}

export interface TicketDetailApiResponse {
  success: true;
  ticket: LocalTicket;
  sync: { success: true } | { success: false; code: string; message: string };
}
