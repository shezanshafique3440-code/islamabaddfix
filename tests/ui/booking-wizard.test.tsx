import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/client/api';
import { StepIntake } from '@/components/booking/StepIntake';
import { StepConfirm } from '@/components/booking/StepConfirm';
import { QuoteCard } from '@/components/account/QuoteCard';
import { ToastProvider } from '@/components/ui/Toast';
import type {
  AddressOption,
  BookingDraft,
  FlatService,
  PaymentMethodOption,
  WizardCatalogue,
  WizardConfig,
} from '@/components/booking/types';

/**
 * Booking interactions, in a browser.
 *
 * These cover the two moments where the interface makes a promise the customer
 * relies on: the intake step, which must never dress keyword matching up as AI
 * or bury a safety warning, and the confirm step, which must say plainly that
 * nothing is being charged and must not pretend a booking was created when the
 * request failed.
 */

const post = vi.fn();
const withMeta = vi.fn();

vi.mock('@/lib/client/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: (...args: unknown[]) => post(...args),
      patch: vi.fn(),
      del: vi.fn(),
      withMeta: (...args: unknown[]) => withMeta(...args),
    },
  };
});

const catalogue: WizardCatalogue = [
  {
    id: 'cat-1',
    name: 'AC & Cooling',
    slug: 'ac-cooling',
    tagline: null,
    iconKey: 'snowflake',
    description: null,
    isEmergencyCategory: true,
    services: [
      {
        id: 'svc-1',
        name: 'AC repair',
        slug: 'ac-repair',
        description: 'AC thanda nahi kar raha',
        minPricePaisa: 150_000,
        maxPricePaisa: 800_000,
        requiresInspection: true,
        estimatedMinutes: 90,
        isEmergencyEnabled: true,
        guaranteeEligible: true,
      },
    ],
  },
];

function draftFixture(overrides: Partial<BookingDraft> = {}): BookingDraft {
  return {
    problem: 'AC chal raha hai lekin thandi hawa nahi aa rahi',
    categorySlug: 'ac-cooling',
    serviceId: 'svc-1',
    fileIds: [],
    addressId: 'addr-1',
    newAddress: null,
    scheduledFor: '2026-10-01T12:00:00.000Z',
    providerId: null,
    isEmergency: false,
    urgency: 'NORMAL',
    paymentMethod: 'CASH',
    intakeSummary: null,
    customerNotes: '',
    ...overrides,
  };
}

const service: FlatService = {
  id: 'svc-1',
  name: 'AC repair',
  slug: 'ac-repair',
  description: null,
  minPricePaisa: 150_000,
  maxPricePaisa: 800_000,
  requiresInspection: true,
  estimatedMinutes: 90,
  isEmergencyEnabled: true,
  guaranteeEligible: true,
  categorySlug: 'ac-cooling',
  categoryName: 'AC & Cooling',
  categoryIconKey: 'snowflake',
};

const address: AddressOption = {
  id: 'addr-1',
  label: 'Home',
  addressLine: 'House 12, Street 4',
  houseOrBuilding: null,
  zoneId: 'zone-1',
  zoneName: 'G-10/4',
  city: 'Islamabad',
  isDefault: true,
};

const cashOnly: PaymentMethodOption[] = [
  {
    method: 'CASH',
    label: 'Cash',
    labelUr: 'Cash — kaam ke baad',
    description: 'Technician ko kaam mukammal hone par cash dein.',
  },
];

const config: WizardConfig = {
  minLeadMinutes: 60,
  maxLeadDays: 30,
  guaranteeDays: 7,
  defaultEmergencyFeePaisa: 80_000,
  emergencyEnabled: true,
  aiConfigured: false,
  mapsConfigured: false,
};

function intakeResponse(overrides: Record<string, unknown> = {}) {
  return {
    categorySlug: 'ac-cooling',
    serviceSlug: 'ac-repair',
    issueSummary: 'AC cool nahi kar raha',
    urgency: 'NORMAL',
    confidence: 0.8,
    questions: [],
    mediaRequest: null,
    recommendation: 'AC repair book karein',
    reply: 'Lagta hai AC ki servicing ya gas ka masla ho sakta hai.',
    source: 'rules',
    degraded: false,
    safetyNotice: null,
    disclaimer: 'Yeh ibtidai andaza hai, pakki tashkhees nahi.',
    category: { id: 'cat-1', name: 'AC & Cooling', slug: 'ac-cooling', iconKey: 'snowflake' },
    service: { id: 'svc-1', name: 'AC repair', slug: 'ac-repair' },
    ...overrides,
  };
}

beforeEach(() => {
  post.mockReset();
  withMeta.mockReset();
});

describe('intake step', () => {
  it('says plainly when no AI model is configured', () => {
    render(
      <StepIntake
        draft={draftFixture({ problem: '' })}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured={false}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText(/AI model configured nahi hai/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI assistant is deployment par configured hai/i)).toBeNull();
  });

  it('does not offer to analyse an empty description', () => {
    render(
      <StepIntake
        draft={draftFixture({ problem: '' })}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /yeh dekhein/i })).toBeDisabled();
  });

  it('labels a rule-based answer as rule-based, not as AI', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(intakeResponse({ source: 'rules' }));

    render(
      <StepIntake
        draft={draftFixture()}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured={false}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /yeh dekhein/i }));

    expect(await screen.findByText('Rule-based')).toBeInTheDocument();
    expect(screen.queryByText(/^AI$/)).toBeNull();
  });

  it('warns when the model fell back, rather than passing the answer off as AI', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(intakeResponse({ source: 'rules', degraded: true }));

    render(
      <StepIntake
        draft={draftFixture()}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /yeh dekhein/i }));

    expect(await screen.findByText(/keyword matching istemal hui/i)).toBeInTheDocument();
  });

  it('puts a safety warning in an alert region above everything else', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(
      intakeResponse({
        safetyNotice:
          'Gas ki bu aa rahi hai to foran gas band karein, koi switch na chalayein aur bahar nikal jayein.',
      }),
    );

    render(
      <StepIntake
        draft={draftFixture()}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /yeh dekhein/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/gas band karein/i);
  });

  it('only preselects a service when the classifier is reasonably confident', async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    post.mockResolvedValue(intakeResponse({ confidence: 0.2 }));

    render(
      <StepIntake
        draft={draftFixture({ serviceId: null })}
        patch={patch}
        catalogue={catalogue}
        aiConfigured
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /yeh dekhein/i }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]![0]).toMatchObject({ serviceId: null });
  });

  it('keeps the customer moving when the assistant fails', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new ApiError('Assistant down', 'INTEGRATION_FAILED', 502));

    const onSkip = vi.fn();
    render(
      <StepIntake
        draft={draftFixture()}
        patch={vi.fn()}
        catalogue={catalogue}
        aiConfigured
        onNext={vi.fn()}
        onSkip={onSkip}
      />,
    );
    await user.click(screen.getByRole('button', { name: /yeh dekhein/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/assistant down/i);
    // The manual route out is still there, so a failed integration never traps
    // the customer.
    await user.click(screen.getByRole('button', { name: /seedha category chunein/i }));
    expect(onSkip).toHaveBeenCalled();
  });
});

function renderConfirm(
  overrides: {
    draft?: Partial<BookingDraft>;
    paymentMethods?: PaymentMethodOption[];
    onCreated?: (booking: {
      id: string;
      reference: string;
      providersNotified: number;
      awaitingManualAssignment: boolean;
    }) => void;
    config?: Partial<WizardConfig>;
  } = {},
) {
  const onCreated = overrides.onCreated ?? vi.fn();
  render(
    <ToastProvider>
      <StepConfirm
        draft={draftFixture(overrides.draft)}
        patch={vi.fn()}
        service={service}
        address={address}
        zones={[]}
        paymentMethods={overrides.paymentMethods ?? cashOnly}
        config={{ ...config, ...overrides.config }}
        isSignedIn
        onBack={vi.fn()}
        onCreated={onCreated}
      />
    </ToastProvider>,
  );
  return { onCreated };
}

describe('confirm step', () => {
  it('states that nothing is being charged now and that extras need approval', () => {
    renderConfirm();

    expect(screen.getByText(/Ab kuch charge nahi hoga/i)).toBeInTheDocument();
    expect(screen.getByText(/ijazat ke baghair koi extra charge nahi lagega/i)).toBeInTheDocument();
  });

  it('shows the indicative range as indicative, not as a price', () => {
    renderConfirm();

    expect(screen.getByText(/indicative/i)).toBeInTheDocument();
    expect(screen.getByText(/likhit quote bhejega/i)).toBeInTheDocument();
  });

  it('discloses the emergency fee before the customer commits', () => {
    renderConfirm({ draft: { isEmergency: true, urgency: 'EMERGENCY' } });

    expect(screen.getByText('Emergency fee')).toBeInTheDocument();
    expect(screen.getByText(/Rs\.\s*800 se/)).toBeInTheDocument();
  });

  it('refuses to submit when no payment method is enabled', async () => {
    renderConfirm({ paymentMethods: [] });

    expect(screen.getByText(/koi payment method enabled nahi/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /booking confirm karein/i })).toBeDisabled();
    expect(withMeta).not.toHaveBeenCalled();
  });

  it('sends exactly what the customer reviewed, and no price', async () => {
    const user = userEvent.setup();
    withMeta.mockResolvedValue({
      data: { id: 'b-1', reference: 'IFX-ABC123', status: 'PENDING', providerId: null },
      meta: { providersNotified: 3, awaitingManualAssignment: false },
    });
    const { onCreated } = renderConfirm();

    await user.click(screen.getByRole('button', { name: /booking confirm karein/i }));

    await waitFor(() => expect(withMeta).toHaveBeenCalledTimes(1));
    const [path, options] = withMeta.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(path).toBe('/api/bookings');
    expect(options.method).toBe('POST');
    expect(options.body).toMatchObject({ serviceId: 'svc-1', addressId: 'addr-1' });
    // The client never sends money: no total, no commission, no fee.
    expect(Object.keys(options.body).join(',')).not.toMatch(/paisa|total|commission|price/i);

    expect(onCreated).toHaveBeenCalledWith({
      id: 'b-1',
      reference: 'IFX-ABC123',
      providersNotified: 3,
      awaitingManualAssignment: false,
    });
  });

  it('does not claim a booking exists when the request failed', async () => {
    const user = userEvent.setup();
    withMeta.mockRejectedValue(
      new ApiError('Is waqt koi technician available nahi hai.', 'NO_PROVIDER_AVAILABLE', 409),
    );
    const { onCreated } = renderConfirm();

    await user.click(screen.getByRole('button', { name: /booking confirm karein/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/koi technician available nahi/i);
    expect(onCreated).not.toHaveBeenCalled();
    // The button comes back so the customer can retry.
    expect(screen.getByRole('button', { name: /booking confirm karein/i })).toBeEnabled();
  });

  it('asks an unauthenticated customer to log in rather than losing the draft', async () => {
    const user = userEvent.setup();
    withMeta.mockRejectedValue(new ApiError('Login zaroori hai.', 'UNAUTHENTICATED', 401));
    render(
      <ToastProvider>
        <StepConfirm
          draft={draftFixture()}
          patch={vi.fn()}
          service={service}
          address={address}
          zones={[]}
          paymentMethods={cashOnly}
          config={config}
          isSignedIn={false}
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /booking confirm karein/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/login zaroori hai/i);
    expect(screen.getByRole('link', { name: /login karein/i })).toHaveAttribute(
      'href',
      '/login?next=/book',
    );
  });

  it('saves a new address first, then books against it', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 'addr-new' });
    withMeta.mockResolvedValue({
      data: { id: 'b-2', reference: 'IFX-NEW001', status: 'PENDING', providerId: null },
      meta: {},
    });

    renderConfirm({
      draft: {
        addressId: null,
        newAddress: {
          label: 'Office',
          zoneId: 'zone-1',
          addressLine: 'Office 4, Blue Area',
          houseOrBuilding: '',
          landmark: '',
          contactPhone: '+923001234567',
          latitude: null,
          longitude: null,
          saveForLater: true,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: /booking confirm karein/i }));

    await waitFor(() => expect(withMeta).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/api/addresses', expect.objectContaining({
      addressLine: 'Office 4, Blue Area',
    }));
    const [, options] = withMeta.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body.addressId).toBe('addr-new');
  });

  it('mentions the guarantee when the service is covered', () => {
    renderConfirm();
    expect(screen.getByText(/7-din Fix Guarantee laagu hai/i)).toBeInTheDocument();
  });

  it('makes no guarantee promise for a service that is not covered', () => {
    // Section 15 of the brief: not every job is covered, and the confirm screen
    // must not imply otherwise.
    render(
      <ToastProvider>
        <StepConfirm
          draft={draftFixture()}
          patch={vi.fn()}
          service={{ ...service, guaranteeEligible: false }}
          address={address}
          zones={[]}
          paymentMethods={cashOnly}
          config={config}
          isSignedIn
          onBack={vi.fn()}
          onCreated={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText(/Fix Guarantee laagu hai/i)).toBeNull();
  });
});

describe('quote card', () => {
  const quote = {
    id: 'q-1',
    status: 'SUBMITTED',
    isAdditional: false,
    subtotalPaisa: 330_000,
    notes: 'Gas refill aur service',
    validUntil: null,
    submittedAt: null,
    rejectionReason: null,
    items: [
      {
        id: 'i-1',
        kind: 'INSPECTION' as const,
        label: 'Muaina',
        quantity: 1,
        unitPricePaisa: 50_000,
        totalPaisa: 50_000,
      },
      {
        id: 'i-2',
        kind: 'PARTS' as const,
        label: 'Gas refill',
        quantity: 2,
        unitPricePaisa: 140_000,
        totalPaisa: 280_000,
      },
    ],
  };

  it('shows every line with its own total, never one opaque figure', () => {
    render(<QuoteCard quote={quote} />);

    // 'Muaina' appears twice — once as the line label, once as its kind.
    expect(screen.getAllByText('Muaina').length).toBeGreaterThan(0);
    expect(screen.getByText('Gas refill')).toBeInTheDocument();
    expect(screen.getByText('Rs. 500')).toBeInTheDocument();
    expect(screen.getByText('Rs. 2,800')).toBeInTheDocument();
    expect(screen.getByText('Rs. 3,300')).toBeInTheDocument();
    expect(screen.getByText('× 2')).toBeInTheDocument();
  });

  it('marks an additional quote as additional', () => {
    render(<QuoteCard quote={{ ...quote, isAdditional: true }} showStatus />);
    expect(screen.getByText('Additional')).toBeInTheDocument();
  });

  it('shows why a quote was rejected', () => {
    render(
      <QuoteCard
        quote={{ ...quote, status: 'REJECTED', rejectionReason: 'Bohat zyada hai' }}
        showStatus
      />,
    );
    expect(screen.getByText(/Bohat zyada hai/)).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
});
