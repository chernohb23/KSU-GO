import type { Event, Route, Step } from '../../../shared/types.ts';

export type HealthResponse = { ok: true; pipelineMode: 'mock' | 'live' };
export type RegisterResponse = { registered: true; registeredCount: number };
export type EventRange = 'today' | 'week';
export type ApiErrorCode =
  | 'not_found'
  | 'invalid_request'
  | 'wrong_status'
  | 'route_has_failed_checks'
  | 'video_rejected'
  | 'budget_exceeded';

export type UploadRouteInput = {
  video: { uri: string; name: string; type: string };
  buildingId: string;
  destination: string;
  startFloor: string;
  destinationFloor: string;
  eventId?: string;
};

export type ApiClient = {
  health(signal?: AbortSignal): Promise<HealthResponse>;
  listEvents(range?: EventRange, signal?: AbortSignal): Promise<Event[]>;
  getEvent(id: string): Promise<Event>;
  register(id: string, deviceId: string): Promise<RegisterResponse>;
  uploadRoute(input: UploadRouteInput): Promise<Route>;
  getRoute(id: string): Promise<Route>;
  updateRouteSteps(id: string, steps: Step[]): Promise<Route>;
  confirmRoute(id: string): Promise<Route>;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

type FormDataFactory = () => FormData;
type Fetcher = typeof fetch;

const API_ERROR_CODES: ApiErrorCode[] = [
  'not_found',
  'invalid_request',
  'wrong_status',
  'route_has_failed_checks',
  'video_rejected',
  'budget_exceeded',
];

function parseApiErrorCode(value: unknown): ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.includes(value as ApiErrorCode) ? (value as ApiErrorCode) : 'invalid_request';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createApiClient(
  baseUrl: string,
  fetcher: Fetcher = fetch,
  formDataFactory: FormDataFactory = () => new FormData(),
): ApiClient {
  const base = baseUrl.trim().replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${base}/api${path}`, init);
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const error = isRecord(body) && isRecord(body.error) ? body.error : null;
      const code = parseApiErrorCode(error?.code);
      const message = typeof error?.message === 'string' ? error.message : `Request failed with status ${response.status}.`;
      throw new ApiRequestError(response.status, code, message);
    }
    return (await response.json()) as T;
  }

  function json(method: 'POST' | 'PUT', body: unknown): RequestInit {
    return {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  return {
    health: (signal) => request<HealthResponse>('/health', signal ? { signal } : undefined),
    listEvents: (range, signal) => request<Event[]>(`/events${range ? `?range=${range}` : ''}`, signal ? { signal } : undefined),
    getEvent: (id) => request<Event>(`/events/${encodeURIComponent(id)}`),
    register: (id, deviceId) => request<RegisterResponse>(`/events/${encodeURIComponent(id)}/register`, json('POST', { deviceId })),
    uploadRoute: (input) => {
      const body = formDataFactory();
      body.append('video', input.video as unknown as Blob);
      body.append('buildingId', input.buildingId);
      body.append('destination', input.destination);
      body.append('startFloor', input.startFloor);
      body.append('destinationFloor', input.destinationFloor);
      if (input.eventId) body.append('eventId', input.eventId);
      return request<Route>('/routes', { method: 'POST', body });
    },
    getRoute: (id) => request<Route>(`/routes/${encodeURIComponent(id)}`),
    updateRouteSteps: (id, steps) => request<Route>(`/routes/${encodeURIComponent(id)}/steps`, json('PUT', { steps })),
    confirmRoute: (id) => request<Route>(`/routes/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  };
}
