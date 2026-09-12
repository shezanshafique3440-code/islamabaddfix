import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/PasswordResetForms';

export const metadata: Metadata = {
  title: 'Password bhool gaye',
  description: 'Islamabad Fix account ka password reset karein.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Password bhool gaye?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Apna email likhein. Agar woh register hai to hum reset link bhej denge.
      </p>
      <div className="mt-7">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
