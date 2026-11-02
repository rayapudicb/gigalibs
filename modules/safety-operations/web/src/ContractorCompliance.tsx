'use client';

import type { ContractorCompanyV1, ContractorRosterV1 } from '@gigalibs/contracts';
import { Alert, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type SafetyApiError, safetyApi } from './safety-api';

export function ContractorCompliance() {
  const [companies, setCompanies] = useState<readonly ContractorCompanyV1[]>([]);
  const [roster, setRoster] = useState<ContractorRosterV1 | null>(null);
  const [error, setError] = useState<SafetyApiError | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [coi, setCoi] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [companyPage, rosterView] = await Promise.all([safetyApi.listContractorCompanies(), safetyApi.contractorRoster()]);
      setCompanies(companyPage.items);
      setRoster(rosterView);
    } catch (caught) {
      setError(caught as SafetyApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await safetyApi.createContractorCompany({ code: code.toUpperCase(), name, coiExpiresOn: coi });
      setCode('');
      setName('');
      setCoi('');
      await load();
    } catch (caught) {
      setError(caught as SafetyApiError);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert variant="error">{error.message}</Alert> : null}
      <Container className="p-4">
        <Heading level="h2">Vendor companies</Heading>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <div><Label htmlFor="co-code">Code</Label><Input id="co-code" value={code} onChange={(event) => setCode(event.target.value)} required /></div>
          <div><Label htmlFor="co-name">Name</Label><Input id="co-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div><Label htmlFor="co-coi">COI expires</Label><Input id="co-coi" type="date" value={coi} onChange={(event) => setCoi(event.target.value)} required /></div>
          <div className="flex items-end"><Button type="submit">Add company</Button></div>
        </form>
        <Table className="mt-4">
          <Table.Header>
            <Table.Row><Table.HeaderCell>Code</Table.HeaderCell><Table.HeaderCell>Name</Table.HeaderCell><Table.HeaderCell>COI</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell></Table.Row>
          </Table.Header>
          <Table.Body>
            {companies.map((company) => (
              <Table.Row key={company.id}>
                <Table.Cell>{company.code}</Table.Cell>
                <Table.Cell>{company.name}</Table.Cell>
                <Table.Cell>{company.coiExpiresOn}</Table.Cell>
                <Table.Cell>{company.status}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>
      <Container className="p-4">
        <Heading level="h2">On-site roster</Heading>
        <Text className="text-ui-fg-subtle">{roster ? `${roster.onSiteCount} checked in as of ${new Date(roster.asOf).toLocaleString()}` : 'Loading…'}</Text>
        <Table className="mt-4">
          <Table.Header>
            <Table.Row><Table.HeaderCell>Worker</Table.HeaderCell><Table.HeaderCell>Company</Table.HeaderCell><Table.HeaderCell>Checked in</Table.HeaderCell><Table.HeaderCell>Escorts</Table.HeaderCell></Table.Row>
          </Table.Header>
          <Table.Body>
            {(roster?.visits ?? []).map((visit) => (
              <Table.Row key={visit.id}>
                <Table.Cell>{visit.workerName}</Table.Cell>
                <Table.Cell>{visit.companyName}</Table.Cell>
                <Table.Cell>{new Date(visit.checkedInAt).toLocaleString()}</Table.Cell>
                <Table.Cell>{visit.escorts.map((entry) => entry.area).join(', ') || '—'}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Button type="button" className="mt-3" variant="secondary" onClick={() => void load()}>Refresh roster</Button>
      </Container>
    </div>
  );
}
