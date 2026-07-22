'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Search box for the post-hat index. Filtering happens on the SERVER (the hat
// bodies never ship to the browser), so this only keeps the ?q= in the URL —
// debounced, so a query isn't fired on every keystroke.
//
// It is a real <form> too: with JS off, Enter submits a GET and the page still
// filters. The URL carries the query, so a search is shareable and survives a
// reload.

export function HatSearch({ initial, resultLabel }: { initial: string; resultLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    // Don't re-push on mount, or a shared ?q= URL would immediately rewrite itself.
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      start(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
    // `params` is intentionally read fresh inside the timeout, not depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pathname, router]);

  return (
    <form className="ph-search" role="search" action={pathname} method="get">
      <input
        type="search"
        name="q"
        className="ph-searchinput"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search post names and hat text…"
        aria-label="Search post names and hat text"
        autoComplete="off"
      />
      <span className={`ph-searchmeta${pending ? ' ph-searching' : ''}`} aria-live="polite">
        {resultLabel}
      </span>
    </form>
  );
}
