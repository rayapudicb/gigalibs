import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';
import { ExactDecimal, SCALE_FACTOR } from '../handshake/commercial-operational.js';

/** Minor currency extension: decimal quantity × integer unit cost (Module 7 / WI-OI-129 S2). */
export function projectLineExtensionMinor(quantity: string, unitCostMinor: string): bigint {
  DecimalQuantitySchema.parse(quantity);
  MoneyMinorSchema.parse(unitCostMinor);
  const scaledQty = ExactDecimal.toScaledBigInt(quantity);
  const unit = BigInt(unitCostMinor);
  const product = scaledQty * unit;
  const half = SCALE_FACTOR / 2n;
  return (product + (product >= 0n ? half : -half)) / SCALE_FACTOR;
}

export const ProjectMaterialAccrualLineV1Schema = z
  .object({
    issueId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    quantity: DecimalQuantitySchema,
    unitCostMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectMaterialAccrualLineV1 = z.infer<typeof ProjectMaterialAccrualLineV1Schema>;

export const ProjectLaborAccrualLineV1Schema = z
  .object({
    timesheetId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    hours: DecimalQuantitySchema,
    hourlyRateMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectLaborAccrualLineV1 = z.infer<typeof ProjectLaborAccrualLineV1Schema>;

export const ProjectCostAccrualInputV1Schema = z
  .object({
    materialLines: z.array(ProjectMaterialAccrualLineV1Schema),
    laborLines: z.array(ProjectLaborAccrualLineV1Schema),
  })
  .strict();

export const ProjectTaskCostAccrualV1Schema = z
  .object({
    taskId: z.string().uuid().nullable(),
    materialMinor: MoneyMinorSchema,
    laborMinor: MoneyMinorSchema,
    totalMinor: MoneyMinorSchema,
  })
  .strict();

export const ProjectCostAccrualByProjectV1Schema = z
  .object({
    projectId: z.string().uuid(),
    materialMinor: MoneyMinorSchema,
    laborMinor: MoneyMinorSchema,
    totalMinor: MoneyMinorSchema,
    tasks: z.array(ProjectTaskCostAccrualV1Schema),
  })
  .strict();

export const ProjectCostAccrualResultV1Schema = z
  .object({
    materialMinor: MoneyMinorSchema,
    laborMinor: MoneyMinorSchema,
    totalMinor: MoneyMinorSchema,
    projects: z.array(ProjectCostAccrualByProjectV1Schema),
  })
  .strict();
export type ProjectCostAccrualResultV1 = z.infer<typeof ProjectCostAccrualResultV1Schema>;

function addMinor(a: bigint, b: bigint): bigint {
  return a + b;
}

function minorToString(value: bigint): string {
  return value.toString();
}

type TaskBucket = { material: bigint; labor: bigint };
type ProjectBucket = { material: bigint; labor: bigint; tasks: Map<string, TaskBucket> };

/** Pure rollup of material issues and approved labor into project/task WIP cost (WI-OI-129 S2). */
export function accrueProjectCosts(input: z.infer<typeof ProjectCostAccrualInputV1Schema>): ProjectCostAccrualResultV1 {
  const parsed = ProjectCostAccrualInputV1Schema.parse(input);
  const projects = new Map<string, ProjectBucket>();

  const ensureProject = (projectId: string): ProjectBucket => {
    let bucket = projects.get(projectId);
    if (!bucket) {
      bucket = { material: 0n, labor: 0n, tasks: new Map() };
      projects.set(projectId, bucket);
    }
    return bucket;
  };

  const ensureTask = (project: ProjectBucket, taskId: string | null): TaskBucket => {
    const key = taskId ?? '__none__';
    let bucket = project.tasks.get(key);
    if (!bucket) {
      bucket = { material: 0n, labor: 0n };
      project.tasks.set(key, bucket);
    }
    return bucket;
  };

  for (const line of parsed.materialLines) {
    const amount = projectLineExtensionMinor(line.quantity, line.unitCostMinor);
    const project = ensureProject(line.projectId);
    const task = ensureTask(project, line.taskId);
    project.material = addMinor(project.material, amount);
    task.material = addMinor(task.material, amount);
  }

  for (const line of parsed.laborLines) {
    const amount = projectLineExtensionMinor(line.hours, line.hourlyRateMinor);
    const project = ensureProject(line.projectId);
    const task = ensureTask(project, line.taskId);
    project.labor = addMinor(project.labor, amount);
    task.labor = addMinor(task.labor, amount);
  }

  let totalMaterial = 0n;
  let totalLabor = 0n;
  const projectRows = [...projects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([projectId, bucket]) => {
      totalMaterial = addMinor(totalMaterial, bucket.material);
      totalLabor = addMinor(totalLabor, bucket.labor);
      const tasks = [...bucket.tasks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([taskKey, taskBucket]) => {
          const taskId = taskKey === '__none__' ? null : taskKey;
          const total = taskBucket.material + taskBucket.labor;
          return {
            taskId,
            materialMinor: minorToString(taskBucket.material),
            laborMinor: minorToString(taskBucket.labor),
            totalMinor: minorToString(total),
          };
        });
      const total = bucket.material + bucket.labor;
      return {
        projectId,
        materialMinor: minorToString(bucket.material),
        laborMinor: minorToString(bucket.labor),
        totalMinor: minorToString(total),
        tasks,
      };
    });

  return ProjectCostAccrualResultV1Schema.parse({
    materialMinor: minorToString(totalMaterial),
    laborMinor: minorToString(totalLabor),
    totalMinor: minorToString(totalMaterial + totalLabor),
    projects: projectRows,
  });
}

export const ProjectBudgetBurnV1Schema = z
  .object({
    budgetMinor: MoneyMinorSchema,
    accruedMinor: MoneyMinorSchema,
    remainingMinor: MoneyMinorSchema,
    /** Basis points 0–10000 = 0.00%–100.00% of budget consumed. */
    consumedBasisPoints: z.number().int().min(0).max(100_000),
  })
  .strict();

/** Budget vs actual for burn matrix (pure). */
export function computeProjectBudgetBurn(budgetMinor: string, accruedMinor: string): z.infer<typeof ProjectBudgetBurnV1Schema> {
  MoneyMinorSchema.parse(budgetMinor);
  MoneyMinorSchema.parse(accruedMinor);
  const budget = BigInt(budgetMinor);
  const accrued = BigInt(accruedMinor);
  const remaining = budget - accrued;
  const consumedBasisPoints =
    budget === 0n ? (accrued === 0n ? 0 : 100_000) : Number((accrued * 10_000n + budget / 2n) / budget);
  return ProjectBudgetBurnV1Schema.parse({
    budgetMinor,
    accruedMinor,
    remainingMinor: remaining.toString(),
    consumedBasisPoints: Math.min(Math.max(consumedBasisPoints, 0), 100_000),
  });
}
