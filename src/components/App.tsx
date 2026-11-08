"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import Dashboard from "./Dashboard";
import SignIn from "./SignIn";

export interface Me {
  user: { id: string; name: string; role: "owner" | "approver" } | null;
  hasPasskey: boolean;
  demoMode: boolean;
  paypalStub: boolean;
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Me>("/api/me").then(setMe, (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <Centered>Couldn&apos;t load Finwarden: {error}</Centered>;
  if (!me) return <Centered>Loading…</Centered>;
  if (!me.user) return <SignIn onSignedIn={load} />;
  return <Dashboard me={me} onAuthChange={load} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-muted">{children}</div>;
}
