import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import type { SignOptions } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './auth.types.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = user
      ? await verify(user.passwordHash, dto.password).catch(() => false)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        '7d',
      ) as SignOptions['expiresIn'],
    });

    return {
      accessToken,
      user: this.users.toPublic(user),
    };
  }
}
