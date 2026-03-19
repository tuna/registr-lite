import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { marked } from "marked";
import config from "./configuration";

marked.use({ gfm: true, breaks: true });

export async function send(email: string): Promise<boolean> {
  // Load email configuration
  const emailContent = await config.load('email');
  const emailTitle = await config.load('email_title');
  if (!emailContent || !emailTitle) {
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

  const smptServerSplit = smtpServer.split(':');
  if (smptServerSplit.length > 2) {
    console.log('Invalid SMTP server configuration, skipping email');
    return false;
  }
  const host = smptServerSplit[0];
  const port = smptServerSplit.length === 2 ? parseInt(smptServerSplit[1]!) : 587; // Default to 587 for STARTTLS

  try {
    // Create transporter with STARTTLS enforced
    const transporter: Transporter = nodemailer.createTransport({
      host: host,
      port: port, // Standard STARTTLS port
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
      subject: emailTitle,
      text: emailContent,
      html: await marked.parse(emailContent),
    });

    console.log(`Email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${email}:`, error);
    // Don't throw - we don't want to fail the registration if email fails
    return false;
  }
}
