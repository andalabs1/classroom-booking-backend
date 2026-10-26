require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Read the source only. Restore into a new directory, never over an existing DB.
async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = ['User', 'Classroom', 'Booking', 'AuditLog', 'Notification'];
    const definitions = {};
    for (const table of tables) {
      const result = await prisma.$queryRawUnsafe(`SHOW CREATE TABLE \`${table}\``);
      definitions[table] = result[0]['Create Table'];
    }
    const data = await prisma.$transaction(async tx => {
      const result = {};
      for (const table of tables) result[table] = await tx.$queryRawUnsafe(`SELECT * FROM \`${table}\` ORDER BY id`);
      return result;
    }, { isolationLevel: 'RepeatableRead', timeout: 120000 });
    const directory = path.resolve('sql_backup', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(directory, { recursive: true });
    const literal = value => {
      if (value === null) return 'NULL';
      if (typeof value === 'bigint' || typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? '1' : '0';
      if (value instanceof Date) value = value.toISOString().slice(0, 23).replace('T', ' ');
      else if (typeof value === 'object') value = JSON.stringify(value);
      return `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`;
    };
    let sql = '-- MySQL schema and data. Import into an empty local database.\nSET NAMES utf8mb4;\nSET time_zone = \'+00:00\';\nSET FOREIGN_KEY_CHECKS=0;\n';
    for (const table of tables) {
      sql += definitions[table] + ';\n';
      for (const row of data[table]) {
        sql += `INSERT INTO \`${table}\` (${Object.keys(row).map(k => `\`${k}\``).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n`;
      }
    }
    sql += 'SET FOREIGN_KEY_CHECKS=1;\n';
    fs.writeFileSync(path.join(directory, 'mysql.sql'), sql);
    const schema = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.sqlite.prisma', '--script'], { encoding: 'utf8' });
    const payload = { directory, schema, data };
    execFileSync('python', ['scripts/restore-local.py'], {
      input: JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? value.toString() : value),
      stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: 128 * 1024 * 1024,
    });
    console.log(directory);
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
