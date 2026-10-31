/**
 * Server mode only (ADR-0014): nobody sees the app until they've signed in. Shows the sign-in
 * page, keeps who is signed in, and goes back to the sign-in page when the server says the
 * session has ended (sign-out, a server restart, a shift without activity).
 *
 * The signed-in person's role becomes the app's role, so the menus and buttons match what the
 * server will allow. In demo mode there's no gate, and the role picker chooses the role.
 */
import { ApiRequestError, HttpTransport, useApiContext, type SessionClient } from "@pdm/api-client";
import type { User } from "@pdm/contracts";
import { Button } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../shared/preferences";

interface SignedIn {
  user: User;
  signOut: () => void;
}

const SessionContext = createContext<SignedIn | null>(null);

/** Who is signed in (server mode), or null in demo mode. */
export function useSession(): SignedIn | null {
  return useContext(SessionContext);
}

type State = { kind: "checking" } | { kind: "unreachable" } | { kind: "signedOut" } | { kind: "signedIn"; user: User };

export function SessionGate({ session, children }: { session: SessionClient; children: ReactNode }) {
  const { transport } = useApiContext();
  const queryClient = useQueryClient();
  const setPreferences = usePreferences((p) => p.set);
  const [state, setState] = useState<State>({ kind: "checking" });

  const enter = useCallback(
    (user: User) => {
      // Nothing cached for the last person may show for this one.
      queryClient.clear();
      setPreferences({ role: user.role });
      if (transport instanceof HttpTransport) transport.resume();
      setState({ kind: "signedIn", user });
    },
    [queryClient, setPreferences, transport],
  );
  const leave = useCallback(() => {
    queryClient.clear();
    setState({ kind: "signedOut" });
  }, [queryClient]);

  const check = useCallback(
    () =>
      session.current().then(
        (user) => (user ? enter(user) : setState({ kind: "signedOut" })),
        () => setState({ kind: "unreachable" }),
      ),
    [session, enter],
  );
  const retry = () => {
    setState({ kind: "checking" });
    void check();
  };

  useEffect(() => void check(), [check]);
  useEffect(() => (transport instanceof HttpTransport ? transport.onSignedOut(leave) : undefined), [transport, leave]);

  if (state.kind === "signedIn") {
    // The server also closes the live connection, which would bring us back here via onSignedOut.
    const signOut = () => void session.signOut().finally(leave);
    return <SessionContext.Provider value={{ user: state.user, signOut }}>{children}</SessionContext.Provider>;
  }
  return <SignInPage state={state} session={session} onSignedIn={enter} onRetry={retry} />;
}

function SignInPage({
  state,
  session,
  onSignedIn,
  onRetry,
}: {
  state: Exclude<State, { kind: "signedIn" }>;
  session: SessionClient;
  onSignedIn: (user: User) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<User[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /** What the server said when it refused (e.g. too many attempts), shown instead of "can't reach". */
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("session.title")} · ${t("app.name")}`;
  }, [t]);
  useEffect(() => {
    if (state.kind !== "signedOut") return;
    session.people().then(setPeople, () => setFailed(true));
  }, [state.kind, session]);

  const signIn = (user: User) => {
    setBusy(user.id);
    setRefusal(null);
    session.signIn(user.id).then(onSignedIn, (error: unknown) => {
      setBusy(null);
      if (error instanceof ApiRequestError && error.code !== "unavailable") setRefusal(error.message);
      else setFailed(true);
    });
  };

  const groups = new Map<User["role"], User[]>();
  for (const p of people ?? []) groups.set(p.role, [...(groups.get(p.role) ?? []), p]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4 sm:p-8">
      <header className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-9" />
        <div>
          <p className="text-sm text-fg-muted">{t("app.name")}</p>
          <h1 className="text-2xl font-semibold">{t("session.title")}</h1>
        </div>
      </header>
      {state.kind === "checking" ? (
        <p className="text-fg-muted">{t("session.checking")}</p>
      ) : state.kind === "unreachable" || failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-4">
          <p>{t("session.unreachable")}</p>
          <Button
            onClick={() => {
              setFailed(false);
              onRetry();
            }}
          >
            {t("session.retry")}
          </Button>
        </div>
      ) : (
        <>
          <p className="max-w-prose text-fg-muted">{t("session.intro")}</p>
          {refusal && (
            <p role="alert" className="rounded-lg border border-line bg-surface p-3">
              {refusal}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...groups].map(([role, members]) => (
              <section key={role} aria-labelledby={`role-${role}`} className="rounded-lg border border-line bg-surface p-3">
                <h2 id={`role-${role}`} className="mb-2 text-sm font-semibold">
                  {t(`roles.${role}`)}
                </h2>
                <ul className="flex flex-col gap-1">
                  {members.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken disabled:opacity-60"
                        disabled={busy !== null}
                        onClick={() => signIn(p)}
                      >
                        <span className="font-medium">{p.name}</span> <span className="text-fg-muted">· {p.title}</span>
                        {busy === p.id && <span className="ml-2 text-fg-muted">{t("session.signingIn")}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
