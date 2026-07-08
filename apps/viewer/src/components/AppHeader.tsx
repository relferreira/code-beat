import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "../lib/theme";
import { MoonIcon, SunIcon } from "./icons";

export interface HeaderUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function AppHeader({ user, onSignOut }: { user?: HeaderUser | null; onSignOut?: () => void }) {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <Link to="/" className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-[15px] shadow-sm">🥁</span>
        <span className="text-[15px] font-semibold tracking-tight text-fg">Code Beat</span>
      </Link>

      <div className="flex items-center gap-1">
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="grid size-8 place-items-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        {user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              className="block size-8 overflow-hidden rounded-full ring-1 ring-border transition hover:ring-fg-3"
            >
              <AvatarImage user={user} />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg shadow-black/5">
                  <div className="px-2.5 py-2">
                    {user.name ? <div className="truncate text-sm font-medium text-fg">{user.name}</div> : null}
                    {user.email ? <div className="truncate text-xs text-fg-3">{user.email}</div> : null}
                  </div>
                  {onSignOut ? (
                    <>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={onSignOut}
                        className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm text-fg-2 transition hover:bg-surface-2 hover:text-fg"
                      >
                        Sign out
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function AvatarImage({ user }: { user: HeaderUser }) {
  if (user.image) {
    return <img src={user.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />;
  }
  const initial = (user.name ?? user.email ?? "?").trim().slice(0, 1).toUpperCase();
  return <span className="grid size-full place-items-center bg-surface-3 text-xs font-semibold text-fg-2">{initial}</span>;
}
