import type {
  AuthResponse, CreateEventRequest, EditEventRequest, Event, EventDirections, EventRegistrations, FollowResponse,
  LoginRequest, MyRegistration, Organization, OrganizationRequest, ProfileRequest, Route, SignupRequest, Step, User,
} from '../../../shared/types.ts';

export type HealthResponse = { ok: true; pipelineMode: 'mock' | 'live' };
export type RegisterResponse = { registered: true; registeredCount: number };
export type EventRange = 'today' | 'week';
export type ApiErrorCode =
  | 'not_found'
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'room_has_route'
  | 'event_cancelled'
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
  register(id: string, signal?: AbortSignal): Promise<RegisterResponse>;
  signup(body: SignupRequest, signal?: AbortSignal): Promise<AuthResponse>;
  login(body: LoginRequest, signal?: AbortSignal): Promise<AuthResponse>;
  logout(signal?: AbortSignal): Promise<void>;
  me(signal?: AbortSignal): Promise<User>;
  updateProfile(body: ProfileRequest): Promise<User>;
  myRegistrations(signal?: AbortSignal): Promise<MyRegistration[]>;
  listOrganizations(signal?: AbortSignal): Promise<Organization[]>;
  getOrganization(id: string, signal?: AbortSignal): Promise<Organization>;
  organizationEvents(id: string, when: 'upcoming' | 'past', signal?: AbortSignal): Promise<Event[]>;
  createOrganization(body: OrganizationRequest): Promise<Organization>;
  updateOrganization(id: string, body: OrganizationRequest): Promise<Organization>;
  setFollowing(id: string, following: boolean): Promise<FollowResponse>;
  createEvent(body: CreateEventRequest): Promise<Event>;
  editEvent(id: string, body: EditEventRequest): Promise<Event>;
  cancelEvent(id: string): Promise<Event>;
  eventRegistrations(id: string, signal?: AbortSignal): Promise<EventRegistrations>;
  eventDirections(id: string, signal?: AbortSignal): Promise<EventDirections>;
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

/** Adds `Authorization: Bearer` to every request and reports a 401 for the token that was sent. */
export type ApiAuth = {
  token(): string | null;
  onUnauthorized(sentToken: string): void;
};

const API_ERROR_CODES: ApiErrorCode[] = [
  'not_found',
  'invalid_request',
  'unauthenticated',
  'forbidden',
  'room_has_route',
  'event_cancelled',
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
  auth?: ApiAuth,
): ApiClient {
  const base = baseUrl.trim().replace(/\/+$/, '');

  function failed(status: number, body: unknown, sentToken: string | null): ApiRequestError {
    if (status === 401 && sentToken !== null) auth?.onUnauthorized(sentToken);
    return responseError(status, body);
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const sentToken = auth?.token() ?? null;
    let sent = init;
    if (sentToken !== null) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${sentToken}`);
      sent = { ...init, headers };
    }
    const response = await fetcher(`${base}/api${path}`, sent);
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      throw failed(response.status, body, sentToken);
    }
    if (response.status === 204) return undefined as T;
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
    register: (id, signal) => request<RegisterResponse>(`/events/${encodeURIComponent(id)}/register`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    }),
    signup: (body, signal) => request<AuthResponse>('/auth/signup', { ...json('POST', body), ...(signal && { signal }) }),
    login: (body, signal) => request<AuthResponse>('/auth/login', { ...json('POST', body), ...(signal && { signal }) }),
    logout: (signal) => request<void>('/auth/logout', { method: 'POST', ...(signal && { signal }) }),
    me: (signal) => request<User>('/me', signal ? { signal } : undefined),
    updateProfile: (body) => request<User>('/me/profile', json('PUT', body)),
    myRegistrations: (signal) => request<MyRegistration[]>('/me/registrations', signal ? { signal } : undefined),
    listOrganizations: (signal) => request<Organization[]>('/organizations', signal ? { signal } : undefined),
    getOrganization: (id, signal) => request<Organization>(`/organizations/${encodeURIComponent(id)}`, signal ? { signal } : undefined),
    organizationEvents: (id, when, signal) => request<Event[]>(
      `/organizations/${encodeURIComponent(id)}/events?when=${when}`, signal ? { signal } : undefined,
    ),
    createOrganization: (body) => request<Organization>('/organizations', json('POST', body)),
    updateOrganization: (id, body) => request<Organization>(`/organizations/${encodeURIComponent(id)}`, json('PUT', body)),
    setFollowing: (id, following) => request<FollowResponse>(
      `/organizations/${encodeURIComponent(id)}/follow`, { method: following ? 'POST' : 'DELETE' },
    ),
    createEvent: (body) => request<Event>('/events', json('POST', body)),
    editEvent: (id, body) => request<Event>(`/events/${encodeURIComponent(id)}`, json('PUT', body)),
    cancelEvent: (id) => request<Event>(`/events/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    eventRegistrations: (id, signal) => request<EventRegistrations>(
      `/events/${encodeURIComponent(id)}/registrations`, signal ? { signal } : undefined,
    ),
    eventDirections: (id, signal) => request<EventDirections>(
      `/events/${encodeURIComponent(id)}/directions`, signal ? { signal } : undefined,
    ),
    uploadRoute: (input, onProgress) => {
      // Directions are recorded for an event; the server takes the room from it (CONTRACTS.md section 5).
      if (!input.eventId) return Promise.reject(new Error('Choose the event to record directions for.'));
      const path = `/routes?eventId=${encodeURIComponent(input.eventId)}`;
      const body = formDataFactory();
      body.append('video', input.video as unknown as Blob);
      body.append('startFloor', input.startFloor);
      body.append('destinationFloor', input.destinationFloor);
      if (!onProgress) return request<Route>(path, { method: 'POST', body });
      // React Native exposes multipart byte counts on XMLHttpRequest.upload.
      let idleTimer: ReturnType<typeof setTimeout>;
      return new Promise<Route>((resolve, reject) => {
        const xhr = createXHR();
        const sentToken = auth?.token() ?? null;
        xhr.open('POST', `${base}/api${path}`);
        if (sentToken !== null) xhr.setRequestHeader('Authorization', `Bearer ${sentToken}`);
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
            reject(xhr.status === 401
              ? failed(401, null, sentToken)
              : new Error('The server returned an unreadable upload response.'));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(result as Route);
          else reject(failed(xhr.status, result, sentToken));
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
