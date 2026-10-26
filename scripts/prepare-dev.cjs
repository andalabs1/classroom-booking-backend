const { execFileSync } = require('node:child_process');
require('dotenv').config({ quiet: true });

const url = process.env.DATABASE_URL || '';
let schema;
if (url.startsWith('file:')) {
  schema = 'prisma/schema.sqlite.prisma';
} else if (url.startsWith('mysql://')) {
  schema = 'prisma/schema.prisma';
} else {
  console.error('Set DATABASE_URL to a mysql:// or file: URL before running npm run dev.');
  process.exit(1);
}

console.log(`Preparing Prisma client using ${schema}`);
try {
  execFileSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'generate', '--schema', schema,
  ], { stdio: 'inherit', env: process.env });
} catch (error) {
  process.exit(error.status || 1);
}
