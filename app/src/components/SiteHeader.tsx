"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Scanner", match: (path: string) => path === "/" },
  {
    href: "/runs",
    label: "Daily runs",
    match: (path: string) => path === "/runs" || path.startsWith("/runs/"),
  },
] as const;

function navLinkClass(active: boolean): string {
  return active
    ? "rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 ring-1 ring-violet-200"
    : "rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900";
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-zinc-900 transition hover:text-violet-800"
        >
          StonksOS
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link key={href} href={href} className={navLinkClass(active)} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
