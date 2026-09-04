export class DomainResolver {
  constructor(private readonly baseDomain: string = 'localhost') {}

  /**
   * Extract tenant slug or custom domain from host header.
   * e.g. 'tenant-a.gigalibs.dev' -> slug: 'tenant-a'
   */
  resolveTenantIdentifier(hostname: string): { slug?: string; customDomain?: string } {
    const cleanHost = hostname.split(':')[0] ?? '';

    if (cleanHost === this.baseDomain || cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
      return {};
    }

    if (cleanHost.endsWith(`.${this.baseDomain}`)) {
      const subdomain = cleanHost.replace(`.${this.baseDomain}`, '');
      return { slug: subdomain };
    }

    // Otherwise treat as custom domain (e.g. app.acmecorp.com)
    return { customDomain: cleanHost };
  }
}
