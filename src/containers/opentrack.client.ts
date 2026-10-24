import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OpenTrackContainer,
  OpenTrackListResponse,
} from './opentrack.types.js';

const PAGE_SIZE = 50;

@Injectable()
export class OpenTrackClient {
  private readonly logger = new Logger(OpenTrackClient.name);

  constructor(private readonly config: ConfigService) {}

  async listContainers(): Promise<OpenTrackContainer[]> {
    const containers: OpenTrackContainer[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (containers.length < total && page <= 40) {
      const url = new URL('/v1/containers', this.baseUrl());
      url.searchParams.set('page', String(page));
      url.searchParams.set('perPage', String(PAGE_SIZE));
      const body = await this.request<OpenTrackListResponse>(url);
      const batch = body.data ?? [];
      total = body.total ?? batch.length;
      if (batch.length === 0) {
        break;
      }
      containers.push(...batch);
      page += 1;
      if (containers.length < total) {
        await delay(200);
      }
    }

    this.logger.log(`Fetched ${containers.length} containers`);
    return containers;
  }

  async getContainer(containerNumber: string): Promise<OpenTrackContainer | null> {
    const url = new URL(
      `/v1/containers/${encodeURIComponent(containerNumber)}`,
      this.baseUrl(),
    );
    const response = await fetch(url, { headers: this.headers() });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Tracking feed responded with ${response.status}`);
    }
    const body = (await response.json()) as
      | OpenTrackContainer
      | { data?: OpenTrackContainer };
    if (body && typeof body === 'object' && 'containerId' in body && body.containerId) {
      return body;
    }
    if (body && typeof body === 'object' && 'data' in body) {
      return body.data ?? null;
    }
    return null;
  }

  private async request<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers() });
    } catch {
      throw new Error('The tracking connection could not be reached');
    }
    if (!response.ok) {
      throw new Error(`Tracking feed responded with ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private headers() {
    return {
      Accept: 'application/json',
      'Opentrack-API-Key': this.config.getOrThrow<string>('OPENTRACK_API_KEY'),
    };
  }

  private baseUrl() {
    return this.config
      .get<string>('OPENTRACK_API_URL', 'https://api.opentrack.co')
      .replace(/\/$/, '');
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
