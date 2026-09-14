'use client';

import { Alert, Button, Container, Heading, Text } from '@medusajs/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

interface MfaContext {
  mfa: {
    required: boolean;
    enrolled: boolean;
    verified: boolean;
    recoveryCodesRemaining: number;
  };
  tenant: { name: string } | null;
}

interface Enrollment {
  method: 'TOTP';
  secret: string;
  uri: string;
}

interface RecoveryCodeSet {
  codes: string[];
  count: number;
  delivery: 'DISPLAY_ONCE';
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: unknown;
    message?: unknown;
  } | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  return fallback;
}

export default function MfaPage() {
  const router = useRouter();
  const [context, setContext] = useState<MfaContext | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [assistedGrant, setAssistedGrant] = useState('');
  const [useAssistedRecovery, setUseAssistedRecovery] = useState(false);
  const [assistedRecoveryConsumed, setAssistedRecoveryConsumed] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [totpVerified, setTotpVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/auth/context', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response, 'Session unavailable.'));
        const payload = (await response.json()) as MfaContext;
        if (!payload?.mfa || !payload.tenant) throw new Error('Select a workspace first.');
        if (!payload.mfa.required || payload.mfa.verified) {
          router.replace('/modules');
          router.refresh();
          return;
        }
        setContext(payload);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Session unavailable.');
      });
  }, [router]);

  const beginEnrollment = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/totp/enroll', { method: 'POST' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Enrollment failed.'));
      const payload = (await response.json()) as Enrollment;
      if (payload.method !== 'TOTP' || !payload.secret || !payload.uri) {
        throw new Error('Authentication service returned an invalid enrollment response.');
      }
      setEnrollment(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Enrollment failed.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'Verification failed.'));
      setTotpVerified(true);
      if ((context?.mfa.recoveryCodesRemaining ?? 0) === 0) {
        const recoveryResponse = await fetch('/api/auth/mfa/recovery/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Initial MFA recovery enrollment' }),
        });
        if (!recoveryResponse.ok) {
          throw new Error(
            await responseMessage(
              recoveryResponse,
              'Authenticator verified, but recovery codes could not be generated. Retry below.',
            ),
          );
        }
        const recovery = (await recoveryResponse.json()) as RecoveryCodeSet;
        if (
          recovery.delivery !== 'DISPLAY_ONCE' ||
          recovery.count !== 10 ||
          recovery.codes.length !== 10
        ) {
          throw new Error('Authentication service returned an invalid recovery-code response.');
        }
        setRecoveryCodes(recovery.codes);
        return;
      }
      router.replace('/modules');
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const retryRecoveryGeneration = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/recovery/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Initial MFA recovery enrollment retry' }),
      });
      if (!response.ok)
        throw new Error(await responseMessage(response, 'Recovery-code generation failed.'));
      const payload = (await response.json()) as RecoveryCodeSet;
      if (
        payload.delivery !== 'DISPLAY_ONCE' ||
        payload.count !== 10 ||
        payload.codes.length !== 10
      ) {
        throw new Error('Authentication service returned an invalid recovery-code response.');
      }
      setRecoveryCodes(payload.codes);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Recovery-code generation failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/recovery/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: recoveryCode }),
      });
      if (!response.ok)
        throw new Error(await responseMessage(response, 'Recovery verification failed.'));
      router.replace('/modules');
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Recovery verification failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const consumeAssistedRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/control/auth/mfa/assisted-recovery/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: assistedGrant }),
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response, 'Assisted recovery failed.'));
      }
      const payload = (await response.json()) as {
        recovered?: unknown;
        enrollmentRequired?: unknown;
        method?: unknown;
      };
      if (
        payload.recovered !== true ||
        payload.enrollmentRequired !== true ||
        payload.method !== 'ASSISTED_RECOVERY'
      ) {
        throw new Error('Authentication service returned an invalid recovery response.');
      }
      setAssistedGrant('');
      setUseAssistedRecovery(false);
      setUseRecoveryCode(false);
      setAssistedRecoveryConsumed(true);
      setContext((current) =>
        current
          ? {
              ...current,
              mfa: {
                ...current.mfa,
                enrolled: false,
                verified: false,
                recoveryCodesRemaining: 0,
              },
            }
          : current,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Assisted recovery failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="w-full max-w-xl space-y-6 rounded-xl border border-ui-border-base bg-ui-bg-base p-8 shadow-elevation-card-rest">
      <div>
        <Heading level="h1">Multi-factor authentication</Heading>
        <Text size="small" className="mt-2 text-ui-fg-muted">
          {context?.tenant
            ? `${context.tenant.name} requires a fresh authenticator code for this session.`
            : 'Checking your workspace security policy…'}
        </Text>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {assistedRecoveryConsumed ? (
        <Alert variant="success">
          Your previous authenticator and recovery codes were revoked. Enroll a new authenticator
          below to finish account recovery.
        </Alert>
      ) : null}

      {recoveryCodes ? (
        <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div>
            <Text size="small" weight="plus">
              Save all ten recovery codes now.
            </Text>
            <Text size="xsmall" className="mt-1">
              Each code works once. The server stores only user-bound SHA-256 digests and cannot
              show these values again.
            </Text>
          </div>
          <pre className="grid grid-cols-1 gap-2 rounded-md border border-amber-300 bg-white p-4 font-mono text-sm sm:grid-cols-2">
            {recoveryCodes.map((recovery) => (
              <code key={recovery}>{recovery}</code>
            ))}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            >
              Copy all codes
            </Button>
            <Button
              type="button"
              onClick={() => {
                router.replace('/modules');
                router.refresh();
              }}
            >
              I saved these codes
            </Button>
          </div>
        </div>
      ) : null}

      {totpVerified && !recoveryCodes ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <Text size="small">
            Your authenticator is verified. Generate the required recovery-code set before
            continuing.
          </Text>
          <Button type="button" isLoading={busy} onClick={() => void retryRecoveryGeneration()}>
            Retry recovery-code generation
          </Button>
        </div>
      ) : null}

      {context && !context.mfa.enrolled && !enrollment ? (
        <div className="space-y-3 rounded-lg border border-ui-border-base p-4">
          <Text size="small">
            Enroll a TOTP authenticator. This requires the password sign-in completed within the
            last ten minutes.
          </Text>
          <Button type="button" isLoading={busy} onClick={() => void beginEnrollment()}>
            Generate authenticator secret
          </Button>
        </div>
      ) : null}

      {enrollment ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <Text size="small" weight="plus">
            Save this secret now. It will be replaced if enrollment is restarted.
          </Text>
          <label className="block text-xs font-medium">
            Authenticator secret
            <input
              className="mt-1 h-10 w-full rounded-md border border-amber-300 bg-white px-3 font-mono"
              readOnly
              value={enrollment.secret}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(enrollment.secret)}
          >
            Copy secret
          </Button>
          <Text size="xsmall">
            Add the secret to an RFC 6238 compatible authenticator, then enter its six-digit code
            below. The server stores only an AES-GCM encrypted envelope.
          </Text>
        </div>
      ) : null}

      {context &&
      !useRecoveryCode &&
      !totpVerified &&
      !recoveryCodes &&
      (context.mfa.enrolled || enrollment) ? (
        <form className="space-y-3" onSubmit={verify}>
          <label className="block text-sm font-medium">
            Six-digit authenticator code
            <input
              aria-label="Six-digit authenticator code"
              autoComplete="one-time-code"
              className="mt-1 h-11 w-full rounded-md border border-ui-border-base px-3 font-mono text-lg tracking-[0.3em]"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <Button className="w-full" type="submit" disabled={code.length !== 6} isLoading={busy}>
            Verify and continue
          </Button>
        </form>
      ) : null}

      {context?.mfa.enrolled &&
      context.mfa.recoveryCodesRemaining > 0 &&
      !totpVerified &&
      !recoveryCodes ? (
        <div className="border-t border-ui-border-base pt-4">
          <Button
            type="button"
            variant="transparent"
            onClick={() => setUseRecoveryCode((current) => !current)}
          >
            {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
          </Button>
          {useRecoveryCode ? (
            <form className="mt-3 space-y-3" onSubmit={verifyRecovery}>
              <label className="block text-sm font-medium">
                One-time recovery code
                <input
                  aria-label="One-time recovery code"
                  autoComplete="one-time-code"
                  className="mt-1 h-11 w-full rounded-md border border-ui-border-base px-3 font-mono uppercase tracking-wider"
                  maxLength={24}
                  pattern="[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){4}"
                  placeholder="ABCD-EFGH-JKMN-PQRS-TUVW"
                  required
                  value={recoveryCode}
                  onChange={(event) =>
                    setRecoveryCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-HJ-NP-Z2-9-]/g, '')
                        .slice(0, 24),
                    )
                  }
                />
              </label>
              <Button className="w-full" type="submit" isLoading={busy}>
                Verify recovery code
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {context?.mfa.enrolled && !totpVerified && !recoveryCodes ? (
        <div className="border-t border-ui-border-base pt-4">
          <Button
            type="button"
            variant="transparent"
            onClick={() => setUseAssistedRecovery((current) => !current)}
          >
            {useAssistedRecovery ? 'Hide assisted recovery' : 'Use an administrator recovery grant'}
          </Button>
          {useAssistedRecovery ? (
            <form className="mt-3 space-y-3" onSubmit={consumeAssistedRecovery}>
              <Text size="xsmall" className="text-ui-fg-muted">
                Enter the display-once grant delivered after two distinct tenant administrators
                completed the approved identity-verification process.
              </Text>
              <label className="block text-sm font-medium">
                Assisted recovery grant
                <input
                  aria-label="Assisted recovery grant"
                  autoComplete="one-time-code"
                  className="mt-1 h-11 w-full rounded-md border border-ui-border-base px-3 font-mono"
                  maxLength={43}
                  pattern="[A-Za-z0-9_-]{43}"
                  required
                  value={assistedGrant}
                  onChange={(event) =>
                    setAssistedGrant(event.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 43))
                  }
                />
              </label>
              <Button
                className="w-full"
                type="submit"
                variant="danger"
                disabled={assistedGrant.length !== 43}
                isLoading={busy}
              >
                Reset authenticator and recovery codes
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
