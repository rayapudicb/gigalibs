import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const runtimeRoot = dirname(fileURLToPath(import.meta.url));
const databaseRoot = join(runtimeRoot, 'database');

export default defineConfig({
  schema: join(databaseRoot, 'schema.prisma'),
  migrations: {
    path: join(databaseRoot, 'migrations'),
  },
});
