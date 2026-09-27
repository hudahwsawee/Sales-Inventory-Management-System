/**
 * أنواع مشتركة بين Backend (NestJS) وFrontend (React) — Foundation فقط حاليًا.
 * التوسع لاحقًا: DTOs كاملة لكل Module (Sales, Purchasing...) عند بنائها.
 */

export interface AuthUserDto {
  id: string;
  fullName: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message_ar: string;
  message_en?: string;
  path: string;
  timestamp: string;
}
