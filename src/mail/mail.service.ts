import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type MailResult = {
  sent: boolean;
  message: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  status() {
    const alertEmail = this.alertEmail();
    return {
      configured: this.isConfigured(),
      alertEmail,
      from: this.fromAddress(),
    };
  }

  async sendSyncFailure(reason: string) {
    const result = await this.send({
      subject: 'Shipment refresh failed',
      text: [
        'The shipment refresh failed.',
        'The dashboard is still showing the last saved containers.',
        '',
        `Reason: ${reason}`,
      ].join('\n'),
    });
    return result.sent;
  }

  async sendDeliveryUpdate(input: {
    containerNumber: string;
    updatedBy: string;
    changes: { label: string; from: string; to: string }[];
  }) {
    const lines = [
      'A delivery record was updated.',
      '',
      `Container: ${input.containerNumber}`,
      `Updated by: ${input.updatedBy}`,
      '',
      ...input.changes.map(
        (change) => `${change.label}: ${change.from} -> ${change.to}`,
      ),
    ];
    return this.send({
      subject: `Delivery update · ${input.containerNumber}`,
      text: lines.join('\n'),
    });
  }

  async sendTest() {
    return this.send({
      subject: 'Java Maryland email check',
      text: [
        'This is a test from the Java Maryland tracking workspace.',
        'Delivery updates and failed shipment refreshes will use this address.',
      ].join('\n'),
    });
  }

  private async send(message: { subject: string; text: string }): Promise<MailResult> {
    const to = this.alertEmail();
    if (!this.isConfigured() || !to) {
      this.logger.warn(
        `Email is not configured, so "${message.subject}" was not sent`,
      );
      return {
        sent: false,
        message:
          'Email is not configured on the server yet. Add the mail host, username, and password.',
      };
    }

    try {
      await this.getTransport().sendMail({
        from: this.fromAddress(),
        to,
        subject: message.subject,
        text: message.text,
      });
      return {
        sent: true,
        message: `Email sent to ${to}`,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'The email could not be sent';
      this.logger.error(reason);
      return {
        sent: false,
        message: 'The email could not be sent. Check the mail server settings.',
      };
    }
  }

  private isConfigured() {
    return Boolean(this.host() && this.user() && this.password() && this.alertEmail());
  }

  private alertEmail() {
    return this.text('ALERT_EMAIL_TO') || this.text('MAIL_FROM_ADDRESS') || this.user();
  }

  private fromAddress() {
    const address =
      this.text('MAIL_FROM_ADDRESS') ||
      this.text('SMTP_FROM') ||
      this.user() ||
      'alerts@javamaryland.com';
    const name = this.fromName();
    return name ? `"${name.replaceAll('"', '')}" <${address}>` : address;
  }

  private fromName() {
    const name = this.text('MAIL_FROM_NAME');
    if (name && !name.includes('${')) {
      return name;
    }
    return this.text('APP_NAME');
  }

  private host() {
    return this.text('MAIL_HOST') || this.text('SMTP_HOST');
  }

  private port() {
    const value = this.config.get<string | number>('MAIL_PORT') ?? this.config.get<string | number>('SMTP_PORT') ?? 587;
    const port = Number(value);
    return Number.isFinite(port) && port > 0 ? port : 587;
  }

  private user() {
    return this.text('MAIL_USERNAME') || this.text('SMTP_USER');
  }

  private password() {
    return this.config.get<string>('MAIL_PASSWORD') || this.config.get<string>('SMTP_PASSWORD') || '';
  }

  private text(name: string) {
    const value = this.config.get<string>(name)?.trim();
    return value || null;
  }

  private getTransport() {
    if (!this.transport) {
      const port = this.port();
      const user = this.user();
      const host = this.host() ?? 'localhost';
      this.transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass: this.password() } : undefined,
      });
    }
    return this.transport;
  }
}
