import type { Role } from '@prisma/client';

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
