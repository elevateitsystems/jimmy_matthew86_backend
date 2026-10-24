import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';

import { AuthModule } from './auth/auth.module.js';
import { ContainersModule } from './containers/containers.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().port().default(3000),
        FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        REDIS_HOST: Joi.string().default('127.0.0.1'),
        REDIS_PORT: Joi.number().port().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        OPENTRACK_API_KEY: Joi.string().required(),
        OPENTRACK_API_URL: Joi.string()
          .uri()
          .default('https://api.opentrack.co'),
        APP_NAME: Joi.string().allow('').optional(),
        ALERT_EMAIL_TO: Joi.string().email().allow('').optional(),
        MAIL_HOST: Joi.string().allow('').optional(),
        MAIL_PORT: Joi.number().port().optional(),
        MAIL_USERNAME: Joi.string().allow('').optional(),
        MAIL_PASSWORD: Joi.string().allow('').optional(),
        MAIL_FROM_ADDRESS: Joi.string().email().allow('').optional(),
        MAIL_FROM_NAME: Joi.string().allow('').optional(),
        SMTP_HOST: Joi.string().allow('').optional(),
        SMTP_PORT: Joi.number().port().optional(),
        SMTP_USER: Joi.string().allow('').optional(),
        SMTP_PASSWORD: Joi.string().allow('').optional(),
        SMTP_FROM: Joi.string().allow('').optional(),
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    ContainersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
