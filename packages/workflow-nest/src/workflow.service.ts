import { Injectable } from '@nestjs/common';
import { generateId } from '@gigalibs/crypto';
import { WorkflowEngine, type WorkflowRule } from '@gigalibs/workflow-engine';

@Injectable()
export class WorkflowService {
  private rules: WorkflowRule[] = [];

  async createRule(rule: Omit<WorkflowRule, 'id'>): Promise<WorkflowRule> {
    const newRule: WorkflowRule = {
      ...rule,
      id: generateId(),
    };
    this.rules.push(newRule);
    return newRule;
  }

  async getRules(): Promise<WorkflowRule[]> {
    return this.rules;
  }

  async triggerEvent(eventName: string, data: Record<string, unknown>) {
    const actions = WorkflowEngine.getActionsToExecute(this.rules, eventName, data);
    return {
      eventName,
      matchedActionsCount: actions.length,
      actions,
    };
  }
}
