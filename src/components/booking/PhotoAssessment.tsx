'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';

interface Assessment {
  observations: string[];
  identifiers: string[];
  technicianNotes: string[];
  hazard: string | null;
  confidence: number;
  summary: string;
}

interface Result {
  available: boolean;
  assessment: Assessment | null;
  disclaimer: string;
  unavailableReason: string | null;
}

/** Below this the photo is too unclear to read anything off with a straight face. */
const UNCLEAR = 0.4;

/**
 * What a photo shows, read back to the customer before they book.
 *
 * Three things this component refuses to do, all of them things a "photo AI"
 * normally does: present an observation as a diagnosis, hide the disclaimer,
 * and go quiet when no model is configured. The unavailable state is as visible
 * as the successful one, and says the photo still reaches the technician —
 * which was the actual point of asking for it.
 */
export function PhotoAssessment({ fileId }: { fileId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assess = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.post<Result>(`/api/files/${fileId}/assess`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read the photo.');
    } finally {
      setLoading(false);
    }
  };

  if (!result) {
    return (
      <div className="mt-3">
        <Button variant="outline" size="sm" loading={loading} onClick={assess}>
          What does this photo show?
        </Button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-alert-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!result.available || !result.assessment) {
    return (
      <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 px-3.5 py-2.5">
        <p className="text-sm leading-relaxed text-warn-700">{result.unavailableReason}</p>
      </div>
    );
  }

  const { assessment } = result;
  const unclear = assessment.confidence < UNCLEAR;

  return (
    <div className="mt-3 rounded-xl border border-ink-200 bg-surface p-4">
      {assessment.hazard ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-alert-200 bg-alert-50 px-3 py-2 text-sm font-medium leading-relaxed text-alert-700"
        >
          ⚠️ {assessment.hazard}
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-ink-800">{assessment.summary}</p>

      {unclear ? (
        <p className="mt-2 text-xs text-warn-700">
          The photo is not clear enough to read much off. A closer or better-lit one would help — or
          send it as it is and let the technician look.
        </p>
      ) : null}

      {assessment.identifiers.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">
            Readable on the label
          </h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {assessment.identifiers.map((identifier) => (
              <li
                key={identifier}
                className="rounded-full bg-ink-100 px-2.5 py-1 font-mono text-xs text-ink-700"
              >
                {identifier}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.observations.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">
            What is visible
          </h4>
          <ul className="mt-1 space-y-1 text-sm text-ink-700">
            {assessment.observations.map((observation) => (
              <li key={observation}>• {observation}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.technicianNotes.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">
            Passed to the technician
          </h4>
          <ul className="mt-1 space-y-1 text-sm text-ink-700">
            {assessment.technicianNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 border-t border-ink-100 pt-2.5 text-xs leading-relaxed text-ink-500">
        {result.disclaimer}
      </p>
    </div>
  );
}
