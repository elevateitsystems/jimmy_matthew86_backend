import type { Role } from '../generated/prisma/client.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};
