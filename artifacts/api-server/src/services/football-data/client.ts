import { logger } from "../../lib/logger";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 250;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class MissingFootballDataApiKeyError extends Error {
  constructor() {
    super(
      "FOOTBALL_DATA_API_TOKEN (or legacy FOOTBALL_DATA_API_KEY) is not configured.",
    );
    this.name = "MissingFootballDataApiKeyError";
  }
}

export class FootballDataApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "FootballDataApiError";
  }
}

export interface FootballDataClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

/**
 * Server-only client for Football-Data.org v4.
 *
 * The token is read at request time so deployments can rotate the secret
 * without requiring a process-level client singleton to be recreated.
 */
export class FootballDataClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: FootballDataClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? FOOTBALL_DATA_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const cached = this.cache.get(url);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    if (cached) {
      this.cache.delete(url);
    }

    const apiToken =
      process.env.FOOTBALL_DATA_API_TOKEN ??
      process.env.FOOTBALL_DATA_API_KEY;
    if (!apiToken) {
      logger.warn(
        { endpoint: path },
        "Football-Data.org API token is not configured",
      );
      throw new MissingFootballDataApiKeyError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Auth-Token": apiToken,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await this.readErrorMessage(response);
        logger.error(
          {
            endpoint: path,
            status: response.status,
            upstreamMessage: message,
          },
          "Football-Data.org API request failed",
        );
        throw new FootballDataApiError(
          message,
          response.status,
          path,
        );
      }

      const data = (await response.json()) as T;
      this.setCache(url, data);
      return data;
    } catch (error) {
      if (error instanceof FootballDataApiError) {
        throw error;
      }

      const message =
        error instanceof Error && error.name === "AbortError"
          ? `Football-Data.org request timed out after ${this.timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : "Unknown Football-Data.org request failure.";

      logger.error(
        { endpoint: path, error: message },
        "Football-Data.org API request could not be completed",
      );
      throw new FootballDataApiError(message, 503, path);
    } finally {
      clearTimeout(timeout);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildUrl(
    path: string,
    query: Record<string, string | number | undefined>,
  ): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const queryString = searchParams.toString();
    return `${this.baseUrl}${normalizedPath}${queryString ? `?${queryString}` : ""}`;
  }

  private setCache<T>(url: string, value: T): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(url, {
      expiresAt: Date.now() + this.cacheTtlMs,
      value,
    });
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { message?: string };
      return (
        body.message ??
        `Football-Data.org returned HTTP ${response.status}.`
      );
    } catch {
      return `Football-Data.org returned HTTP ${response.status}.`;
    }
  }
}