'use client';

import React, { useState } from 'react';
import { Badge, Button, Container, Heading, StatusBadge, Text } from '@medusajs/ui';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, AlertTriangle, Filter } from 'lucide-react';
import type { CmmsWorkOrder } from '@/lib/cmms-api';

interface Props {
  workOrders: CmmsWorkOrder[];
  onSelectWo: (wo: CmmsWorkOrder) => void;
  onCreateWo: () => void;
}

export default function WoCalendarView({
  workOrders,
  onSelectWo,
  onCreateWo,
}: Props) {
  // Calendar state: current month/year view
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  // Filter WOs
  const filteredWos = workOrders.filter((wo) => {
    if (filterPriority === 'ALL') return true;
    return wo.priority === filterPriority;
  });

  // Group WOs by day of current month
  const wosByDay: Record<number, CmmsWorkOrder[]> = {};
  for (const wo of filteredWos) {
    if (!wo.dueDate) continue;
    const d = new Date(wo.dueDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dayNum = d.getDate();
      if (!wosByDay[dayNum]) wosByDay[dayNum] = [];
      wosByDay[dayNum]!.push(wo);
    }
  }

  // Days array for calendar grid
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const isToday = (day: number) => {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  };

  return (
    <div className="space-y-4">
      {/* Calendar Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              {monthNames[month]} {year}
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Maintenance dispatch schedule & technician allocation timeline
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-ui-bg-base border border-ui-border-base rounded-md px-2 py-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-ui-fg-muted" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-transparent text-xs text-ui-fg-base outline-none cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="EMERGENCY">Emergency Only</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>

          <Button variant="secondary" size="small" onClick={prevMonth} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="small" onClick={today} className="h-8 px-2 text-xs font-semibold">
            Today
          </Button>
          <Button variant="secondary" size="small" onClick={nextMonth} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button variant="primary" size="small" onClick={onCreateWo} className="h-8 text-xs font-semibold">
            + New Work Order
          </Button>
        </div>
      </div>

      {/* 7-Day Header */}
      <div className="grid grid-cols-7 gap-px bg-ui-border-base border border-ui-border-base rounded-xl overflow-hidden shadow-xs">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-ui-bg-subtle py-2 text-center text-xs font-bold text-ui-fg-muted uppercase tracking-wider">
            {d}
          </div>
        ))}

        {/* Day Cells */}
        {days.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="bg-ui-bg-subtle/50 min-h-[110px] p-2" />
            );
          }

          const dayWos = wosByDay[day] || [];
          const todayCell = isToday(day);

          return (
            <div
              key={`day-${day}`}
              className={`bg-ui-bg-base min-h-[110px] p-2 flex flex-col justify-between transition-colors hover:bg-ui-bg-subtle/40 ${
                todayCell ? 'ring-2 ring-blue-500 ring-inset bg-blue-500/5' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-xs font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                    todayCell
                      ? 'bg-blue-600 text-white'
                      : 'text-ui-fg-base'
                  }`}
                >
                  {day}
                </span>
                {dayWos.length > 0 && (
                  <span className="text-[10px] font-mono text-ui-fg-muted font-semibold">
                    {dayWos.length} WO{dayWos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Event Chips */}
              <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px]">
                {dayWos.map((wo) => {
                  const isEmerg = wo.priority === 'EMERGENCY';
                  const isHigh = wo.priority === 'HIGH';

                  return (
                    <button
                      key={wo.id}
                      onClick={() => onSelectWo(wo)}
                      className={`w-full text-left px-1.5 py-1 rounded text-[11px] font-medium truncate flex items-center gap-1 border transition-all ${
                        isEmerg
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500/20'
                          : isHigh
                          ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/20'
                      }`}
                      title={`${wo.woNumber}: ${wo.title} (${wo.assignedTo || 'Unassigned'})`}
                    >
                      <span className="font-mono text-[9px] shrink-0 font-bold">
                        {wo.woNumber.split('-')[2] || 'WO'}
                      </span>
                      <span className="truncate">{wo.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
