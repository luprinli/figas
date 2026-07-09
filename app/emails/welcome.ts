import type { EmailOptions } from "../utils/email.server";

interface WelcomeParams {
  name: string;
  email: string;
}

export function welcomeEmail(params: WelcomeParams): EmailOptions {
  return {
    to: params.email,
    subject: "Welcome to FIGAS",
    notificationType: "welcome",
    recipientType: "passenger",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to FIGAS, ${params.name}!</h2>
        <p>Your account has been created successfully. You can now book flights through the FIGAS system.</p>
        <p>If you have any questions, please contact our operations team.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Falkland Islands Government Air Service</p>
      </div>
    `,
    text: `Welcome to FIGAS, ${params.name}!\n\nYour account has been created successfully. You can now book flights through the FIGAS system.\n\nFalkland Islands Government Air Service`,
  };
}
