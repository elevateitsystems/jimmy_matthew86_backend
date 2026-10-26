import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

function loadEnvFile() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) {
    return;
  }
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type SeedAccount = {
  label: string;
  email: string;
  name: string;
  password: string | undefined;
  role: Role;
};

async function ensureUser(account: SeedAccount) {
  const email = account.email.trim().toLowerCase();
  if (!account.password || account.password.length < 8) {
    throw new Error(`${account.label} password must be set and at least 8 characters`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`${account.label} already exists: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name: account.name,
      email,
      passwordHash: await hash(account.password),
      role: account.role,
    },
  });

  console.log(`${account.label} created: ${email}`);
}

async function main() {
  await ensureUser({
    label: 'Super admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@javamaryland.com',
    name: process.env.SEED_ADMIN_NAME ?? 'Java Maryland Admin',
    password: process.env.SEED_ADMIN_PASSWORD,
    role: Role.SUPER_ADMIN,
  });

  await ensureUser({
    label: 'Staff',
    email: process.env.SEED_STAFF_EMAIL ?? 'staff@javamaryland.com',
    name: process.env.SEED_STAFF_NAME ?? 'Java Maryland Staff',
    password: process.env.SEED_STAFF_PASSWORD,
    role: Role.STAFF,
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
