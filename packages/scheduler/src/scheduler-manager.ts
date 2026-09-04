import { generateId } from '@gigalibs/crypto';
import type { ScheduledTask } from './types.js';

export class SchedulerManager {
  private tasks = new Map<string, ScheduledTask>();

  registerTask(task: Omit<ScheduledTask, 'id'>): ScheduledTask {
    const record: ScheduledTask = {
      ...task,
      id: generateId(),
      lastRunAt: null,
      nextRunAt: new Date(Date.now() + 60 * 60 * 1000), // Default 1hr next run
    };
    this.tasks.set(record.id, record);
    return record;
  }

  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  markExecuted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.lastRunAt = new Date();
    }
  }
}
