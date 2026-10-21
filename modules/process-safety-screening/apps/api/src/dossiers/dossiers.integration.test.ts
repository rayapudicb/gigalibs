import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { SpeedDossierV1 } from '@gigalibs/contracts';
import type { ModuleCommandContext } from '@gigalibs/module-sdk';
import { HttpException, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFERENCE_ROUTE } from '../../../../../../packages/process-safety-engines/test/fixtures/reference-route.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { LibraryService } from '../library/library.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { RoutesService } from '../routes/routes.service.js';
import { StepsService } from '../routes/steps.service.js';
import { SubstancesService } from '../substances/substances.service.js';
import {
  type SpeedDatabase,
  adminUrl,
  principal,
  seedOrganization,
  speedDatabase,
  units,
} from '../test-support/speed-database.js';
import {
  BRD_VALUES,
  CRITERIA_CITATIONS,
  FIXTURE,
  PROTOTYPE_PACK,
} from '../test-support/speed-fixtures.js';
import { DOSSIER_MAX_ATTEMPTS, DossierWorker } from './dossier-worker.js';
import { DossiersService } from './dossiers.service.js';
import { SpeedStorage, type SpeedStorageConfig } from './storage.js';

// WI-OI-120ca (SPEED S7; FR-RPT-01 to 05): the reference route's dossier through the API, its worker and a throwaway
// S3-compatible store. Opt-in: SPEED_TEST_DATABASE_URL as the other SPEED proofs, and SPEED_TEST_STORAGE_ENDPOINT,
// SPEED_TEST_STORAGE_ACCESS_KEY and SPEED_TEST_STORAGE_SECRET_KEY naming a local throwaway MinIO. TEST FIXTURE data only.

const endpoint = process.env.SPEED_TEST_STORAGE_ENDPOINT;
if (endpoint && !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname))
  throw new Error('Refusing the SPEED storage proof: only a local object store is allowed.');
const storageConfig: SpeedStorageConfig | null =
  endpoint && process.env.SPEED_TEST_STORAGE_ACCESS_KEY && process.env.SPEED_TEST_STORAGE_SECRET_KEY
    ? {
        endpoint,
        region: 'us-east-1',
        bucket: `speed-proof-${randomUUID().slice(0, 8)}`,
        accessKeyId: process.env.SPEED_TEST_STORAGE_ACCESS_KEY,
        secretAccessKey: process.env.SPEED_TEST_STORAGE_SECRET_KEY,
        forcePathStyle: true,
      }
    : null;

const TENANT = `tenant-s7-${randomUUID().slice(0, 8)}`;
const ALL = [
  'speed:read',
  'speed.routes.read',
  'speed.routes.write',
  'speed.substances.write',
  'speed.thermal-data.write',
  'speed.engines.run',
  'speed.settings.manage',
];
const WATERMARK = 'DRAFT — NOT APPROVED';
const admin = principal(TENANT, 'admin', ALL);
const command = (): ModuleCommandContext => ({ principal: admin, correlationId: randomUUID() });

async function rejection(work: Promise<unknown>): Promise<{ type: unknown; code: unknown }> {
  try {
    await work;
  } catch (error) {
    const body =
      error instanceof HttpException ? (error.getResponse() as { code?: unknown }) : null;
    return { type: (error as object).constructor, code: body?.code };
  }
  throw new Error('Expected a rejection.');
}

/** A store whose uploads always fail, for the retry proof. */
class FailingStorage extends SpeedStorage {
  override async put(): Promise<void> {
    throw new Error('The object store refused the upload.');
  }
}

/** A store whose first upload waits until released, for the lost-lease proof. */
class StalledStorage extends SpeedStorage {
  private release!: () => void;
  readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  reached!: Promise<void>;
  private reach!: () => void;
  constructor(config: SpeedStorageConfig) {
    super(config);
    this.reached = new Promise<void>((resolve) => {
      this.reach = resolve;
    });
  }
  override async put(
    key: string,
    bytes: Buffer,
    contentType: string,
    sha256: string,
  ): Promise<void> {
    this.reach();
    await this.released;
    return super.put(key, bytes, contentType, sha256);
  }
  resume(): void {
    this.release();
  }
}

describe.skipIf(!adminUrl || !storageConfig)(
  'SPEED dossiers through the API, the worker and the object store (WI-OI-120ca)',
  () => {
    const config = storageConfig as SpeedStorageConfig;
    // Made in beforeAll: a skipped suite still runs this body, without the store's settings.
    let s3: S3Client;
    const worker = { enabled: true, intervalMs: 60_000 };
    let speed: SpeedDatabase;
    let criteria: CriteriaService;
    let library: LibraryService;
    let routes: RoutesService;
    let steps: StepsService;
    let dossiers: DossiersService;
    let workerA: DossierWorker;
    let workerB: DossierWorker;
    let routeId = '';
    let done: SpeedDossierV1;

    const audits = async (action: string) =>
      (
        await speed.admin.query<{
          entity_id: string;
          actor_subject: string;
          payload: Record<string, unknown>;
        }>(
          'SELECT entity_id, actor_subject, payload FROM gigalibs_speed.audit_events WHERE tenant_id = $1 AND action = $2 ORDER BY occurred_at, id',
          [TENANT, action],
        )
      ).rows;

    beforeAll(async () => {
      s3 = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
      speed = await speedDatabase('dossiers');
      await seedOrganization(speed.admin, TENANT);
      await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
      criteria = new CriteriaService(speed.database);
      library = new LibraryService(speed.database);
      const substances = new SubstancesService(speed.database, criteria, library);
      routes = new RoutesService(speed.database, criteria, library);
      steps = new StepsService(speed.database, criteria, library);
      const storage = new SpeedStorage(config);
      dossiers = new DossiersService(speed.database, criteria, library, storage);
      workerA = new DossierWorker(speed.database, storage, worker);
      workerB = new DossierWorker(speed.database, storage, worker);

      const imported = await criteria.import(command(), {
        requestKey: randomUUID(),
        versionLabel: 'brd-0.1',
        source: FIXTURE,
        criteria: BRD_VALUES,
        citations: CRITERIA_CITATIONS,
      });
      await criteria.putInForce(command(), imported.set.id, { version: 1, reason: 'Pilot start' });
      const pack = await library.import(command(), {
        requestKey: randomUUID(),
        versionLabel: 'prototype-0.1',
        source: FIXTURE,
        library: PROTOTYPE_PACK,
      });
      await library.putInForce(command(), pack.set.id, { version: 1, reason: 'Pilot start' });
      const projectId = (
        await new ProjectsService(speed.database).create(command(), {
          requestKey: randomUUID(),
          code: 'DOS',
          name: 'Dossiers',
          siteUnitId: 'north',
        })
      ).project.id;
      routeId = (
        await routes.create(command(), {
          requestKey: randomUUID(),
          projectId,
          name: 'Reference route',
        })
      ).route.id;

      // The reference route: materials linked to the library, conditions and cited thermal data.
      const substanceIds = new Map<string, string>();
      const substanceFor = async (
        formula: string,
        libraryMaterialId: string | null | undefined,
      ) => {
        const known = substanceIds.get(formula);
        if (known) return known;
        const created = await substances.create(command(), {
          requestKey: randomUUID(),
          name: `Fixture ${formula}`,
          formula,
          ...(libraryMaterialId ? { libraryMaterialId } : {}),
        });
        substanceIds.set(formula, created.substance.id);
        return created.substance.id;
      };
      for (const fixture of REFERENCE_ROUTE) {
        const step = (
          await steps.addStep(command(), routeId, {
            requestKey: randomUUID(),
            reason: 'Data entry',
            name: fixture.id,
          })
        ).step;
        for (const material of fixture.materials)
          await steps.addMaterial(command(), step.id, {
            requestKey: randomUUID(),
            reason: 'Data entry',
            substanceId: await substanceFor(material.formula, material.libraryMaterialId),
            role: material.role,
            ...(typeof material.coefficient === 'number'
              ? { coefficient: material.coefficient }
              : {}),
            ...(typeof material.massG === 'number' ? { massG: material.massG } : {}),
          });
        const c = fixture.conditions;
        await steps.replaceConditions(command(), step.id, {
          version: 0,
          reason: 'Data entry',
          processTemperatureC: c.processTemperatureC,
          maximumTechnicalTemperatureC: c.maximumTechnicalTemperatureC,
          heatCapacityJPerGK: c.heatCapacityJPerGK,
          accumulationPercent: c.accumulationPercent,
          reactionEnthalpySource: c.reactionEnthalpy?.source ?? null,
          reactionClassId:
            c.reactionEnthalpy?.source === 'REACTION_CLASS'
              ? c.reactionEnthalpy.reactionClassId
              : null,
        });
        if (c.dscOnsetC !== null)
          await steps.addThermalData(command(), step.id, {
            requestKey: randomUUID(),
            reason: 'Literature value',
            basis: 'LITERATURE',
            citation: FIXTURE,
            kind: 'DSC_ONSET',
            onsetC: c.dscOnsetC,
          });
      }
    }, 180_000);

    afterAll(async () => {
      const listed = await s3
        .send(new ListObjectsV2Command({ Bucket: config.bucket }))
        .catch(() => null);
      const keys = (listed?.Contents ?? []).flatMap((object) =>
        object.Key ? [{ Key: object.Key }] : [],
      );
      if (keys.length > 0)
        await s3.send(
          new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys } }),
        );
      await s3.send(new DeleteBucketCommand({ Bucket: config.bucket })).catch(() => undefined);
      await speed?.close();
    });

    it('refuses to generate without the object store (503), with no database fallback', async () => {
      const offline = new DossiersService(
        speed.database,
        criteria,
        library,
        new SpeedStorage(null),
      );
      expect(
        await rejection(offline.request(command(), routeId, { requestKey: randomUUID() })),
      ).toMatchObject({
        code: 'SPEED_STORAGE_UNAVAILABLE',
      });
    });

    it('previews the model from the stored results: eight sections, actions, Stage 2 and the basis', async () => {
      const { model, route } = await dossiers.exportJson(admin, routeId);
      expect(model.sections.map((section) => section.key)).toEqual([
        'summary',
        'route',
        'thermal',
        'interactions',
        'actions',
        'stage2',
        'basis',
        'signatures',
      ]);
      expect(model.watermark).toBe(WATERMARK);
      const table = (key: string) => {
        const block = model.sections
          .find((section) => section.key === key)
          ?.blocks.find((b) => b.kind === 'table');
        return block && block.kind === 'table' ? block : null;
      };
      // TC-11: NaOH with DMSO is a High finding without a documented control, so it is an action before kilo-lab.
      expect(
        table('interactions')?.rows.some(
          (row) => row[2]?.includes('Fixture NaOH') && row[2]?.includes('Fixture C2H6OS'),
        ),
      ).toBe(true);
      expect(table('actions')?.rows.some((row) => row[2]?.includes('Fixture NaOH'))).toBe(true);
      expect(table('stage2')?.rows.length).toBeGreaterThan(0);
      const basis = table('basis')?.rows.map((row) => row[1]) ?? [];
      expect(basis.some((value) => value?.startsWith('brd-0.1'))).toBe(true);
      expect(basis.some((value) => value?.startsWith('prototype-0.1'))).toBe(true);
      for (const step of route.steps) expect(basis).toContain(step.latestResult?.inputsHash);
    });

    it('exports the route as CSV in the catalogue’s words', async () => {
      const { csv, fileName } = await dossiers.exportCsv(admin, routeId);
      expect(csv.split('\r\n')[0]?.startsWith('Step,Name,')).toBe(true);
      expect(csv).toContain('Fixture NaOH');
      expect(fileName).toBe(`speed-route-${routeId}-v1.csv`);
    });

    it('queues a dossier idempotently; one of two workers claims it and stores both files with their hashes', async () => {
      const requestKey = randomUUID();
      const queued = await dossiers.request(command(), routeId, { requestKey });
      expect(queued).toMatchObject({
        replayed: false,
        dossier: { status: 'QUEUED', watermarked: true, files: [] },
      });
      const replay = await dossiers.request(command(), routeId, { requestKey });
      expect(replay).toMatchObject({ replayed: true, dossier: { id: queued.dossier.id } });

      const finished = await Promise.all([workerA.tick(), workerB.tick()]);
      expect(finished.reduce((sum, count) => sum + count, 0)).toBe(1);
      done = await dossiers.get(admin, queued.dossier.id);
      expect(done.status).toBe('DONE');
      expect(done.files.map((file) => file.format)).toEqual(['docx', 'pdf']);
      expect(
        (await audits('DOSSIER_STARTED')).filter((row) => row.entity_id === done.id),
      ).toHaveLength(1);
      expect(await audits('DOSSIER_GENERATED')).toContainEqual(
        expect.objectContaining({
          entity_id: done.id,
          actor_subject: 'system:speed-dossier-worker',
        }),
      );
      expect((await dossiers.list(admin, routeId)).items.map((item) => item.id)).toContain(done.id);
    });

    it('serves each file after checking its hash: a valid DOCX and PDF, watermarked', async () => {
      const docx = await dossiers.download(command(), done.id, 'docx');
      const pdf = await dossiers.download(command(), done.id, 'pdf');
      const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
      expect(sha(docx.bytes)).toBe(done.files.find((file) => file.format === 'docx')?.sha256);
      expect(sha(pdf.bytes)).toBe(done.files.find((file) => file.format === 'pdf')?.sha256);
      const zip = await JSZip.loadAsync(docx.bytes);
      expect(await zip.file('word/document.xml')?.async('string')).toContain(
        '7. Basis and references',
      );
      expect(await zip.file('word/header1.xml')?.async('string')).toContain(WATERMARK);
      expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.contentType).toBe('application/pdf');
      expect(
        (await audits('DOSSIER_DOWNLOADED')).filter((row) => row.entity_id === done.id),
      ).toHaveLength(2);
    });

    it('refuses a file changed in the store (409) and audits the mismatch', async () => {
      const stored = await speed.admin.query<{ pdf_key: string }>(
        'SELECT pdf_key FROM gigalibs_speed.dossiers WHERE id = $1',
        [done.id],
      );
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: stored.rows[0]?.pdf_key,
          Body: Buffer.from('%PDF-1.3 changed outside SPEED'),
        }),
      );
      expect(await rejection(dossiers.download(command(), done.id, 'pdf'))).toMatchObject({
        code: 'SPEED_DOSSIER_INTEGRITY',
      });
      expect(await audits('DOSSIER_INTEGRITY_FAILED')).toContainEqual(
        expect.objectContaining({
          entity_id: done.id,
          payload: expect.objectContaining({ format: 'pdf' }),
        }),
      );
    });

    it('never changes a finished dossier and never deletes one', async () => {
      await speed.asRuntime(TENANT, async (client) => {
        await expect(
          client.query(`UPDATE gigalibs_speed.dossiers SET watermarked = false WHERE id = $1`, [
            done.id,
          ]),
        ).rejects.toMatchObject({ code: '55000' });
      });
      await speed.asRuntime(TENANT, async (client) => {
        await expect(
          client.query(`DELETE FROM gigalibs_speed.dossiers WHERE id = $1`, [done.id]),
        ).rejects.toMatchObject({
          code: '55000',
        });
      });
    });

    it('answers "not found" for a dossier of a site outside the member’s access', async () => {
      const south = principal(TENANT, 'south-chemist', ALL, units(['south']));
      expect(await rejection(dossiers.get(south, done.id))).toMatchObject({
        type: NotFoundException,
      });
      expect(await rejection(dossiers.list(south, routeId))).toMatchObject({
        type: NotFoundException,
      });
    });

    it('refuses a dossier whose steps were screened with different criteria until the route is recomputed', async () => {
      const next = await criteria.import(command(), {
        requestKey: randomUUID(),
        versionLabel: 'brd-0.2',
        source: FIXTURE,
        criteria: BRD_VALUES,
        citations: CRITERIA_CITATIONS,
      });
      await criteria.putInForce(command(), next.set.id, { version: 1, reason: 'New criteria' });
      const step = (await routes.get(admin, routeId)).steps[0];
      const charged = step?.materials.find((material) => material.massG !== null);
      if (!step || !charged) throw new Error('fixture');
      await steps.updateMaterial(command(), charged.id, {
        version: charged.version,
        reason: 'Charge corrected',
        massG: (charged.massG as number) + 1,
      });
      expect(
        await rejection(dossiers.request(command(), routeId, { requestKey: randomUUID() })),
      ).toMatchObject({
        code: 'SPEED_DOSSIER_STALE',
      });
      await routes.recompute(command(), routeId);
      const queued = await dossiers.request(command(), routeId, { requestKey: randomUUID() });
      expect(queued.dossier.status).toBe('QUEUED');
      expect(await workerA.tick()).toBe(1);
      expect((await dossiers.get(admin, queued.dossier.id)).status).toBe('DONE');
    });

    it('lets only the worker holding the current attempt record it: a worker whose lease ran out records nothing', async () => {
      const first = new StalledStorage(config);
      const second = new StalledStorage(config);
      const slow = new DossierWorker(speed.database, first, worker);
      const next = new DossierWorker(speed.database, second, worker);
      const queued = await dossiers.request(command(), routeId, { requestKey: randomUUID() });
      const slowPass = slow.tick();
      await first.reached;
      // The first worker's lease runs out and a second worker claims the dossier again (attempt 2).
      await speed.admin.query(
        `UPDATE gigalibs_speed.dossiers SET started_at = now() - interval '10 minutes' WHERE id = $1`,
        [queued.dossier.id],
      );
      const nextPass = next.tick();
      await second.reached;
      // The first worker finishes while the second holds the dossier: it records nothing.
      first.resume();
      await slowPass;
      const read = async () =>
        (
          await speed.admin.query<{ status: string; attempts: number; pdf_key: string | null }>(
            'SELECT status, attempts, pdf_key FROM gigalibs_speed.dossiers WHERE id = $1',
            [queued.dossier.id],
          )
        ).rows[0];
      expect(await read()).toMatchObject({ status: 'RUNNING', attempts: 2, pdf_key: null });
      second.resume();
      expect(await nextPass).toBe(1);
      const stored = await read();
      expect(stored?.status).toBe('DONE');
      expect(stored?.pdf_key).toContain('/attempt-2/');
      expect(
        (await audits('DOSSIER_GENERATED')).filter((row) => row.entity_id === queued.dossier.id),
      ).toHaveLength(1);
    });

    it('retries a failed upload and fails the dossier after the last attempt', async () => {
      const failing = new DossierWorker(speed.database, new FailingStorage(config), worker);
      const queued = await dossiers.request(command(), routeId, { requestKey: randomUUID() });
      for (let attempt = 0; attempt < DOSSIER_MAX_ATTEMPTS; attempt += 1) await failing.tick();
      const failed = await dossiers.get(admin, queued.dossier.id);
      expect(failed).toMatchObject({
        status: 'FAILED',
        errorCode: 'SPEED_DOSSIER_RENDER_FAILED',
        files: [],
      });
      expect(
        (await audits('DOSSIER_RETRY_QUEUED')).filter((row) => row.entity_id === failed.id),
      ).toHaveLength(DOSSIER_MAX_ATTEMPTS - 1);
      expect(
        (await audits('DOSSIER_FAILED')).filter((row) => row.entity_id === failed.id),
      ).toHaveLength(1);
      expect(await rejection(dossiers.download(command(), failed.id, 'pdf'))).toMatchObject({
        code: 'SPEED_DOSSIER_NOT_READY',
      });
    });
  },
);
