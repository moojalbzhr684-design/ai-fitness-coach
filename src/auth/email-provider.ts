import { env } from "../config/env.js";

export interface EmailLoginCode {
  email: string;
  code: string;
  expiresInMinutes: number;
}

export interface EmailProvider {
  sendLoginCode(input: EmailLoginCode): Promise<void>;
}

export class DevelopmentEmailProvider implements EmailProvider {
  async sendLoginCode(input: EmailLoginCode): Promise<void> {
    if (env.NODE_ENV === "production") {
      throw new Error("Development email provider is disabled in production");
    }
    // Development-only delivery. Production deliberately fails closed until a real provider is configured.
    console.info(`[development-email] Login code for ${input.email}: ${input.code} (expires in ${input.expiresInMinutes}m)`);
  }
}

export function getEmailProvider(): EmailProvider {
  if (env.NODE_ENV === "production") {
    return {
      async sendLoginCode() {
        throw new Error("No production email provider is configured");
      },
    };
  }
  return new DevelopmentEmailProvider();
}
