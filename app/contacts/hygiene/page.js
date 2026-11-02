'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PeopleTabs from '@/components/PeopleTabs';
import { EmptyState, PageHeader, SkeletonRows, Icon } from '@/components/ui';

export default function HygienePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/hygiene').then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setData(d); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const runFix = async (group) => {
    setBusy(group.key);
    try {
      const res = await fetch('/api/hygiene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix: group.fix, ids: group.items.map((i) => i.id) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMsg(`Updated ${d.updated} record${d.updated === 1 ? '' : 's'}`);
      await load();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const issues = data ? data.groups.reduce((s, g) => s + g.items.length, 0) : 0;

  return (
    <div>
      <PageHeader title="People" sub={data ? `Hygiene: ${issues} thing${issues === 1 ? '' : 's'} to tidy across ${data.total} records` : 'Hygiene'} />
      <PeopleTabs />
      {msg && <div className="notice-info mb-4 flex justify-between"><span>{msg}</span><button type="button" onClick={() => setMsg('')}><Icon name="x" size={14} /></button></div>}
      {error && <div className="notice-danger mb-4">{error}</div>}
      {!data && !error && <div className="card"><SkeletonRows rows={6} avatar={false} /></div>}
      {data && issues === 0 && <div className="card"><EmptyState title="All clean">No problems found in your contacts.</EmptyState></div>}
      <div className="space-y-3">
        {data?.groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.key} className="card">
            <div className="card-head">
              <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="flex-1 text-left min-w-0">
                <div className="text-sm">{g.title} <span className="num text-gallery-mid">· {g.items.length}</span></div>
                <div className="text-2xs text-gallery-mid">{g.hint}</div>
              </button>
              {g.fix && (
                <button type="button" className="btn-secondary btn-sm" disabled={busy === g.key} onClick={() => runFix(g)}>
                  {busy === g.key ? 'Fixing…' : g.fix === 'tidy' ? 'Tidy all' : 'Mark do not email'}
                </button>
              )}
            </div>
            {open === g.key && (
              <div>
                {g.items.slice(0, 200).map((it) => (
                  g.key === 'duplicates' ? (
                    <div key={it.email} className="row items-start">
                      <div className="text-sm flex-1 min-w-0">
                        <div className="truncate">{it.email}</div>
                        <div className="text-2xs text-gallery-mid flex flex-wrap gap-x-3">
                          {it.people.map((p) => <Link key={p.id} href={`/contacts/${p.id}`} className="hover:underline">{p.name || 'unnamed'} ↗</Link>)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Link key={it.id} href={`/contacts/${it.id}`} className="row-link">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{it.name || <span className="text-gallery-light">No name</span>}</div>
                        <div className="text-2xs text-gallery-mid truncate">
                          {it.email || 'no email'}{it.fixed && <> → {it.fixed}</>}{it.reason && <> · {it.reason}</>}
                        </div>
                      </div>
                      <Icon name="arrow" size={14} className="text-gallery-light" />
                    </Link>
                  )
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
