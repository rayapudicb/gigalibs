export interface ModuleReadiness {
  readonly module: string;
  readonly ready: boolean;
}

/**
 * The host is ready only when every hosted module reports ready at its own schema contract. Each module answers on
 * its own route inside this process, so readiness stays the module's own verdict.
 */
export async function hostReadiness(
  modules: readonly { readonly name: string; readonly path: string }[],
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly ready: boolean; readonly modules: readonly ModuleReadiness[] }> {
  const results = await Promise.all(
    modules.map(async (hosted) => {
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/${hosted.path}/v1/health/ready`, {
          signal: AbortSignal.timeout(3_000),
        });
        return { module: hosted.name, ready: response.ok };
      } catch {
        return { module: hosted.name, ready: false };
      }
    }),
  );
  return { ready: results.every((result) => result.ready), modules: results };
}
