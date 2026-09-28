import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const generatedSourceDirectory = fileURLToPath(
  new URL('../src/generated/prisma/', import.meta.url),
);
const generatedDistributionDirectory = fileURLToPath(
  new URL('../dist/generated/prisma/', import.meta.url),
);

const generatedFiles = await readdir(generatedSourceDirectory, {
  withFileTypes: true,
});
const queryEngines = generatedFiles.filter(
  (entry) =>
    entry.isFile() &&
    /(?:lib)?query_engine.*(?:\.so|\.dylib|\.dll)\.node$/u.test(entry.name),
);

if (queryEngines.length === 0) {
  throw new Error(
    `Prisma generation did not produce a native query engine in ${generatedSourceDirectory}`,
  );
}

await mkdir(generatedDistributionDirectory, { recursive: true });

for (const queryEngine of queryEngines) {
  await copyFile(
    join(generatedSourceDirectory, queryEngine.name),
    join(generatedDistributionDirectory, queryEngine.name),
  );
}

console.log(
  `Copied ${queryEngines.length} Prisma query engine${queryEngines.length === 1 ? '' : 's'} into the deployable database package.`,
);
