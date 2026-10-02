'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoPositionsGapV1, WfoUtilisationReportV1 } from '@gigalibs/contracts';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

export function WfoForecastDashboard() {
  const [horizon, setHorizon] = useState<'30' | '60' | '90'>('30');
  const [gaps, setGaps] = useState<WfoPositionsGapV1[]>([]);
  const [utilisation, setUtilisation] = useState<WfoUtilisationReportV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate = new Date(today.getTime() + Number(horizon) * 86400000).toISOString().slice(0, 10);
      const [gapData, utilData] = await Promise.all([
        workforceApi.wfoGetGaps({ startDate, endDate }),
        workforceApi.wfoGetUtilisation(),
      ]);
      setGaps(gapData || []);
      setUtilisation(utilData || null);
    } catch (err: any) {
      console.error('Failed to load forecast data:', err);
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await workforceApi.wfoRecalculateForecast({
        horizonDays: Number(horizon),
        source: 'HISTORICAL',
      });
      setAlertMsg(`Demand forecast recalculation completed successfully for ${horizon}-day horizon.`);
      await loadData();
    } catch (err: any) {
      console.error('Recalculation error:', err);
    } finally {
      setRecalculating(false);
    }
  };

  const totalDemand = gaps.reduce((acc, g) => acc + g.demandUnits, 0);
  const totalFilled = gaps.reduce((acc, g) => acc + g.filledUnits, 0);
  const criticalGaps = gaps.filter((g) => g.status === 'CRITICAL_GAP').length;
  const overallFillRate = totalDemand > 0 ? Number(((totalFilled / totalDemand) * 100).toFixed(1)) : 100;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL_GAP':
        return 'red';
      case 'MODERATE_GAP':
        return 'orange';
      case 'OPTIMAL':
        return 'green';
      case 'OVERSTAFFED':
        return 'purple';
      default:
        return 'grey';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level="h2" className="text-xl font-bold">Demand Forecasting & Labour Planning</Heading>
          <Text className="text-ui-fg-subtle text-sm">
            Forecast labor demand from active engagements, position quotas, and historic throughput.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ui-bg-subtle p-1 rounded-md border border-ui-border-base gap-1">
            {(['30', '60', '90'] as const).map((h) => (
              <Button
                key={h}
                size="small"
                variant={horizon === h ? 'primary' : 'transparent'}
                onClick={() => setHorizon(h)}
              >
                {h} Days
              </Button>
            ))}
          </div>
          <Button
            size="small"
            variant="secondary"
            disabled={recalculating}
            onClick={handleRecalculate}
          >
            {recalculating ? 'Recalculating...' : 'Recalculate Forecast'}
          </Button>
        </div>
      </div>

      {alertMsg && (
        <Alert variant="success">
          {alertMsg}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Total Demand Units</Text>
          <div className="text-2xl font-bold mt-1 text-ui-fg-base">{totalDemand} shifts</div>
          <Text className="text-xs text-ui-fg-muted mt-1">{horizon}-day window projection</Text>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Scheduled / Filled</Text>
          <div className="text-2xl font-bold mt-1 text-ui-fg-base">{totalFilled} shifts</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={overallFillRate >= 80 ? 'green' : 'orange'}>{overallFillRate}% Fill Rate</Badge>
          </div>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Critical Gap Days</Text>
          <div className={`text-2xl font-bold mt-1 ${criticalGaps > 0 ? 'text-ui-tag-red-text' : 'text-ui-fg-base'}`}>
            {criticalGaps}
          </div>
          <Text className="text-xs text-ui-fg-muted mt-1">Days requiring emergency staffing</Text>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Capacity Utilisation</Text>
          <div className="text-2xl font-bold mt-1 text-ui-fg-base">
            {utilisation ? `${utilisation.utilisationPct}%` : 'N/A'}
          </div>
          <Text className="text-xs text-ui-fg-muted mt-1">
            {utilisation ? `${utilisation.scheduledHours}h of ${utilisation.totalCapacityHours}h active` : 'Calculating...'}
          </Text>
        </Container>
      </div>

      {/* Gaps Table */}
      <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
        <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
          <div>
            <Heading level="h3" className="text-base font-semibold">Labour Gap Radar</Heading>
            <Text className="text-xs text-ui-fg-subtle">Day-by-day staffing capacity vs demand units</Text>
          </div>
          <Badge color="grey">{gaps.length} Projected Days</Badge>
        </div>

        {loading ? (
          <div className="p-8 text-center text-ui-fg-muted text-sm">Loading forecasting models...</div>
        ) : gaps.length === 0 ? (
          <div className="p-8 text-center text-ui-fg-muted text-sm">No forecast data available for this range.</div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Date</Table.HeaderCell>
                <Table.HeaderCell>Org Unit</Table.HeaderCell>
                <Table.HeaderCell>Demand</Table.HeaderCell>
                <Table.HeaderCell>Filled</Table.HeaderCell>
                <Table.HeaderCell>Gap</Table.HeaderCell>
                <Table.HeaderCell>Fill Rate</Table.HeaderCell>
                <Table.HeaderCell>Staffing Status</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {gaps.slice(0, 15).map((row, idx) => (
                <Table.Row key={`${row.forecastDate}-${idx}`} className="hover:bg-ui-bg-subtle-hover">
                  <Table.Cell className="font-medium text-ui-fg-base">{row.forecastDate}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">{row.orgUnitId}</Table.Cell>
                  <Table.Cell>{row.demandUnits} shifts</Table.Cell>
                  <Table.Cell>{row.filledUnits} shifts</Table.Cell>
                  <Table.Cell className={row.gapUnits > 0 ? 'text-ui-tag-red-text font-semibold' : 'text-ui-fg-muted'}>
                    {row.gapUnits > 0 ? `-${row.gapUnits}` : row.gapUnits === 0 ? '0' : `+${Math.abs(row.gapUnits)}`}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-ui-bg-subtle rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${row.fillRatePct >= 80 ? 'bg-ui-tag-green-icon' : row.fillRatePct >= 50 ? 'bg-ui-tag-orange-icon' : 'bg-ui-tag-red-icon'}`}
                          style={{ width: `${Math.min(100, row.fillRatePct)}%` }}
                        />
                      </div>
                      <span className="text-xs">{row.fillRatePct}%</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={getStatusColor(row.status) as any}>
                      {row.status.replace('_', ' ')}
                    </StatusBadge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  );
}
