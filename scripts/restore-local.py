"""Create and verify a SQLite snapshot from the exporter's stdin payload."""
import datetime
import json
import pathlib
import sqlite3
import sys

payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
directory = pathlib.Path(payload['directory'])
target = directory / 'local.db'
if target.exists():
    raise RuntimeError('Refusing to overwrite an existing database')
connection = sqlite3.connect(target)
connection.executescript(payload['schema'])
counts = {}
for table, rows in payload['data'].items():
    columns = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
    types = {column[1]: column[2].upper() for column in columns}
    for row in rows:
        values = []
        for name, value in row.items():
            kind = types[name]
            if value is not None:
                if 'INT' in kind:
                    value = int(value)
                elif kind == 'DATETIME':
                    value = int(datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
                elif isinstance(value, (dict, list)) or kind == 'JSONB':
                    value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
            values.append(value)
        names = ','.join('"' + name + '"' for name in row)
        placeholders = ','.join('?' for _ in row)
        connection.execute(f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})', values)
    counts[table] = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    assert counts[table] == len(rows)
connection.commit()
assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not connection.execute('PRAGMA foreign_key_check').fetchall()
dump = '\n'.join(connection.iterdump()) + '\n'
(directory / 'sqlite.sql').write_text(dump, encoding='utf-8')
restored = sqlite3.connect(':memory:')
restored.executescript(dump)
for table, count in counts.items():
    assert restored.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == count
    assert restored.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall() == connection.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall()
restored.close()
connection.close()
(directory / 'manifest.json').write_text(json.dumps({'tables': counts, 'integrity': 'ok', 'sql_restore': 'ok'}, indent=2), encoding='utf-8')
print(json.dumps(counts))
