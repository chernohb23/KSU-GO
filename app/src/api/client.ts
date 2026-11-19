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
  register(id: string, deviceId: string, signal?: AbortSignal): Promise<RegisterResponse>;
  uploadRoute(input: UploadRouteInput, onProgress?: (percent: number) => void): Promise<Route>;
  getRoute(id: string, signal?: AbortSignal): Promise<Route>;
  updateRouteSteps(id: string, steps: Step[], signal?: AbortSignal): Promise<Route>;
  confirmRoute(id: string, signal?: AbortSignal): Promise<Route>;
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

function responseError(status: number, body: unknown): ApiRequestError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const message = typeof error?.message === 'string' ? error.message : `Request failed with status ${status}.`;
  return new ApiRequestError(status, parseApiErrorCode(error?.code), message);
}

export function createApiClient(
  baseUrl: string,
  fetcher: Fetcher = fetch,
  formDataFactory: FormDataFactory = () => new FormData(),
  createXHR: () => XMLHttpRequest = () => new XMLHttpRequest(),
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
      throw responseError(response.status, body);
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
    register: (id, deviceId, signal) => request<RegisterResponse>(`/events/${encodeURIComponent(id)}/register`, {
      ...json('POST', { deviceId }),
      ...(signal ? { signal } : {}),
    }),
    uploadRoute: (input, onProgress) => {
      const body = formDataFactory();
      body.append('video', input.video as unknown as Blob);
      body.append('buildingId', input.buildingId);
      body.append('destination', input.destination);
      body.append('startFloor', input.startFloor);
      body.append('destinationFloor', input.destinationFloor);
      if (input.eventId) body.append('eventId', input.eventId);
      if (!onProgress) return request<Route>('/routes', { method: 'POST', body });
      // React Native exposes multipart byte counts on XMLHttpRequest.upload.
      let idleTimer: ReturnType<typeof setTimeout>;
      return new Promise<Route>((resolve, reject) => {
        const xhr = createXHR();
        xhr.open('POST', `${base}/api/routes`);
        function resetDeadline() {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            reject(new Error('The upload connection stopped responding.'));
            xhr.abort();
          }, 90_000);
        }
        xhr.upload.onprogress = ({ loaded, total, lengthComputable }) => {
          resetDeadline();
          if (lengthComputable && total > 0) onProgress(Math.min(100, Math.floor(100 * loaded / total)));
        };
        xhr.onerror = xhr.onabort = xhr.ontimeout = () => reject(new Error('The upload connection was interrupted.'));
        xhr.onload = () => {
          let result: unknown;
          try {
            result = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error('The server returned an unreadable upload response.'));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(result as Route);
          else reject(responseError(xhr.status, result));
        };
        resetDeadline();
        xhr.send(body);
      }).finally(() => clearTimeout(idleTimer));
    },
    getRoute: (id, signal) => request<Route>(`/routes/${encodeURIComponent(id)}`, signal ? { signal } : undefined),
    updateRouteSteps: (id, steps, signal) => request<Route>(`/routes/${encodeURIComponent(id)}/steps`, { ...json('PUT', { steps }), ...(signal && { signal }) }),
    confirmRoute: (id, signal) => request<Route>(`/routes/${encodeURIComponent(id)}/confirm`, { method: 'POST', ...(signal && { signal }) }),
  };
}
