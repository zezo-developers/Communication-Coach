import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Otp, OtpType } from '@/database/schemas/otp.schema';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name)
    private readonly otpModel: Model<Otp>,
  ) {}

  // ─── OTP Generation ────────────────────────────────────────────────────────
  // Generates a 6-digit OTP for the given email and type, stores it in the DB.
  async generateOtp(email: string, type: OtpType): Promise<string> {
    // Invalidate any previous unused OTPs for this email + type
    await this.otpModel.updateMany(
      { email: email.toLowerCase(), type },
      { $set: { expiresAt: new Date(0) } },
    );

    const otp = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.otpModel.create({
      email: email.toLowerCase(),
      otp,
      type,
      expiresAt,
    });

    this.logger.log(`OTP generated for ${email} (${type})`);
    return otp;
  }

  // ─── OTP Verification ─────────────────────────────────────────────────────
  // Verifies an OTP for the given email and type. Throws if invalid or expired.
  async verifyOtp(email: string, otp: string, type: OtpType): Promise<void> {
    const record = await this.otpModel
      .findOne({
        email: email.toLowerCase(),
        type,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    if (!record) {
      throw new BadRequestException('OTP is invalid or expired');
    }

    if (record.attempts >= 5) {
      throw new BadRequestException('Too many OTP attempts. Please request a new OTP');
    }

    if (record.otp !== otp) {
      await this.otpModel.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      throw new BadRequestException('Invalid OTP');
    }

    // Delete the OTP record after successful verification
    await this.otpModel.deleteOne({ _id: record._id });
  }

  // ─── OTP Code Generator ────────────────────────────────────────────────────
  // Generates a cryptographically random 6-digit OTP code using Node.js crypto.
  private generateOtpCode(): string {
    const buf = randomBytes(3);
    const num = (buf[0] << 16) | (buf[1] << 8) | buf[2];
    return String((num % 900000) + 100000);
  }
}