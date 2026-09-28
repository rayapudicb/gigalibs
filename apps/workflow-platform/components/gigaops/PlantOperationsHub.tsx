'use client';

import {
  ArrowPath,
  BadgeCheck,
  Calendar,
  CheckCircle,
  Clock,
  ExclamationCircle,
  Eye,
  MapPin,
  PencilSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from '@medusajs/icons';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from '@medusajs/ui';
import { useState } from 'react';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface ShiftAssignment {
  id: string;
  workerName: string;
  workerId: string;
  role: string;
  shift: 'MORNING' | 'EVENING' | 'NIGHT';
  shiftTime: string;
  line: string;
  status: 'CLOCKED_IN' | 'SCHEDULED' | 'ON_BREAK' | 'COMPLETED' | 'ABSENT';
  clockInTime?: string;
  clockOutTime?: string;
  geofenceStatus: 'VERIFIED' | 'OUT_OF_BOUNDS' | 'PENDING';
}

export interface InspectionRecord {
  id: string;
  equipmentCode: string;
  equipmentName: string;
  line: string;
  inspectorName: string;
  timestamp: string;
  bearingTempC: number;
  vibrationMmS: number;
  oilLevelOk: boolean;
  guardLocked: boolean;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  defectTicketId?: string;
  notes?: string;
  signedBy: string;
}

export interface ShiftHandoverLog {
  id: string;
  date: string;
  outgoingShift: 'MORNING' | 'EVENING' | 'NIGHT';
  incomingShift: 'MORNING' | 'EVENING' | 'NIGHT';
  outgoingLead: string;
  incomingLead: string;
  unitsProduced: number;
  completedRounds: number;
  totalRounds: number;
  openIncidents: string[];
  equipmentNotes: string;
  outgoingSignedAt?: string;
  incomingSignedAt?: string;
  auditHash?: string;
  status: 'DRAFT' | 'OUTGOING_SIGNED' | 'COMPLETED';
}

// ─── Initial Demo State ───────────────────────────────────────────────────────

const INITIAL_SHIFTS: ShiftAssignment[] = [
  {
    id: 's-1',
    workerName: 'Ramana Rao',
    workerId: 'GW-204192',
    role: 'Mechanical Maintenance Tech',
    shift: 'MORNING',
    shiftTime: '06:00 – 14:00',
    line: 'Kiln Line 1',
    status: 'CLOCKED_IN',
    clockInTime: '05:54 AM',
    geofenceStatus: 'VERIFIED',
  },
  {
    id: 's-2',
    workerName: 'Suresh Kumar',
    workerId: 'GW-104928',
    role: 'Senior Process Operator',
    shift: 'MORNING',
    shiftTime: '06:00 – 14:00',
    line: 'Kiln Line 1',
    status: 'CLOCKED_IN',
    clockInTime: '05:58 AM',
    geofenceStatus: 'VERIFIED',
  },
  {
    id: 's-3',
    workerName: 'Anil Varma',
    workerId: 'GW-309114',
    role: 'Line Operator',
    shift: 'MORNING',
    shiftTime: '06:00 – 14:00',
    line: 'Ceramic Press Line 2',
    status: 'CLOCKED_IN',
    clockInTime: '06:02 AM',
    geofenceStatus: 'VERIFIED',
  },
  {
    id: 's-4',
    workerName: 'Ravi Teja',
    workerId: 'GW-402910',
    role: 'Apprentice Inspector',
    shift: 'MORNING',
    shiftTime: '06:00 – 14:00',
    line: 'Packaging Line 3',
    status: 'ON_BREAK',
    clockInTime: '06:00 AM',
    geofenceStatus: 'VERIFIED',
  },
  {
    id: 's-5',
    workerName: 'Prakash Naidu',
    workerId: 'GW-509122',
    role: 'Electrical Specialist',
    shift: 'MORNING',
    shiftTime: '06:00 – 14:00',
    line: 'Kiln Line 1',
    status: 'ABSENT',
    geofenceStatus: 'PENDING',
  },
  {
    id: 's-6',
    workerName: 'Kalyan Chakravarthy',
    workerId: 'GW-601994',
    role: 'Lead Supervisor',
    shift: 'EVENING',
    shiftTime: '14:00 – 22:00',
    line: 'Kiln Line 1',
    status: 'SCHEDULED',
    geofenceStatus: 'PENDING',
  },
];

const INITIAL_INSPECTIONS: InspectionRecord[] = [
  {
    id: 'insp-1',
    equipmentCode: 'K1-MOT-04',
    equipmentName: 'Kiln 1 Exhaust Fan Motor #4',
    line: 'Kiln Line 1',
    inspectorName: 'Suresh Kumar',
    timestamp: 'Today, 08:30 AM',
    bearingTempC: 84.5,
    vibrationMmS: 7.4,
    oilLevelOk: true,
    guardLocked: true,
    status: 'WARNING',
    defectTicketId: 'INC-409',
    notes: 'Bearing temperature elevated above 80°C threshold. Work order WO-1841 auto-dispatched.',
    signedBy: 'Suresh Kumar (Cryptographic Token #e9a2)',
  },
  {
    id: 'insp-2',
    equipmentCode: 'K1-PUMP-02',
    equipmentName: 'Hydraulic Cooling Pump P-02',
    line: 'Kiln Line 1',
    inspectorName: 'Ramana Rao',
    timestamp: 'Today, 07:15 AM',
    bearingTempC: 54.0,
    vibrationMmS: 2.1,
    oilLevelOk: true,
    guardLocked: true,
    status: 'NORMAL',
    signedBy: 'Ramana Rao (Cryptographic Token #88f1)',
  },
];

const INITIAL_HANDOVER: ShiftHandoverLog = {
  id: 'ho-2026-0927-1',
  date: 'Today, 27 Sept 2026',
  outgoingShift: 'MORNING',
  incomingShift: 'EVENING',
  outgoingLead: 'Suresh Kumar (Shift 1 Lead)',
  incomingLead: 'Kalyan Chakravarthy (Shift 2 Lead)',
  unitsProduced: 14200,
  completedRounds: 48,
  totalRounds: 50,
  openIncidents: ['INC-409: Motor #4 High Temp (In Progress by Ramana Rao)'],
  equipmentNotes: 'Kiln 1 operating stable at 1150°C. Motor 4 bearing inspected at 08:30 AM; lubrication refreshed. Maintain 30-min vibration patrol on Line 2.',
  outgoingSignedAt: '13:50 PM',
  status: 'OUTGOING_SIGNED',
};

// ─── Main Hub Component ───────────────────────────────────────────────────────

export function PlantOperationsHub({ initialTab = 'scheduling' }: { initialTab?: 'scheduling' | 'time' | 'rounds' | 'handover' }) {
  const [activeTab, setActiveTab] = useState<'scheduling' | 'time' | 'rounds' | 'handover'>(initialTab);
  const [shifts, setShifts] = useState<ShiftAssignment[]>(INITIAL_SHIFTS);
  const [inspections, setInspections] = useState<InspectionRecord[]>(INITIAL_INSPECTIONS);
  const [handover, setHandover] = useState<ShiftHandoverLog>(INITIAL_HANDOVER);

  // Frontline mobile clock state
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [lastClockTime, setLastClockTime] = useState('05:54 AM');

  // Inspection form state
  const [bearingTemp, setBearingTemp] = useState('84.5');
  const [vibrationVal, setVibrationVal] = useState('7.4');
  const [oilOk, setOilOk] = useState(true);
  const [guardOk, setGuardOk] = useState(true);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [submittingInspection, setSubmittingInspection] = useState(false);
  const [inspectionSuccess, setInspectionSuccess] = useState<string | null>(null);

  // Handover state
  const [handoverNotes, setHandoverNotes] = useState(handover.equipmentNotes);
  const [countersigning, setCountersigning] = useState(false);

  // Quick stats
  const activeCount = shifts.filter((s) => s.status === 'CLOCKED_IN').length;
  const breakCount = shifts.filter((s) => s.status === 'ON_BREAK').length;
  const scheduledCount = shifts.filter((s) => s.status === 'SCHEDULED').length;
  const absentCount = shifts.filter((s) => s.status === 'ABSENT').length;

  const handleClockToggle = () => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isClockedIn) {
      setIsClockedIn(false);
      setShifts((prev) =>
        prev.map((s) => (s.id === 's-1' ? { ...s, status: 'COMPLETED', clockOutTime: now } : s))
      );
    } else {
      setIsClockedIn(true);
      setLastClockTime(now);
      setShifts((prev) =>
        prev.map((s) => (s.id === 's-1' ? { ...s, status: 'CLOCKED_IN', clockInTime: now } : s))
      );
    }
  };

  const handleSubmitRound = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingInspection(true);
    setInspectionSuccess(null);

    const tempNum = parseFloat(bearingTemp) || 0;
    const vibeNum = parseFloat(vibrationVal) || 0;
    const isWarning = tempNum > 80 || vibeNum > 7.0;

    setTimeout(() => {
      const newRecord: InspectionRecord = {
        id: `insp-${Date.now()}`,
        equipmentCode: 'K1-MOT-04',
        equipmentName: 'Kiln 1 Exhaust Fan Motor #4',
        line: 'Kiln Line 1',
        inspectorName: 'Current User (Ramana Rao)',
        timestamp: 'Just now',
        bearingTempC: tempNum,
        vibrationMmS: vibeNum,
        oilLevelOk: oilOk,
        guardLocked: guardOk,
        status: isWarning ? 'WARNING' : 'NORMAL',
        defectTicketId: isWarning ? `INC-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : undefined,
        notes: inspectionNotes || (isWarning ? 'Threshold exceeded. Auto-dispatched work order.' : 'All clear.'),
        signedBy: 'Ramana Rao (Verified Mobile Hardware Enclave)',
      };

      setInspections([newRecord, ...inspections]);
      setSubmittingInspection(false);
      setInspectionSuccess(
        isWarning
          ? `⚠️ Warning recorded: Bearing temperature (${tempNum}°C) exceeded 80°C threshold. Incident ticket ${newRecord.defectTicketId} created and dispatched to maintenance!`
          : `✅ Inspection successfully recorded. All parameters within safe limits.`
      );
    }, 400);
  };

  const handleCountersignHandover = () => {
    setCountersigning(true);
    setTimeout(() => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setHandover({
        ...handover,
        incomingSignedAt: now,
        status: 'COMPLETED',
        auditHash: 'sha256-8a901f4c99e210ab78345cd891bca7821034fe8923019abb',
      });
      setCountersigning(false);
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* ── Sub-Navigation / Capability Switcher ── */}
      <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text size="xsmall" weight="plus" className="uppercase tracking-widest text-ui-fg-muted">
              Manufacturing & Field Operations Hub
            </Text>
            <Heading level="h2" className="mt-1">
              Samalkot Plant · Operational Command
            </Heading>
          </div>
          <div className="flex gap-2">
            <Button
              size="small"
              variant={activeTab === 'scheduling' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('scheduling')}
            >
              <Calendar /> Shift Roster
            </Button>
            <Button
              size="small"
              variant={activeTab === 'time' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('time')}
            >
              <Clock /> Clock & Muster ({activeCount} Active)
            </Button>
            <Button
              size="small"
              variant={activeTab === 'rounds' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('rounds')}
            >
              <ShieldCheck /> Operator Rounds (Form Engine)
            </Button>
            <Button
              size="small"
              variant={activeTab === 'handover' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('handover')}
            >
              <BadgeCheck /> Shift Handover Log
            </Button>
          </div>
        </div>
      </Container>

      {/* ── TAB 1: SHIFT ROSTER & SCHEDULING ── */}
      {activeTab === 'scheduling' && (
        <div className="space-y-5">
          {/* Summary KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Container className="p-4">
              <Text size="xsmall" className="text-ui-fg-muted">Morning Shift (06:00 – 14:00)</Text>
              <p className="mt-2 text-2xl font-bold text-ui-fg-base">5 Scheduled</p>
              <Badge color="green" size="small" className="mt-2">Kiln Line 1 & Press 2</Badge>
            </Container>
            <Container className="p-4">
              <Text size="xsmall" className="text-ui-fg-muted">Evening Shift (14:00 – 22:00)</Text>
              <p className="mt-2 text-2xl font-bold text-ui-fg-base">4 Scheduled</p>
              <Badge color="blue" size="small" className="mt-2">Roster Locked</Badge>
            </Container>
            <Container className="p-4">
              <Text size="xsmall" className="text-ui-fg-muted">Night Shift (22:00 – 06:00)</Text>
              <p className="mt-2 text-2xl font-bold text-ui-fg-base">3 Scheduled</p>
              <Badge color="purple" size="small" className="mt-2">Maintenance Window</Badge>
            </Container>
            <Container className="p-4">
              <Text size="xsmall" className="text-ui-fg-muted">Total Floor Coverage</Text>
              <p className="mt-2 text-2xl font-bold text-ui-fg-base">92% Target</p>
              <Badge color="green" size="small" className="mt-2">Zero Fatigue Breaches</Badge>
            </Container>
          </div>

          {/* Roster Table */}
          <Container className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Heading level="h3">Today's Plant Roster & Station Assignments</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Rotations and certified skill assignments across Kiln and Press lines.
                </Text>
              </div>
              <Button size="small" variant="secondary">
                <Plus /> Add Shift Slot
              </Button>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker & Badge</Table.HeaderCell>
                  <Table.HeaderCell>Role & Capability</Table.HeaderCell>
                  <Table.HeaderCell>Assigned Shift</Table.HeaderCell>
                  <Table.HeaderCell>Plant Station / Line</Table.HeaderCell>
                  <Table.HeaderCell>Attendance Status</Table.HeaderCell>
                  <Table.HeaderCell>Geofence Lock</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shifts.map((s) => (
                  <Table.Row key={s.id}>
                    <Table.Cell>
                      <div>
                        <Text weight="plus">{s.workerName}</Text>
                        <Text size="xsmall" className="text-ui-fg-muted">{s.workerId}</Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{s.role}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <div>
                        <Badge size="small" color={s.shift === 'MORNING' ? 'orange' : s.shift === 'EVENING' ? 'blue' : 'purple'}>
                          {s.shift}
                        </Badge>
                        <Text size="xsmall" className="text-ui-fg-muted mt-1">{s.shiftTime}</Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" weight="plus">{s.line}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge
                        color={
                          s.status === 'CLOCKED_IN'
                            ? 'green'
                            : s.status === 'ON_BREAK'
                            ? 'orange'
                            : s.status === 'ABSENT'
                            ? 'red'
                            : 'grey'
                        }
                      >
                        {s.status.replace('_', ' ')}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="small" color={s.geofenceStatus === 'VERIFIED' ? 'green' : 'grey'}>
                        <MapPin className="mr-1" /> {s.geofenceStatus}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}

      {/* ── TAB 2: TIME & ATTENDANCE + FRONTLINE MOBILE CLOCK-IN ── */}
      {activeTab === 'time' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left 1/3: Frontline Mobile View Simulation */}
          <Container className="p-6 border-2 border-ui-border-strong bg-ui-bg-subtle lg:col-span-1">
            <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
              <div>
                <Badge color="green" size="small">📱 Frontline Mobile View</Badge>
                <Heading level="h3" className="mt-2">My Shift Command</Heading>
              </div>
              <StatusBadge color={isClockedIn ? 'green' : 'grey'}>
                {isClockedIn ? 'ON DUTY' : 'OFF DUTY'}
              </StatusBadge>
            </div>

            <div className="mt-6 text-center space-y-4">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-ui-bg-base border-4 border-ui-border-strong shadow-md">
                <Clock className="h-10 w-10 text-ui-fg-interactive" />
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wider">Assigned Station</Text>
                <Heading level="h2" className="mt-1">Kiln Line 1</Heading>
                <Text size="small" className="text-ui-fg-subtle">Morning Shift (06:00 – 14:00)</Text>
              </div>

              <div className="rounded-lg bg-ui-bg-base p-3 border border-ui-border-base text-left space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-ui-fg-muted">Worker:</span>
                  <span className="font-semibold text-ui-fg-base">Ramana Rao (GW-204192)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ui-fg-muted">Clock In:</span>
                  <span className="font-semibold text-ui-fg-base">{lastClockTime}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ui-fg-muted">Geofence:</span>
                  <span className="text-ui-fg-success font-semibold flex items-center">
                    <MapPin className="mr-1 inline" /> Samalkot Plant (Verified)
                  </span>
                </div>
              </div>

              <Button
                size="large"
                variant={isClockedIn ? 'danger' : 'primary'}
                className="w-full text-base font-semibold py-3"
                onClick={handleClockToggle}
              >
                {isClockedIn ? 'Tap to Clock Out' : 'Tap to Clock In (GPS Geofenced)'}
              </Button>

              <Text size="xsmall" className="text-ui-fg-muted">
                Hardware Enclave Monotonic Tick Signed · Anti-Tamper Enabled
              </Text>
            </div>
          </Container>

          {/* Right 2/3: Supervisor Attendance & Muster Board */}
          <Container className="p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <Heading level="h3">Supervisor Muster Board & Floor Headcount</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Real-time physical presence on the floor. Replaces paper sign-in muster rolls.
                </Text>
              </div>
              <Button size="small" variant="secondary">
                <CheckCircle /> One-Click Approve Muster Roll
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-5 text-center">
              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                <Text size="xsmall" className="text-ui-fg-muted">On Floor</Text>
                <p className="text-xl font-bold text-ui-fg-success">{activeCount}</p>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                <Text size="xsmall" className="text-ui-fg-muted">On Break</Text>
                <p className="text-xl font-bold text-ui-fg-warning">{breakCount}</p>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                <Text size="xsmall" className="text-ui-fg-muted">Scheduled</Text>
                <p className="text-xl font-bold text-ui-fg-base">{scheduledCount}</p>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
                <Text size="xsmall" className="text-ui-fg-muted">Absent / Late</Text>
                <p className="text-xl font-bold text-ui-fg-error">{absentCount}</p>
              </div>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Line</Table.HeaderCell>
                  <Table.HeaderCell>Clock Time</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shifts.map((s) => (
                  <Table.Row key={s.id}>
                    <Table.Cell>
                      <Text weight="plus">{s.workerName}</Text>
                      <Text size="xsmall" className="text-ui-fg-muted">{s.role}</Text>
                    </Table.Cell>
                    <Table.Cell><Text size="small">{s.line}</Text></Table.Cell>
                    <Table.Cell>
                      <Text size="small">{s.clockInTime || '—'}</Text>
                      {s.clockOutTime && <Text size="xsmall" className="text-ui-fg-muted">Out: {s.clockOutTime}</Text>}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge
                        color={
                          s.status === 'CLOCKED_IN'
                            ? 'green'
                            : s.status === 'ON_BREAK'
                            ? 'orange'
                            : s.status === 'ABSENT'
                            ? 'red'
                            : 'grey'
                        }
                      >
                        {s.status.replace('_', ' ')}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <Button size="small" variant="transparent" className="text-ui-fg-interactive">
                        Verify GPS
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}

      {/* ── TAB 3: OPERATOR ROUNDS & DYNAMIC INSPECTION CHECKLIST ── */}
      {activeTab === 'rounds' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Dynamic Form Engine Entry */}
          <Container className="p-6">
            <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
              <div>
                <Badge color="blue" size="small">Dynamic Form Engine v1.4</Badge>
                <Heading level="h3" className="mt-1">Kiln 1 Motor #4 · Daily Operator Round</Heading>
                <Text size="xsmall" className="text-ui-fg-muted">
                  Spatial Checkpoint: Samalkot Plant › Kiln Line 1 › Walkway Panel B
                </Text>
              </div>
              <Badge size="small" color="green">Active Schema</Badge>
            </div>

            {inspectionSuccess && (
              <Alert variant={inspectionSuccess.startsWith('⚠️') ? 'warning' : 'success'} className="mt-4">
                {inspectionSuccess}
              </Alert>
            )}

            <form onSubmit={handleSubmitRound} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="bearing-temp">
                  Bearing Housing Temperature (°C) <span className="text-ui-fg-error">*</span>
                </Label>
                <Input
                  id="bearing-temp"
                  type="number"
                  step="0.1"
                  value={bearingTemp}
                  onChange={(e) => setBearingTemp(e.target.value)}
                  className="mt-1"
                />
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  Operating limit: 20°C to 100°C. <strong>Warning alert threshold: &gt; 80°C</strong>
                </Text>
                {parseFloat(bearingTemp) > 80 && (
                  <Text size="xsmall" className="text-ui-fg-error font-medium mt-1">
                    ⚠️ Reading exceeds 80°C limit! Submitting will auto-create maintenance incident.
                  </Text>
                )}
              </div>

              <div>
                <Label htmlFor="vibe-dial">
                  Vibration Severity Dial (mm/s RMS) <span className="text-ui-fg-error">*</span>
                </Label>
                <Input
                  id="vibe-dial"
                  type="number"
                  step="0.1"
                  value={vibrationVal}
                  onChange={(e) => setVibrationVal(e.target.value)}
                  className="mt-1"
                />
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  ISO 10816 Vibration severity. <strong>Warning threshold: &gt; 7.0 mm/s</strong>
                </Text>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base flex items-center justify-between">
                  <Text size="small" weight="plus">Lubrication Level OK?</Text>
                  <input
                    type="checkbox"
                    checked={oilOk}
                    onChange={(e) => setOilOk(e.target.checked)}
                    className="h-5 w-5 rounded border-ui-border-base accent-ui-fg-interactive"
                  />
                </div>
                <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base flex items-center justify-between">
                  <Text size="small" weight="plus">Safety Guard Locked?</Text>
                  <input
                    type="checkbox"
                    checked={guardOk}
                    onChange={(e) => setGuardOk(e.target.checked)}
                    className="h-5 w-5 rounded border-ui-border-base accent-ui-fg-interactive"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="insp-notes">Operator Observations & Anomaly Notes</Label>
                <Textarea
                  id="insp-notes"
                  rows={2}
                  placeholder="Record unusual sounds, steam leaks, or belt alignment observations..."
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-dashed border-ui-border-strong text-center">
                <Text size="small" weight="plus">📷 Camera Evidence Attached</Text>
                <Text size="xsmall" className="text-ui-fg-muted">
                  Auto-watermarked with GPS 17.054°N, 82.238°E · 27-09-2026 08:30:14 IST
                </Text>
              </div>

              <Button
                type="submit"
                size="large"
                variant="primary"
                className="w-full mt-4"
                disabled={submittingInspection}
              >
                {submittingInspection ? 'Submitting & Validating AST Rules...' : 'Submit Operator Round & Sign'}
              </Button>
            </form>
          </Container>

          {/* Right: Inspection History & Live Work Order Dispatch */}
          <Container className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Heading level="h3">Live Round Audits & Incident Log</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Immutable inspection history for ISO 9001 and OSHA safety audits.
                </Text>
              </div>
              <Badge color="green" size="small">Audit Chain Sealed</Badge>
            </div>

            <div className="space-y-4">
              {inspections.map((insp) => (
                <div
                  key={insp.id}
                  className={`p-4 rounded-lg border ${
                    insp.status === 'WARNING'
                      ? 'border-ui-tag-orange-border bg-ui-tag-orange-bg/10'
                      : 'border-ui-border-base bg-ui-bg-base'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Text weight="plus">{insp.equipmentName}</Text>
                        <StatusBadge color={insp.status === 'WARNING' ? 'orange' : 'green'}>
                          {insp.status}
                        </StatusBadge>
                      </div>
                      <Text size="xsmall" className="text-ui-fg-muted mt-1">
                        {insp.equipmentCode} · {insp.line} · {insp.timestamp}
                      </Text>
                    </div>
                    {insp.defectTicketId && (
                      <Badge color="red" size="small">
                        {insp.defectTicketId} Open
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-ui-bg-subtle p-2 rounded">
                    <div>
                      <span className="text-ui-fg-muted">Bearing Temp: </span>
                      <strong className={insp.bearingTempC > 80 ? 'text-ui-fg-error' : ''}>
                        {insp.bearingTempC}°C
                      </strong>
                    </div>
                    <div>
                      <span className="text-ui-fg-muted">Vibration RMS: </span>
                      <strong className={insp.vibrationMmS > 7 ? 'text-ui-fg-error' : ''}>
                        {insp.vibrationMmS} mm/s
                      </strong>
                    </div>
                    <div>
                      <span className="text-ui-fg-muted">Oil Level: </span>
                      <span>{insp.oilLevelOk ? '✅ Normal' : '❌ Low'}</span>
                    </div>
                    <div>
                      <span className="text-ui-fg-muted">Safety Guard: </span>
                      <span>{insp.guardLocked ? '✅ Locked' : '❌ Open'}</span>
                    </div>
                  </div>

                  {insp.notes && (
                    <Text size="xsmall" className="mt-2 text-ui-fg-subtle italic">
                      "{insp.notes}"
                    </Text>
                  )}

                  <div className="mt-3 pt-2 border-t border-ui-border-base flex items-center justify-between text-[11px] text-ui-fg-muted">
                    <span>✍️ Signed by: {insp.signedBy}</span>
                    <span className="text-ui-fg-interactive cursor-pointer hover:underline">View Proof</span>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </div>
      )}

      {/* ── TAB 4: SHIFT HANDOVER LOG ── */}
      {activeTab === 'handover' && (
        <Container className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-ui-border-base">
            <div>
              <Badge color="purple" size="small">Two-Party Custody Protocol</Badge>
              <Heading level="h2" className="mt-1">
                Shift Handover · {handover.outgoingShift} to {handover.incomingShift}
              </Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Date: {handover.date} · Plant: Samalkot Ceramics (Kiln & Press Lines)
              </Text>
            </div>
            <StatusBadge color={handover.status === 'COMPLETED' ? 'green' : 'orange'}>
              {handover.status === 'COMPLETED' ? 'HANDOVER COMPLETED & SEALED' : 'AWAITING INCOMING COUNTERSIGNATURE'}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Shift Operational Metrics */}
            <div className="space-y-4 lg:col-span-1">
              <Heading level="h3">Shift Production & Rounds Summary</Heading>
              <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ui-fg-muted">Total Units Produced:</span>
                  <strong className="text-lg text-ui-fg-base">{handover.unitsProduced.toLocaleString()} units</strong>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ui-fg-muted">Operator Rounds Completed:</span>
                  <strong className="text-ui-fg-success">{handover.completedRounds} / {handover.totalRounds} (96%)</strong>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ui-fg-muted">Active Safety Incidents:</span>
                  <strong className="text-ui-fg-warning">1 Open Ticket</strong>
                </div>
              </div>

              <div className="p-4 bg-ui-tag-orange-bg/15 rounded-lg border border-ui-tag-orange-border">
                <Text size="small" weight="plus" className="text-ui-fg-error flex items-center">
                  <ExclamationCircle className="mr-1 inline" /> Unresolved Operational Item
                </Text>
                <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                  <strong>INC-409:</strong> Motor #4 Bearing Running Hot (84.5°C). Lubrication refreshed by Ramana Rao at 08:30 AM. Next vibration patrol required at 14:30 PM.
                </Text>
              </div>
            </div>

            {/* Handover Notes & Two-Party Signatures */}
            <div className="space-y-5 lg:col-span-2">
              <div>
                <Label htmlFor="ho-notes">Outgoing Shift Lead Handover Briefing</Label>
                <Textarea
                  id="ho-notes"
                  rows={4}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Two-Party Sign-off Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Outgoing Lead Card */}
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base space-y-2">
                  <div className="flex items-center justify-between">
                    <Text size="xsmall" className="text-ui-fg-muted uppercase font-bold">1. Outgoing Shift Lead</Text>
                    <Badge color="green" size="small"><CheckCircle className="mr-1 inline" /> Signed</Badge>
                  </div>
                  <Text weight="plus" className="text-base">{handover.outgoingLead}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Digital Signature Verified at {handover.outgoingSignedAt} IST
                  </Text>
                  <div className="text-[11px] text-ui-fg-muted bg-ui-bg-base p-2 rounded border border-ui-border-base font-mono">
                    Token: sha256-4b92...88f1
                  </div>
                </div>

                {/* Incoming Lead Card */}
                <div className="p-4 bg-ui-bg-subtle rounded-lg border border-ui-border-base space-y-2">
                  <div className="flex items-center justify-between">
                    <Text size="xsmall" className="text-ui-fg-muted uppercase font-bold">2. Incoming Shift Lead</Text>
                    <Badge color={handover.status === 'COMPLETED' ? 'green' : 'orange'} size="small">
                      {handover.status === 'COMPLETED' ? <><CheckCircle className="mr-1 inline" /> Countersigned</> : 'Pending Acceptance'}
                    </Badge>
                  </div>
                  <Text weight="plus" className="text-base">{handover.incomingLead}</Text>
                  {handover.status === 'COMPLETED' ? (
                    <>
                      <Text size="xsmall" className="text-ui-fg-muted">
                        Countersigned at {handover.incomingSignedAt} IST
                      </Text>
                      <div className="text-[11px] text-ui-fg-muted bg-ui-bg-base p-2 rounded border border-ui-border-base font-mono">
                        Audit Root: {handover.auditHash}
                      </div>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="primary"
                      className="w-full mt-2"
                      onClick={handleCountersignHandover}
                      disabled={countersigning}
                    >
                      {countersigning ? 'Verifying & Signing...' : 'Acknowledge & Countersign Handover'}
                    </Button>
                  )}
                </div>
              </div>

              {handover.status === 'COMPLETED' && (
                <Alert variant="success" className="mt-3">
                  🎉 <strong>Shift Handover Sealed:</strong> Legal operational responsibility transferred to Kalyan Chakravarthy (Evening Shift). Cryptographic audit proof recorded.
                </Alert>
              )}
            </div>
          </div>
        </Container>
      )}
    </div>
  );
}
