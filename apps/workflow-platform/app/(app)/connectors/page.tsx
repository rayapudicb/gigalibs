'use client';

import Link from 'next/link';
import { Button, Container, Heading, Text } from '@medusajs/ui';

// WI-OI-120ak (S3, owner "S3 a" then "S3 b"): this page listed a hard-coded catalogue of eight outside services, called
// them "production-ready", and its "Connect" pretended to save credentials. The Connector Hub cannot log in to outside
// services yet (modules/universal-connector-hub/module.yaml: outbound logins are planned, WI-OI-104), so the catalogue
// and the per-connector page are removed and this page says what is available today.
export default function ConnectorsPage() {
  return (
    <div className="min-h-screen bg-ui-bg-subtle p-6 font-sans">
      <div className="mx-auto max-w-3xl">
        <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">Connectors</Heading>
        <Container className="mt-6 space-y-3 p-6">
          <Heading level="h2">Connecting to outside services is not available yet</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Logging in to outside services such as a CRM or an ERP, and keeping their credentials, is planned in the Connector
            Hub. Nothing can be connected from this page.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Available today, under Connections: receiving signed webhooks from your systems, and scheduled pulls from a source
            you set up, both recorded in this workspace's intake journal.
          </Text>
          <Link href="/connections">
            <Button variant="secondary" size="small">Open Connections</Button>
          </Link>
        </Container>
      </div>
    </div>
  );
}
