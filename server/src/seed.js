import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { hashPin } from './lib/pin.js';
import { localParts, zonedToDate, addDays, toMin } from './lib/time.js';

// Small deterministic RNG so reseeding gives the same shape of data
let s = 20260921;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const DEPTS = {
  'Marketing & Growth': ['Marketing Manager', 'Content Strategist', 'Growth Analyst', 'SEO Specialist'],
  'Engineering': ['Frontend Lead', 'Backend Engineer', 'DevOps Engineer', 'QA Engineer'],
  'Operations Team': ['Operations Specialist', 'Logistics Coordinator', 'Office Administrator'],
  'Product Design': ['UI Designer', 'UX Researcher', 'Product Designer'],
  'Fintech Division': ['Financial Analyst', 'Risk Analyst', 'Payments Engineer'],
  'Human Resources': ['HR Specialist', 'Recruiter', 'HR Manager'],
  'Legal & Compliance': ['Compliance Officer', 'Legal Counsel', 'Paralegal'],
  'Customer Success': ['Success Coordinator', 'Support Agent', 'Account Manager'],
  'Finance': ['Accountant', 'Payroll Officer', 'Finance Manager'],
  'Sales': ['Sales Executive', 'Business Developer', 'Sales Manager'],
};
const FIRST = ['Amara','Chinedu','Ngozi','Tunde','Folake','Emeka','Aisha','Ibrahim','Kemi','Segun','Bola','Chiamaka','Yusuf','Zainab','Femi','Ada','Obinna','Temi','Hauwa','Seyi','Ife','Kelechi','Damilola','Nkechi','Uche','Sade','Gbenga','Halima','Tobi','Lara','Joel','Grace','Daniel','Esther','Samuel','Ruth','Peter','Naomi','Victor','Linda'];
const LAST = ['Okafor','Adeyemi','Bello','Eze','Balogun','Nwosu','Ogunleye','Abubakar','Okonkwo','Salami','Adebayo','Ibe','Lawal','Musa','Onyeama','Fashola','Ajayi','Danjuma','Obi','Afolabi','Ogundipe','Yakubu','Chukwu','Ojo','Idowu'];
const MANAGERS = ['Chief Operations Officer', 'Head of People', 'Director of Engineering', 'VP Growth'];

// Employees that mirror the design mockups. Sarah & David have no punch today so you can try the kiosk.
const NAMED = [
  ['Sarah', 'Johnson', 'EMP-0294', 'Marketing & Growth', 'Marketing Manager', 'active', '1234'],
  ['David', 'Kross', 'EMP-1082', 'Engineering', 'Frontend Lead', 'active', '2345'],
  ['Rebecca', 'Lee', 'EMP-0419', 'Product Design', 'UI Designer', 'inactive', '3456'],
  ['Michael', 'Vance', 'EMP-0042', 'Operations Team', 'Operations Specialist', 'active', '4567'],
  ['George', 'Bailey', 'EMP-0921', 'Fintech Division', 'Financial Analyst', 'on_leave', '5678'],
  ['Nisha', 'Patel', 'EMP-1140', 'Human Resources', 'HR Specialist', 'active', '6789'],
  ['Oliver', 'Grant', 'EMP-0211', 'Legal & Compliance', 'Compliance Officer', 'active', '7890'],
  ['Clara', 'Oswald', 'EMP-0553', 'Customer Success', 'Success Coordinator', 'on_leave', '8901'],
];
const DEMO_NO_PUNCH = new Set(['EMP-0294', 'EMP-1082']);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('TRUNCATE audit_logs, attendance, employees, departments, admins, settings RESTART IDENTITY CASCADE');

  await client.query(`INSERT INTO admins (name, email, password_hash, title) VALUES ($1,$2,$3,$4)`,
    ['Jane Miller', 'hr@attendx.com', await bcrypt.hash('AttendX@2026', 10), 'HR Manager']);
  for (const [k, v] of Object.entries({ company_name: 'The Valerie Brand', default_clock_in: '09:00', default_clock_out: '17:00', default_grace: '15' }))
    await client.query('INSERT INTO settings VALUES ($1,$2)', [k, v]);

  const deptId = {};
  for (const name of Object.keys(DEPTS)) deptId[name] = (await client.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [name])).rows[0].id;

  // ---- employees ----
  const usedPins = new Set(NAMED.map((n) => n[6]));
  const people = NAMED.map(([f, l, code, dept, role, status, pin]) => ({ f, l, code, dept, role, status, pin }));
  const used = new Set(NAMED.map((n) => n[2]));
  let n = 1000;
  while (people.length < 248) {
    n += ri(1, 9);
    const code = `EMP-${String(n).padStart(4, '0')}`;
    if (used.has(code)) continue;
    used.add(code);
    const dept = pick(Object.keys(DEPTS));
    let pin; do { pin = String(ri(0, 9999)).padStart(4, '0'); } while (usedPins.has(pin));
    usedPins.add(pin);
    const status = people.length < 20 ? 'on_leave' : rnd() < 0.02 ? 'inactive' : 'active';
    people.push({ f: pick(FIRST), l: pick(LAST), code, dept, role: pick(DEPTS[dept]), status, pin });
  }
  // the first 8 on_leave quota is already satisfied by named + generated; keep roughly 15 on leave
  let leaveCount = people.filter((p) => p.status === 'on_leave').length;
  for (const p of people) if (leaveCount > 15 && p.status === 'on_leave' && !NAMED.some((x) => x[2] === p.code)) { p.status = 'active'; leaveCount--; }

  const emp = [];
  let idx = 0;
  for (const p of people) {
    idx++;
    const early = rnd() < 0.2;
    const expIn = early ? '08:00' : '09:00', expOut = early ? '16:00' : '17:00';
    const { rows } = await client.query(
      `INSERT INTO employees (code, first_name, last_name, email, phone, date_of_birth, department_id, role, employment_type, start_date, manager,
         status, pin_hash, work_schedule, expected_in, expected_out, grace_minutes, leave_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Mon-Fri',$14,$15,15,$16) RETURNING id`,
      [p.code, p.f, p.l, `${p.f}.${p.l}${p.code === 'EMP-0294' ? '' : idx}@attendx.com`.toLowerCase(), `+234 80${ri(10000000, 99999999)}`,
       `${ri(1975, 2000)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`, deptId[p.dept], p.role,
       rnd() < 0.9 ? 'Full-time' : 'Contract', `${ri(2018, 2025)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`,
       pick(MANAGERS), p.status, hashPin(p.pin), expIn, expOut, ri(5, 20)]);
    emp.push({ id: rows[0].id, ...p, expIn: toMin(expIn), expOut: toMin(expOut), grace: 15 });
  }
  await client.query(`UPDATE employees SET grace_minutes = 15`);

  // ---- attendance: last 45 days of weekdays ----
  const today = localParts().date;
  const rowsOut = [];
  const push = (e, date, status, inMin, outMin) => {
    const cin = inMin != null ? zonedToDate(date, inMin) : null;
    const cout = outMin != null ? zonedToDate(date, outMin) : null;
    const hours = cin && cout ? Math.round(((cout - cin) / 3600000) * 100) / 100 : null;
    const early = outMin != null && outMin < e.expOut;
    rowsOut.push([e.id, date, cin, cout, hours, status, early]);
  };
  for (let back = 45; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const isToday = back === 0;
    for (const e of emp) {
      if (e.status === 'inactive') continue;
      if (isToday) {
        if (DEMO_NO_PUNCH.has(e.code)) continue;
        if (e.status === 'on_leave') { push(e, date, 'on_leave'); continue; }
      }
      const roll = rnd();
      if (!isToday && e.status === 'on_leave' && back < 10) { push(e, date, 'on_leave'); continue; }
      if (roll < 0.03) { push(e, date, 'absent'); continue; }
      if (roll < 0.05) { push(e, date, 'on_leave'); continue; }
      if (isToday && roll < 0.09) continue; // hasn't punched in yet
      const late = roll > 0.89;
      const inMin = late ? e.expIn + e.grace + ri(1, 70) : e.expIn - ri(0, 35) + ri(0, 10);
      const status = late ? 'late' : 'on_time';
      if (isToday) {
        if (roll > 0.86 && roll <= 0.89) push(e, date, 'half_day', inMin, inMin + ri(200, 235)); // left early, under 4h
        else push(e, date, status, inMin, null);
        continue;
      }
      if (roll > 0.86 && roll <= 0.89) { push(e, date, 'half_day', inMin, inMin + ri(200, 235)); continue; }
      push(e, date, status, inMin, e.expOut + ri(-12, 75));
    }
  }
  for (let i = 0; i < rowsOut.length; i += 500) {
    const chunk = rowsOut.slice(i, i + 500);
    const cols = [[], [], [], [], [], [], []];
    chunk.forEach((r) => r.forEach((v, c) => cols[c].push(v)));
    await client.query(
      `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, hours, status, early_departure)
       SELECT * FROM unnest($1::int[], $2::date[], $3::timestamptz[], $4::timestamptz[], $5::numeric[], $6::text[], $7::boolean[])`, cols);
  }
  await client.query('COMMIT');
  console.log(`Seeded ${emp.length} employees, ${rowsOut.length} attendance rows, 1 admin.`);
  console.log('Admin login:  hr@attendx.com / AttendX@2026');
  console.log('Kiosk demo PINs (no punch yet today): Sarah Johnson 1234, David Kross 2345');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
