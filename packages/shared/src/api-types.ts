import type { QueryIntent } from './agent-types';

export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

export enum ErrorCode {
  SUCCESS = 0,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  VALIDATION_ERROR = 422,
  RATE_LIMITED = 429,
  INTERNAL_ERROR = 500,
  SQL_SANDBOX_ERROR = 1001,
  DATASOURCE_CONNECTION_FAILED = 1002,
  AGENT_MAX_RETRY_EXCEEDED = 1003,
  CHART_GENERATION_FAILED = 1004,
}

export type UserRole = 'USER' | 'ADMIN';
export type MessageRole = 'USER' | 'ASSISTANT';
export type DataSourceType = 'POSTGRESQL' | 'MYSQL';
export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionDto {
  id: string;
  title: string;
  dataSourceId: string | null;
  dataSourceName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDto {
  id: string;
  role: MessageRole;
  content: string;
  sqlQuery?: string | null;
  intent?: QueryIntent | null;
  sqlEdited?: boolean;
  chartConfig?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DataSourceDto {
  id: string;
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  isReadOnly: boolean;
  connectionStatus: ConnectionStatus;
  lastSyncAt: string | null;
  createdAt: string;
  schemaDoc?: string | null;
}

export interface ChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardChartDto {
  id: string;
  title: string;
  chartConfig: Record<string, unknown>;
  sourceMessageId: string | null;
  position: ChartPosition;
  createdAt: string;
}

export interface ChatStreamRequest {
  sessionId: string;
  message: string;
  dataSourceId?: string;
}

export interface LabRunRequest {
  sessionId: string;
  sql: string;
  messageId?: string;
  dataSourceId?: string;
}
