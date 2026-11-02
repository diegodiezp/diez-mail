'use client';
// Saved templates (the 1.x composer linked to a /templates page that never
// existed). Use one to start a campaign, or delete it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CampaignTabs from '@/components/CampaignTabs';
import { EmptyState, PageHeader, SkeletonRows } from '@/components/ui';

function plain(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');

  const load = () => fetch('/api/templates').then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setTemplates(d.templates || []); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (t) => {
    if (!window.confirm(`Delete the template "${t.Name}"?`)) return;
    setTemplates((list) => list.filter((x) => x.id !== t.id));
    await fetch(`/api/templates/${t.id}`, { method: 'DELETE' }).catch(() => load());
  };

  return (
    <div>
      <PageHeader title="Campaigns" sub="Templates: save one from the composer with “Save as template”." />
      <CampaignTabs />
      {error && <div className="notice-danger mb-4">{error}</div>}
      <div className="card">
        {!templates && !error && <SkeletonRows rows={4} avatar={false} />}
        {templates && templates.length === 0 && <EmptyState title="No templates yet">In the composer, write a message and choose “Save as template”.</EmptyState>}
        {templates?.map((t) => (
          <div key={t.id} className="row items-start">
            <div className="min-w-0 flex-1">
              <div className="text-sm">{t.Name}</div>
              {t.Subject && <div className="text-xs text-gallery-mid truncate">{t.Subject}</div>}
              <p className="text-2xs text-gallery-light line-clamp-2 mt-1">{plain(t.Body)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/campaigns/new?template=${t.id}`} className="btn-secondary btn-sm">Use</Link>
              <button type="button" onClick={() => remove(t)} className="btn-ghost">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
