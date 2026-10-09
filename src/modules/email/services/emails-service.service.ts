import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: Number(this.configService.get('SMTP_PORT')),
      secure: true,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    this.logger.log('SMTP Email transporter initialized');
  }

  async sendEmail(options: EmailOptions) {
    try {
      const { to, subject, html, text } = options;

      const result = await this.transporter.sendMail({
        from: `"Communication Coach" <${this.configService.get('FROM_EMAIL')}>`,
        to,
        subject,
        html,
        text,
      });

      this.logger.log(`Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to}`);

      return result;
    } catch (error:any) {
      this.logger.error('Failed to send email', error.stack);
      throw error;
    }
  }

  /**
   * Send contact instructor email
   */
//   async sendContactToInstructor(payload: {
//     to: string;
//     subject: string;
//     studentFullName: string;
//     email: string;
//     phone?: string;
//     message: string;
//   }) {
//     const html = getContactInstructorTemplate({
//       studentFullName: payload.studentFullName,
//       email: payload.email,
//       phone: payload.phone,
//       message: payload.message,
//     });

//     await this.sendEmail({
//       to: payload.to,
//       subject: payload.subject, // SUBJECT ONLY HERE
//       html,
//       text: `
// Name: ${payload.studentFullName}
// Email: ${payload.email}
// Phone: ${payload.phone ?? 'N/A'}

// Message:
// ${payload.message}
//     `,
//     });
//   }





}
