import { Badge } from '@/components/ui/Badge';

/**
 * Integration status board.
 *
 * The point of this panel is honesty: an operator can see at a glance which
 * features are genuinely live and which are declared but unconfigured, so
 * "the SMS didn't arrive" has an answer on screen rather than in the logs.
 */
export function IntegrationStatusList({
  notifications,
  payments,
  ai,
  maps,
  whatsapp,
  voice,
  storage,
}: {
  notifications: Array<{ channel: string; configured: boolean }>;
  payments: Array<{ key: string; method: string; label: string; configured: boolean }>;
  ai: { configured: boolean; provider: string };
  maps: { configured: boolean; provider: string };
  whatsapp: { configured: boolean; inboundConfigured: boolean };
  voice: { configured: boolean; inboundConfigured: boolean };
  storage: { driver: string; configured: boolean };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel title="Notifications">
        {notifications.map((channel) => (
          <StatusRow
            key={channel.channel}
            label={CHANNEL_LABELS[channel.channel] ?? channel.channel}
            configured={channel.configured}
            note={channel.configured ? undefined : 'Credentials set nahi hain'}
          />
        ))}
      </Panel>

      <Panel title="Payments">
        {payments.map((provider) => (
          <StatusRow
            key={provider.key}
            label={provider.label}
            configured={provider.configured}
            note={provider.configured ? undefined : 'PAYMENT_* variables darkar hain'}
          />
        ))}
      </Panel>

      <Panel title="AI & maps">
        <StatusRow
          label="AI intake assistant"
          configured={ai.configured}
          note={
            ai.configured
              ? `Provider: ${ai.provider}`
              : 'Rule-based fallback chal raha hai (UI par saaf likha hai)'
          }
        />
        <StatusRow
          label="Maps / geocoding"
          configured={maps.configured}
          note={
            maps.configured ? `Provider: ${maps.provider}` : 'Manual address entry chal rahi hai'
          }
        />
      </Panel>

      <Panel title="Channels & storage">
        <StatusRow
          label="WhatsApp (bhejna)"
          configured={whatsapp.configured}
          note={whatsapp.configured ? undefined : 'WHATSAPP_API_KEY darkar hai'}
        />
        <StatusRow
          label="WhatsApp (webhook)"
          configured={whatsapp.inboundConfigured}
          note={whatsapp.inboundConfigured ? undefined : 'Verify token aur app secret darkar hain'}
        />
        <StatusRow
          label="Voice agent"
          configured={voice.configured}
          note={voice.configured ? undefined : 'VAPI_API_KEY darkar hai'}
        />
        <StatusRow
          label={`Storage (${storage.driver})`}
          configured={storage.configured}
          note={storage.driver === 'local' ? 'Local disk — single node ke liye theek' : undefined}
        />
      </Panel>
    </div>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  IN_APP: 'In-app',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <h3 className="text-[0.9375rem] font-semibold text-ink-900">{title}</h3>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}

function StatusRow({
  label,
  configured,
  note,
}: {
  label: string;
  configured: boolean;
  note?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-ink-800">{label}</p>
        {note ? <p className="text-xs text-ink-500">{note}</p> : null}
      </div>
      <Badge tone={configured ? 'success' : 'neutral'}>
        {configured ? 'Configured' : 'Not configured'}
      </Badge>
    </li>
  );
}
