'use client';

import React, { useState, useEffect } from 'react';
import { Badge, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, toast } from '@medusajs/ui';
import { Users, UserCheck, Plus, Mail, Phone, ShieldCheck, Briefcase, DollarSign } from 'lucide-react';
import { requestCmms } from '@/lib/cmms-api';

interface Technician {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  ratePerHour: number;
  teamIds: string[];
  activeWos: number;
  completedWos: number;
}

interface Team {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  color: string;
}

export default function PeopleTeamsView() {
  const [activeTab, setActiveTab] = useState<'people' | 'teams'>('people');
  const [people, setPeople] = useState<Technician[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: '',
    role: 'Mechanical Technician',
    email: '',
    phone: '',
    ratePerHour: 65,
  });

  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeam, setNewTeam] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [peopleData, teamsData] = await Promise.all([
        requestCmms<Technician[]>('people'),
        requestCmms<Team[]>('teams'),
      ]);
      setPeople(peopleData || []);
      setTeams(teamsData || []);
    } catch (err: any) {
      toast.error('Failed to load people/teams', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await requestCmms('people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPerson,
          ratePerHour: Number(newPerson.ratePerHour),
        }),
      });
      toast.success('Technician Enrolled', { description: `${newPerson.name} added to plant roster.` });
      setShowPersonModal(false);
      setNewPerson({ name: '', role: 'Mechanical Technician', email: '', phone: '', ratePerHour: 65 });
      loadData();
    } catch (err: any) {
      toast.error('Failed to enroll technician', { description: err.message });
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await requestCmms('teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeam),
      });
      toast.success('Maintenance Team Formed', { description: `${newTeam.name} team created.` });
      setShowTeamModal(false);
      setNewTeam({ name: '', description: '', color: '#3b82f6' });
      loadData();
    } catch (err: any) {
      toast.error('Failed to create team', { description: err.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              Plant Maintenance Workforce & Specialized Crews
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Technician rosters, hourly burden rates, trade classifications, and assigned cross-functional teams
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowTeamModal(true)}
            className="text-xs font-semibold"
          >
            + Create Team Crew
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowPersonModal(true)}
            className="text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Technician
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ui-border-base gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('people')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'people'
              ? 'border-ui-fg-base text-ui-fg-base'
              : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Technicians & Engineers ({people.length})
        </button>

        <button
          onClick={() => setActiveTab('teams')}
          className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'teams'
              ? 'border-ui-fg-base text-ui-fg-base'
              : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <Users className="w-4 h-4" />
          Maintenance Crews & Teams ({teams.length})
        </button>
      </div>

      {/* TAB 1: PEOPLE */}
      {activeTab === 'people' && (
        <div className="border border-ui-border-base rounded-xl overflow-hidden bg-ui-bg-base shadow-xs">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Technician</Table.HeaderCell>
                <Table.HeaderCell>Trade / Specialty</Table.HeaderCell>
                <Table.HeaderCell>Hourly Labor Rate</Table.HeaderCell>
                <Table.HeaderCell>Assigned Crews</Table.HeaderCell>
                <Table.HeaderCell>Active WOs</Table.HeaderCell>
                <Table.HeaderCell>Completed</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Contact</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row>
                  <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                    Loading personnel directory...
                  </Table.Cell>
                </Table.Row>
              ) : people.length === 0 ? (
                <Table.Row>
                  <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                    No technicians enrolled.
                  </Table.Cell>
                </Table.Row>
              ) : (
                people.map((p) => {
                  const assignedTeams = teams.filter((t) => p.teamIds?.includes(t.id));

                  return (
                    <Table.Row key={p.id}>
                      <Table.Cell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-ui-bg-subtle border border-ui-border-base flex items-center justify-center font-bold text-xs text-ui-fg-base">
                            {p.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-ui-fg-base">{p.name}</p>
                            <p className="text-[10px] text-ui-fg-muted font-mono">{p.email}</p>
                          </div>
                        </div>
                      </Table.Cell>

                      <Table.Cell className="text-xs text-ui-fg-base font-medium">
                        {p.role}
                      </Table.Cell>

                      <Table.Cell className="text-xs font-mono font-bold text-emerald-600">
                        ${p.ratePerHour}/hr
                      </Table.Cell>

                      <Table.Cell>
                        <div className="flex flex-wrap gap-1">
                          {assignedTeams.length === 0 ? (
                            <span className="text-[10px] text-ui-fg-muted">—</span>
                          ) : (
                            assignedTeams.map((t) => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                                style={{
                                  backgroundColor: `${t.color}15`,
                                  color: t.color,
                                  borderColor: `${t.color}30`,
                                }}
                              >
                                {t.name}
                              </span>
                            ))
                          )}
                        </div>
                      </Table.Cell>

                      <Table.Cell>
                        <Badge size="small" color={p.activeWos > 0 ? 'orange' : 'grey'}>
                          {p.activeWos} active
                        </Badge>
                      </Table.Cell>

                      <Table.Cell className="text-xs font-mono text-ui-fg-base">
                        {p.completedWos} tickets
                      </Table.Cell>

                      <Table.Cell className="text-right text-xs font-mono text-ui-fg-subtle">
                        {p.phone || '—'}
                      </Table.Cell>
                    </Table.Row>
                  );
                })
              )}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* TAB 2: TEAMS */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-2 gap-4">
          {teams.map((t) => {
            const members = people.filter((p) => t.memberIds?.includes(p.id) || p.teamIds?.includes(t.id));

            return (
              <div
                key={t.id}
                className="p-5 rounded-xl border border-ui-border-base bg-ui-bg-base space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <h3 className="font-bold text-sm text-ui-fg-base">{t.name}</h3>
                  </div>
                  <Badge size="small" color="blue">
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <p className="text-xs text-ui-fg-subtle">{t.description}</p>

                <div className="pt-2 border-t border-ui-border-base space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
                    Rostered Crew Members
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {members.length === 0 ? (
                      <span className="text-xs text-ui-fg-muted italic">No technicians assigned yet</span>
                    ) : (
                      members.map((m) => (
                        <span
                          key={m.id}
                          className="px-2 py-0.5 rounded-md bg-ui-bg-subtle border border-ui-border-base text-xs font-medium text-ui-fg-base flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {m.name} ({m.role.split(' ')[0]})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enroll Person Modal */}
      {showPersonModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                Enroll New Plant Technician
              </Heading>
              <button
                onClick={() => setShowPersonModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePerson} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Full Name *</Label>
                <Input
                  value={newPerson.name}
                  onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                  placeholder="e.g. Rachel Hernandez"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Trade / Specialty *</Label>
                <Input
                  value={newPerson.role}
                  onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
                  placeholder="e.g. Certified Vibration Analyst"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Hourly Rate ($/hr)</Label>
                  <Input
                    type="number"
                    value={newPerson.ratePerHour}
                    onChange={(e) => setNewPerson({ ...newPerson, ratePerHour: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Direct Phone</Label>
                  <Input
                    value={newPerson.phone}
                    onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                    placeholder="+1 775-555-0199"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Corporate Email</Label>
                <Input
                  type="email"
                  value={newPerson.email}
                  onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                  placeholder="r.hernandez@plant.io"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowPersonModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Enroll Technician
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}

      {/* Create Team Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                Form Maintenance Crew / Trade Team
              </Heading>
              <button
                onClick={() => setShowTeamModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Team Name *</Label>
                <Input
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  placeholder="e.g. Hydraulics & Lube Specialists"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Mission / Area of Responsibility</Label>
                <textarea
                  rows={2}
                  value={newTeam.description}
                  onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                  placeholder="Responsible for plant-wide lubrication, oil sampling, and hydraulic repairs..."
                  className="w-full p-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Badge Color Code</Label>
                <div className="flex items-center gap-2">
                  {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTeam({ ...newTeam, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        newTeam.color === c ? 'border-ui-fg-base scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowTeamModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Form Crew
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
