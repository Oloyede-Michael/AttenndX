import 'dotenv/config';
import pg from 'pg';

// Return DATE as 'YYYY-MM-DD', and numeric / bigint as numbers
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

// Connection is configured with the standard PG* env vars:
// PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
export const pool = new pg.Pool();
export const q = (text, params) => pool.query(text, params);
