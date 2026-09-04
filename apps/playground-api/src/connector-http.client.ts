import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Injectable } from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
import {
  type ConnectorCredential,
  ConnectorCredentialService,
} from './connector-credential.service.js';
import { ConnectorFailure } from './connector-errors.js';
import {
  resolveAllowedAddress,
  validateAllowedHostAndPort,
} from './connector-network-policy.js';
import { SourcePayloadParserService } from './source-payload-parser.service.js';

export type { ConnectorCredential } from './connector-credential.service.js';

export interface ConnectorFetchResult {
  statusCode: number;
  latencyMs: number;
  contentType: string;
  bytesReceived: number;
  body: unknown;
}

export { ConnectorFailure } from './connector-errors.js';

@Injectable()
export class ConnectorHttpClient {
  constructor(
    private readonly credentialService: ConnectorCredentialService,
    private readonly payloadParser: SourcePayloadParserService,
  ) {}

  async fetch(
    endpoint: string,
    expectedContentType: 'application/json' | 'text/csv',
    credential: ConnectorCredential | null,
    csvDelimiter = ',',
  ): Promise<ConnectorFetchResult> {
    const url = this.validateEndpoint(endpoint);
    const address = await resolveAllowedAddress(url.hostname, {
      allowedHosts: runtimeConfig.connectorHttpAllowedHosts,
      allowedPorts: runtimeConfig.connectorHttpAllowedPorts,
      allowPrivateNetworks: runtimeConfig.connectorHttpAllowPrivateNetworks,
    });
    const headers = this.resolveHeaders(url, expectedContentType, credential);
    const startedAt = performance.now();
    const response = await this.performRequest(url, address.address, address.family, headers);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (response.statusCode >= 300 && response.statusCode < 400) {
      throw new ConnectorFailure(
        'REDIRECT_BLOCKED',
        'Connector redirects are blocked by policy.',
        response.statusCode,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new ConnectorFailure(
        'UPSTREAM_HTTP_ERROR',
        'The source returned a non-success response.',
        response.statusCode,
      );
    }
    const contentType = response.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (
      contentType !== expectedContentType &&
      !(expectedContentType === 'application/json' && contentType.endsWith('+json'))
    ) {
      throw new ConnectorFailure(
        'CONTENT_TYPE_MISMATCH',
        `Expected ${expectedContentType} but received ${contentType || 'no content type'}.`,
        response.statusCode,
      );
    }

    let body: unknown;
    try {
      body = this.payloadParser.parse(response.body, expectedContentType, csvDelimiter);
    } catch (error) {
      throw new ConnectorFailure(
        'INVALID_SOURCE_PAYLOAD',
        error instanceof Error ? error.message : 'The source payload could not be parsed.',
        response.statusCode,
      );
    }
    return {
      statusCode: response.statusCode,
      latencyMs,
      contentType,
      bytesReceived: response.body.length,
      body,
    };
  }

  private validateEndpoint(endpoint: string): URL {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ConnectorFailure(
        'PROTOCOL_BLOCKED',
        'Only HTTP(S) connector endpoints are supported.',
      );
    }
    if (url.protocol === 'http:' && !runtimeConfig.connectorHttpAllowInsecure) {
      throw new ConnectorFailure(
        'INSECURE_HTTP_BLOCKED',
        'Plain HTTP connector endpoints are disabled.',
      );
    }
    if (url.username || url.password || url.hash) {
      throw new ConnectorFailure(
        'INVALID_ENDPOINT',
        'Credentials and fragments are not allowed in connector endpoints.',
      );
    }
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    validateAllowedHostAndPort(url.hostname, port, {
      allowedHosts: runtimeConfig.connectorHttpAllowedHosts,
      allowedPorts: runtimeConfig.connectorHttpAllowedPorts,
      allowPrivateNetworks: runtimeConfig.connectorHttpAllowPrivateNetworks,
    });
    return url;
  }

  private resolveHeaders(
    url: URL,
    expectedContentType: string,
    credential: ConnectorCredential | null,
  ): Record<string, string> {
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    const defaultPort =
      (url.protocol === 'https:' && port === '443') || (url.protocol === 'http:' && port === '80');
    const headers: Record<string, string> = {
      accept: expectedContentType,
      host: defaultPort ? url.hostname : `${url.hostname}:${port}`,
      'user-agent': 'GigaLibs-Connector/1.0',
    };
    if (!credential || credential.authType === 'NONE') return headers;
    const secret = this.credentialService.resolveSecret(credential);
    if (credential.authType === 'BEARER_TOKEN') headers.authorization = `Bearer ${secret}`;
    if (credential.authType === 'API_KEY_HEADER') {
      const headerName = credential.headerName?.toLowerCase();
      if (!headerName || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(headerName)) {
        throw new ConnectorFailure(
          'CREDENTIAL_HEADER_INVALID',
          'The API key header name is invalid.',
        );
      }
      if (
        [
          'host',
          'content-length',
          'connection',
          'transfer-encoding',
          'cookie',
          'set-cookie',
        ].includes(headerName)
      ) {
        throw new ConnectorFailure(
          'CREDENTIAL_HEADER_BLOCKED',
          'The API key header is blocked by policy.',
        );
      }
      headers[headerName] = secret;
    }
    return headers;
  }

  private performRequest(
    url: URL,
    address: string,
    family: number,
    headers: Record<string, string>,
  ): Promise<{ statusCode: number; contentType: string; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        {
          protocol: url.protocol,
          hostname: address,
          family,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers,
          ...(url.protocol === 'https:'
            ? { servername: url.hostname.replace(/^\[|\]$/g, '') }
            : {}),
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          response.on('data', (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > runtimeConfig.connectorHttpMaxResponseBytes) {
              request.destroy(
                new ConnectorFailure(
                  'RESPONSE_TOO_LARGE',
                  'The source response exceeded the configured byte limit.',
                ),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.on('end', () =>
            resolve({
              statusCode: response.statusCode ?? 0,
              contentType:
                typeof response.headers['content-type'] === 'string'
                  ? response.headers['content-type']
                  : '',
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      request.setTimeout(runtimeConfig.connectorHttpTimeoutSeconds * 1_000, () => {
        request.destroy(new ConnectorFailure('SOURCE_TIMEOUT', 'The connector request timed out.'));
      });
      request.on('error', (error) => {
        reject(
          error instanceof ConnectorFailure
            ? error
            : new ConnectorFailure('SOURCE_UNREACHABLE', 'The connector source is unreachable.'),
        );
      });
      request.end();
    });
  }

}
