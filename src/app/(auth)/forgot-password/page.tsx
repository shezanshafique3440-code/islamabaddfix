import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/PasswordResetForms';

export const metadata: Metadata = {
  title: 'Forgot your password',
  description: 'Reset your Islamabad Fix account password.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Forgot your password?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Enter your email. If it is registered, we will send you a reset link.
      </p>
      <div className="mt-7">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
