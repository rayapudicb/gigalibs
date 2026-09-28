import { Injectable } from '@nestjs/common';

export type ConfigurationRuntimeOperation = 'current' | 'legacy' | 'preview';
export type ConfigurationRuntimeResult =
  | 'success'
  | 'adapter-not-found'
  | 'scope-denied'
  | 'entitlement-denied'
  | 'manifest-unavailable'
  | 'failed';

@Injectable()
export class ConfigurationRuntimeMetrics {
  private readonly counts = new Map<string, number>();

  record(operation: ConfigurationRuntimeOperation, result: ConfigurationRuntimeResult): void {
    const key = `${operation}:${result}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  snapshot(): ReadonlyArray<{
    operation: ConfigurationRuntimeOperation;
    result: ConfigurationRuntimeResult;
    count: number;
  }> {
    return [...this.counts.entries()]
      .map(([key, count]) => {
        const [operation, result] = key.split(':') as [
          ConfigurationRuntimeOperation,
          ConfigurationRuntimeResult,
        ];
        return { operation, result, count };
      })
      .sort((left, right) =>
        `${left.operation}:${left.result}`.localeCompare(`${right.operation}:${right.result}`),
      );
  }
}
