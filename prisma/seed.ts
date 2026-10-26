import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

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
