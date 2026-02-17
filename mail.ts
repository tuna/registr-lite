import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import config from "./configuration";
import { sql } from "bun";

export async function send(email: string): Promise<boolean> {
  // Load email configuration
  const emailContent = await config.load('email');
  if (!emailContent) {
    console.log('No email configuration found, skipping email');
    return false;
  }

  // Load SMTP configuration
  const smtpServer = await config.load('smtp_server');
  const smtpUsername = await config.load('smtp_username');
  const smtpPassword = await config.load('smtp_password');
  const emailFrom = await config.load('email_from');

  if (!smtpServer || !smtpUsername || !smtpPassword || !emailFrom || emailFrom === '') {
    console.log('SMTP configuration incomplete, skipping email');
    console.log(`Missing: ${!smtpServer ? 'smtp_server ' : ''}${!smtpUsername ? 'smtp_username ' : ''}${!smtpPassword ? 'smtp_password ' : ''}${!emailFrom ? 'email_from' : ''}`);
    return false;
  }

  try {
    // Create transporter with STARTTLS enforced
    const transporter: Transporter = nodemailer.createTransport({
      host: smtpServer,
      port: 587, // Standard STARTTLS port
      secure: false, // Use STARTTLS (not SSL)
      requireTLS: true, // Enforce STARTTLS
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: 'Registration Confirmation',
      text: emailContent,
      html: emailContent.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/\n/g, '<br>'),
    });

    console.log(`Email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${email}:`, error);
    // Don't throw - we don't want to fail the registration if email fails
    return false;
  }
}
