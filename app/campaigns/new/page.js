'use client';
// Composer, 2.0
//
//  compose  -> recipients (filters, segments) + message (edit / preview)
//  review   -> pre-send checks, recipient list, optional per-person edits
//  personalize -> edit individual emails (as in 1.x)
//  sending  -> batches of SEND_BATCH with live progress; resumable
//  done
//
// Sending happens in small batches from the browser, each one a request that
// adds to the same campaign. No request runs long (so no timeouts at any
// list size) and a batch that fails can be resumed: people who already got
// the email are skipped by the server.
//
// URL params: ?people=id,id  ?duplicate=<campaign>  ?campaign=<add to it>
//             ?followup=<campaign>  ?template=<id>  ?about=<work title>

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import RecipientPicker from '@/components/composer/RecipientPicker';
import { Icon, Segmented } from '@/components/ui';
import { EMPTY_FILTERS } from '@/lib/segments';
import { MERGE_TAGS, resolveMergeTags, missingFor, pdfAnchor } from '@/lib/merge';
import { SIGNATURE_TEXT, signatureBlock } from '@/lib/signature';

const SEND_BATCH = 20;

function FormatToolbar({ editorRef, onChange, onInsert }) {
  const exec = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    onChange?.();
  };
  const btn = 'h-8 min-w-8 px-2 text-sm text-gallery-dark hover:bg-gallery-bg transition-colors';
  return (
    <div className="flex items-center gap-0.5 px-3 sm:px-5 py-1.5 border-b border-gallery-border overflow-x-auto no-scrollbar">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className={`${btn} font-bold`} title="Bold">B</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className={`${btn} italic`} title="Italic">I</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} className={`${btn} underline`} title="Underline">U</button>
      <span className="w-px h-5 bg-gallery-border mx-1" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} className={btn} title="Bullets">• List</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); const url = window.prompt('Link URL'); if (url) exec('createLink', /^https?:\/\//.test(url) ? url : `https://${url}`); }} className={btn} title="Link">Link</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }} className={btn} title="Clear formatting">Clear</button>
      <span className="w-px h-5 bg-gallery-border mx-1" />
      {MERGE_TAGS.map((m) => (
        <button key={m.tag} type="button" onMouseDown={(e) => { e.preventDefault(); onInsert(m.tag); }} className="h-7 px-2 mx-0.5 text-2xs bg-gallery-accent-light text-gallery-accent whitespace-nowrap" title={m.tag}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

function Preview({ html, subject, device, person }) {
  return (
    <div className="flex-1 overflow-y-auto bg-gallery-bg p-4 sm:p-6">
      <div className={`mx-auto bg-white border border-gallery-border shadow-sm ${device === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'}`}>
        <div className="px-5 py-3 border-b border-gallery-border text-xs text-gallery-mid space-y-0.5">
          <div><span className="text-gallery-light">From</span> Diego / Diez Gallery</div>
          <div><span className="text-gallery-light">To</span> {person ? `${person.fullName || person.email}` : 'Recipient'}</div>
          <div className="text-sm text-gallery-black pt-1">{subject || <span className="text-gallery-light">(no subject)</span>}</div>
        </div>
        <div
          className="prose-mail px-5 py-5 text-[15px] leading-[1.6] text-[#1a1a1a] break-words"
          style={{ fontFamily: 'Arial, sans-serif' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function ComposerContent() {
  const params = useSearchParams();
  const existingCampaignId = params.get('campaign');
  const duplicateId = params.get('duplicate');
  const followupId = params.get('followup');
  const templateId = params.get('template');
  const presetPeople = params.get('people');
  const about = params.get('about');

  const editorRef = useRef(null);
  const personalizeRef = useRef(null);

  // Message
  const [campaignName, setCampaignName] = useState(about ? `About ${about}` : '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pdfLink, setPdfLink] = useState('');
  const [pdfLabel, setPdfLabel] = useState('');
  const [includeSig, setIncludeSig] = useState(true);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [origin, setOrigin] = useState(null); // { kind, name }
  const [engagedEmails, setEngagedEmails] = useState(null); // follow-up preselection
  const [personalizedFrom, setPersonalizedFrom] = useState(null);

  // Recipients
  const [people, setPeople] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [alreadySent, setAlreadySent] = useState(new Set());
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [segments, setSegments] = useState([]);

  // UI
  const [pane, setPane] = useState('message'); // phone: recipients | message
  const [view, setView] = useState('edit'); // edit | preview
  const [device, setDevice] = useState('desktop');
  const [previewEmail, setPreviewEmail] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [test, setTest] = useState({ open: false, email: '', busy: false, result: null });

  // Flow
  const [step, setStep] = useState('compose');
  const [customBodies, setCustomBodies] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState('');

  // ── Load people, segments, templates ────────────────────────────────────
  useEffect(() => {
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((d) => {
        const list = d.people || [];
        setPeople(list);
        setArtists(d.artists || []);
        if (presetPeople) {
          const ids = new Set(presetPeople.split(','));
          setSelected(new Set(list.filter((p) => ids.has(p.id) && !p.doNotEmail).map((p) => p.email)));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPeople(false));
    fetch('/api/segments').then((r) => r.json()).then((d) => setSegments(d.segments || [])).catch(() => {});
    fetch('/api/templates').then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => {});
  }, [presetPeople]);

  const putBody = useCallback((html) => {
    setBody(html);
    requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = html; });
  }, []);

  // ── Prefill from another campaign / template ─────────────────────────────
  useEffect(() => {
    const id = existingCampaignId || duplicateId || followupId;
    if (!id) return;
    fetch(`/api/campaigns?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.campaign;
        if (!c) return;
        if (existingCampaignId) {
          setOrigin({ kind: 'add', name: c.name });
          setCampaignName(c.name);
          setSubject(c.subject || '');
          setPdfLink(c.pdfLink || '');
          setPdfLabel(c.pdfLabel || '');
          putBody(c.bodyTemplate || '');
          setAlreadySent(new Set((d.recipients || []).filter((r) => r.sent).map((r) => r.email.toLowerCase())));
        } else if (duplicateId) {
          setOrigin({ kind: 'duplicate', name: c.name });
          setCampaignName(`${c.name} (copy)`);
          setSubject(c.subject || '');
          setPdfLink(c.pdfLink || '');
          setPdfLabel(c.pdfLabel || '');
          putBody(c.bodyTemplate || '');
        } else {
          setOrigin({ kind: 'followup', name: c.name });
          setCampaignName(`Follow-up: ${c.name}`);
          setSubject(c.subject ? `Re: ${c.subject}` : 'Follow-up');
          // Pre-select the people who engaged with the original
          if (!presetPeople) {
            setEngagedEmails((d.recipients || []).filter((r) => r.opens || r.clicks || r.room || r.roomSeconds).map((r) => r.email.toLowerCase()));
          }
        }
      })
      .catch(() => {});
  }, [existingCampaignId, duplicateId, followupId, presetPeople, putBody]);

  // Follow-up preselection arrives as lowercase emails; map them onto people
  // once both the campaign and the people list are loaded.
  useEffect(() => {
    if (!engagedEmails || !people.length) return;
    const lower = new Set(engagedEmails);
    setSelected(new Set(people.filter((p) => lower.has(p.email.toLowerCase()) && !p.doNotEmail).map((p) => p.email)));
    setEngagedEmails(null);
  }, [engagedEmails, people]);

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`).then((r) => r.json()).then((d) => {
      const t = d.template;
      if (!t) return;
      if (t.Subject) setSubject(t.Subject);
      if (t.Name && !campaignName) setCampaignName(t.Name);
      if (t.Body) putBody(t.Body);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, putBody]);

  // The editor is uncontrolled (so the cursor never jumps). Whenever it
  // mounts again (back from Preview or Review), put the current body in it.
  useEffect(() => {
    if (step !== 'compose' || view !== 'edit') return;
    requestAnimationFrame(() => {
      if (editorRef.current && editorRef.current.innerHTML !== body) editorRef.current.innerHTML = body;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const recipients = useMemo(() => people.filter((p) => selected.has(p.email)), [people, selected]);
  const fullTemplate = useMemo(() => body + signatureBlock(includeSig), [body, includeSig]);
  const previewPerson = useMemo(() => recipients.find((p) => p.email === previewEmail) || recipients[0] || null, [recipients, previewEmail]);

  const resolveFor = useCallback((person, html = fullTemplate) => {
    let out = resolveMergeTags(html, person || {});
    out = out.replace(/\{\{pdf_link\}\}/g, pdfLink ? pdfAnchor(pdfLink, pdfLabel || 'View PDF') : '');
    return out;
  }, [fullTemplate, pdfLink, pdfLabel]);

  const captureEditor = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : body;
    setBody(html);
    return html;
  };

  const insertTag = (tag) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, tag);
    captureEditor();
  };

  const checks = useMemo(() => {
    const out = [];
    const tmpl = fullTemplate;
    const plain = tmpl.replace(/<[^>]*>/g, '').trim();
    if (!subject.trim()) out.push({ level: 'danger', text: 'There is no subject.' });
    if (!plain) out.push({ level: 'danger', text: 'The message is empty.' });
    const noName = recipients.filter((p) => missingFor(tmpl, p).includes('first_name'));
    if (noName.length) {
      out.push({
        level: 'warn',
        text: `${noName.length} recipient${noName.length > 1 ? 's have' : ' has'} no first name, so {{first_name}} would be blank (“Hello ,”).`,
        fix: { label: 'Use “there” as fallback', run: () => putBody(body.replace(/\{\{\s*first_name\s*\}\}/g, '{{first_name|there}}')) },
      });
    }
    const otherMissing = ['company', 'city', 'surname'].filter((k) => recipients.some((p) => missingFor(tmpl, p).includes(k)));
    if (otherMissing.length) out.push({ level: 'warn', text: `Some recipients have no ${otherMissing.join(' / ')} for the tag you used.` });
    if (/\{\{pdf_link\}\}/.test(tmpl) && !pdfLink) out.push({ level: 'warn', text: 'The message has a PDF link tag but no PDF is attached; it will be left blank.' });
    if (pdfLink && !/\{\{pdf_link\}\}/.test(tmpl)) out.push({ level: 'warn', text: 'A PDF is attached but the message has no PDF link tag, so the link will not appear.', fix: { label: 'Add it at the end', run: () => putBody(`${body}<p>{{pdf_link}}</p>`) } });
    if ((cc.trim() || bcc.trim()) && recipients.length > 1) out.push({ level: 'warn', text: `Cc/Bcc will be added to each of the ${recipients.length} emails.` });
    if (/rooms\.diez\.gallery/.test(tmpl)) out.push({ level: 'info', text: 'Viewing room links detected: visits, works viewed and inquiries will be tracked per person.' });
    if (recipients.length > SEND_BATCH) out.push({ level: 'info', text: `Sent in ${Math.ceil(recipients.length / SEND_BATCH)} batches of ${SEND_BATCH}. Keep this tab open until it finishes (about ${Math.ceil(recipients.length * 1.1 / 60)} min).` });
    return out;
  }, [fullTemplate, subject, recipients, pdfLink, cc, bcc, body, putBody]);

  const blocking = checks.some((c) => c.level === 'danger');

  // ── Actions ─────────────────────────────────────────────────────────────
  const toReview = () => {
    const html = captureEditor();
    const full = html + signatureBlock(includeSig);
    if (personalizedFrom && full !== personalizedFrom && Object.keys(customBodies).length) {
      setCustomBodies({});
      setPersonalizedFrom(null);
      setNotice('The message changed, so individual edits were reset');
      setTimeout(() => setNotice(''), 3500);
    }
    setStep('review');
    window.scrollTo(0, 0);
  };

  const startPersonalize = () => {
    const initial = {};
    for (const p of recipients) initial[p.id] = customBodies[p.id] || resolveMergeTags(fullTemplate, p);
    setCustomBodies(initial);
    setPersonalizedFrom(fullTemplate);
    setEditingId(recipients[0]?.id || null);
    setStep('personalize');
  };

  const savePersonal = () => {
    if (personalizeRef.current && editingId) {
      const html = personalizeRef.current.innerHTML;
      setCustomBodies((prev) => ({ ...prev, [editingId]: html }));
      return html;
    }
    return null;
  };

  useEffect(() => {
    if (step === 'personalize' && personalizeRef.current && editingId) {
      personalizeRef.current.innerHTML = customBodies[editingId] || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, editingId]);

  const editedIds = useMemo(
    () => Object.keys(customBodies).filter((id) => {
      const p = recipients.find((r) => r.id === id);
      return p && customBodies[id] !== resolveMergeTags(fullTemplate, p);
    }),
    [customBodies, recipients, fullTemplate]
  );

  const send = async (resumeFrom = 0, knownCampaignId = null) => {
    const list = recipients;
    let campaignId = knownCampaignId || existingCampaignId || null;
    const edited = new Set(editedIds);
    setStep('sending');
    setProgress((p) => ({ total: list.length, done: resumeFrom, sent: p?.sent || 0, failed: p?.failed || 0, skipped: p?.skipped || 0, error: null, campaignId }));

    for (let i = resumeFrom; i < list.length; i += SEND_BATCH) {
      const chunk = list.slice(i, i + SEND_BATCH);
      const chunkBodies = {};
      for (const p of chunk) if (edited.has(p.id)) chunkBodies[p.id] = customBodies[p.id];
      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignName: campaignName || subject,
            subject,
            bodyTemplate: fullTemplate,
            recipients: chunk,
            pdfLink: pdfLink || undefined,
            pdfLabel: pdfLabel || undefined,
            customBodies: chunkBodies,
            cc: cc.trim() || undefined,
            bcc: bcc.trim() || undefined,
            ...(campaignId && { campaignId }),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Whole batch already received / suppressed: not an error, move on
          if (res.status === 400 && /already received|Do Not Email/i.test(data.error || '')) {
            setProgress((p) => ({ ...p, done: Math.min(i + chunk.length, list.length), skipped: p.skipped + chunk.length }));
            continue;
          }
          throw new Error(data.error || `Server error ${res.status}`);
        }
        campaignId = data.campaignId;
        setProgress((p) => ({
          ...p,
          campaignId,
          done: Math.min(i + chunk.length, list.length),
          sent: p.sent + (data.sent || 0),
          failed: p.failed + (data.failed || 0),
          skipped: p.skipped + (data.skipped || 0) + (data.suppressed || 0),
        }));
      } catch (err) {
        setProgress((p) => ({ ...p, error: err.message, resumeFrom: i, campaignId }));
        return;
      }
    }
    setProgress((p) => ({ ...p, finished: true }));
    setStep('done');
  };

  const sendTest = async () => {
    if (!test.email.trim()) return;
    const html = captureEditor() + signatureBlock(includeSig);
    setTest((t) => ({ ...t, busy: true, result: null }));
    try {
      const res = await fetch('/api/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlBody: html, testEmail: test.email.trim(), sample: previewPerson, pdfLink: pdfLink || undefined, pdfLabel: pdfLabel || undefined }),
      });
      const d = await res.json();
      setTest((t) => ({ ...t, busy: false, result: res.ok ? `Sent to ${d.sentTo}${previewPerson ? `, as if to ${previewPerson.fullName || previewPerson.email}` : ''}` : `Error: ${d.error}` }));
    } catch (e) {
      setTest((t) => ({ ...t, busy: false, result: `Error: ${e.message}` }));
    }
  };

  const saveTemplate = async () => {
    const name = window.prompt('Template name', campaignName || subject);
    if (!name) return;
    const html = captureEditor();
    const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, subject, body: html }) });
    setNotice(res.ok ? 'Template saved' : 'Could not save template');
    setTimeout(() => setNotice(''), 2000);
    if (res.ok) fetch('/api/templates').then((r) => r.json()).then((d) => setTemplates(d.templates || []));
  };

  const saveSegment = async (name, f) => {
    const res = await fetch('/api/segments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, filters: f }) });
    const d = await res.json();
    if (res.ok) setSegments((s) => [...s, d.segment].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const deleteSegment = async (id) => {
    setSegments((s) => s.filter((x) => x.id !== id));
    await fetch('/api/segments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  };

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done' && progress) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 sm:p-14 text-center max-w-md w-full">
          <div className="eyebrow mb-3">Campaign sent</div>
          <div className="text-5xl num mb-2">{progress.sent}</div>
          <p className="text-sm text-gallery-mid">emails delivered to Resend</p>
          {progress.failed > 0 && <p className="text-sm text-gallery-danger mt-2">{progress.failed} failed</p>}
          {progress.skipped > 0 && <p className="text-sm text-gallery-mid mt-1">{progress.skipped} skipped (already received or do not email)</p>}
          <p className="text-2xs text-gallery-light mt-4 mb-8">{campaignName || subject}</p>
          <div className="flex gap-2 justify-center">
            {progress.campaignId && <Link href={`/campaigns/${progress.campaignId}`} className="btn-primary">See the report</Link>}
            <Link href="/" className="btn-secondary">Today</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Sending ──────────────────────────────────────────────────────────────
  if (step === 'sending' && progress) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 sm:p-10 max-w-md w-full">
          <div className="eyebrow mb-2">{progress.error ? 'Paused' : 'Sending'}</div>
          <div className="text-lg mb-4">{campaignName || subject}</div>
          <div className="h-1.5 bg-gallery-bg mb-2"><div className="h-1.5 bg-gallery-black transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="flex justify-between text-xs text-gallery-mid num">
            <span>{progress.done} of {progress.total}</span>
            <span>{progress.sent} sent{progress.failed ? ` · ${progress.failed} failed` : ''}</span>
          </div>
          {progress.error ? (
            <div className="mt-5">
              <div className="notice-danger mb-3">{progress.error}</div>
              <p className="text-xs text-gallery-mid mb-3">Nothing is lost: people who already received it are skipped when you resume.</p>
              <button type="button" className="btn-primary w-full" onClick={() => send(progress.resumeFrom, progress.campaignId)}>Resume sending</button>
            </div>
          ) : (
            <p className="text-2xs text-gallery-light mt-5">Keep this tab open until it finishes.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Personalize ──────────────────────────────────────────────────────────
  if (step === 'personalize') {
    const current = recipients.find((p) => p.id === editingId);
    return (
      <div>
        <button type="button" onClick={() => { savePersonal(); setStep('review'); }} className="btn-ghost -ml-2 mb-3"><Icon name="back" size={14} /> Back to review</button>
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="page-title">Personalize</h1>
            <p className="page-sub">Edit any individual email. Edited ones are marked.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => { savePersonal(); setStep('review'); }}>Done</button>
        </div>
        <div className="card flex flex-col sm:flex-row min-h-[60vh]">
          <div className="sm:w-64 border-b sm:border-b-0 sm:border-r border-gallery-border max-h-48 sm:max-h-none overflow-y-auto">
            {recipients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { savePersonal(); setEditingId(p.id); }}
                className={`w-full text-left px-4 py-2.5 border-b border-gallery-border ${p.id === editingId ? 'bg-gallery-bg' : 'hover:bg-gallery-bg'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{p.fullName || p.email}</span>
                  {editedIds.includes(p.id) && <span className="h-1.5 w-1.5 rounded-full bg-gallery-accent shrink-0" />}
                </div>
                <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
              </button>
            ))}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {current && (
              <>
                <div className="px-5 py-2.5 border-b border-gallery-border flex items-center justify-between">
                  <span className="text-sm">{current.fullName || current.email}</span>
                  <button type="button" className="btn-ghost" onClick={() => { const html = resolveMergeTags(fullTemplate, current); setCustomBodies((c) => ({ ...c, [current.id]: html })); if (personalizeRef.current) personalizeRef.current.innerHTML = html; }}>Reset</button>
                </div>
                <div ref={personalizeRef} contentEditable suppressContentEditableWarning onBlur={savePersonal} className="prose-mail flex-1 px-5 py-5 outline-none text-[15px] leading-relaxed" style={{ fontFamily: 'Arial, sans-serif' }} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div>
        <button type="button" onClick={() => setStep('compose')} className="btn-ghost -ml-2 mb-3"><Icon name="back" size={14} /> Back to edit</button>
        <h1 className="page-title mb-6">Review and send</h1>
        {notice && <div className="notice-info mb-4">{notice}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="card p-4 sm:p-5 space-y-3">
              <div><div className="eyebrow">Campaign</div><div className="text-base">{campaignName || subject || <span className="text-gallery-light">Untitled</span>}</div></div>
              <div><div className="eyebrow">Subject</div><div className="text-base">{subject || <span className="text-gallery-danger">Missing</span>}</div></div>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div><div className="eyebrow">Recipients</div><div className="text-2xl num">{recipients.length}</div></div>
                <div><div className="eyebrow">Edited</div><div className="text-2xl num">{editedIds.length}</div></div>
                <div><div className="eyebrow">PDF</div><div className="text-sm pt-1.5">{pdfLink ? (pdfLabel || 'View PDF') : 'None'}</div></div>
              </div>
              {origin?.kind === 'add' && <div className="notice-info">Adding people to “{origin.name}”. Anyone who already received it is skipped.</div>}
            </div>

            {checks.length > 0 && (
              <div className="space-y-2">
                {checks.map((c, i) => (
                  <div key={i} className={`${c.level === 'danger' ? 'notice-danger' : c.level === 'warn' ? 'notice-warn' : 'notice-info'} flex items-start justify-between gap-3`}>
                    <span>{c.text}</span>
                    {c.fix && <button type="button" className="shrink-0 underline underline-offset-2" onClick={c.fix.run}>{c.fix.label}</button>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" disabled={blocking || recipients.length === 0} onClick={() => send(0)} className="btn-primary py-3 text-base flex-1">
                Send to {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
              </button>
              <button type="button" onClick={startPersonalize} disabled={recipients.length === 0} className="btn-secondary py-3">Personalize individually</button>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-2">How it reads for {previewPerson?.fullName || 'a recipient'}</div>
            <div className="card overflow-hidden">
              <Preview html={previewPerson && customBodies[previewPerson.id] && editedIds.includes(previewPerson.id) ? customBodies[previewPerson.id] : resolveFor(previewPerson)} subject={resolveMergeTags(subject, previewPerson || {})} device="desktop" person={previewPerson} />
            </div>
            <div className="card mt-4 max-h-[40vh] overflow-y-auto">
              {recipients.map((p) => (
                <button key={p.email} type="button" onClick={() => setPreviewEmail(p.email)} className={`w-full row text-left ${previewPerson?.email === p.email ? 'bg-gallery-bg' : 'hover:bg-gallery-bg'}`}>
                  <span className="min-w-0 flex-1"><span className="block text-sm truncate">{p.fullName || p.email}</span><span className="block text-2xs text-gallery-mid truncate">{p.email}</span></span>
                  {editedIds.includes(p.id) && <span className="text-2xs text-gallery-accent">edited</span>}
                  {!p.name && <span className="text-2xs text-gallery-warn">no name</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Compose ──────────────────────────────────────────────────────────────
  return (
    <div className="-mx-4 sm:-mx-6 -my-6 sm:-my-8">
      {/* Phone switcher */}
      <div className="sm:hidden flex items-center justify-between gap-2 px-4 py-2 border-b border-gallery-border bg-gallery-white">
        <Segmented value={pane} onChange={setPane} options={[{ value: 'recipients', label: 'Recipients', count: selected.size }, { value: 'message', label: 'Message' }]} />
        <button type="button" className="btn-primary btn-sm" disabled={!selected.size} onClick={toReview}>Review</button>
      </div>

      <div className="flex h-[calc(100dvh-56px-50px-76px)] sm:h-[calc(100dvh-56px)]">
        {/* Recipients */}
        <aside className={`${pane === 'recipients' ? 'flex' : 'hidden'} sm:flex w-full sm:w-[320px] lg:w-[340px] shrink-0 flex-col border-r border-gallery-border bg-gallery-white min-h-0`}>
          <RecipientPicker
            people={people}
            loading={loadingPeople}
            selected={selected}
            setSelected={setSelected}
            alreadySent={alreadySent}
            filters={filters}
            setFilters={setFilters}
            segments={segments}
            onSaveSegment={saveSegment}
            onDeleteSegment={deleteSegment}
            artists={artists}
          />
        </aside>

        {/* Message */}
        <section className={`${pane === 'message' ? 'flex' : 'hidden'} sm:flex flex-1 flex-col min-w-0 bg-gallery-white`}>
          <div className="flex items-center gap-3 px-3 sm:px-5 py-2 border-b border-gallery-border">
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} disabled={origin?.kind === 'add'} placeholder="Campaign name (internal)" className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-gallery-light" />
            {origin && <span className="chip shrink-0">{origin.kind === 'add' ? 'Adding to' : origin.kind === 'duplicate' ? 'Copy of' : 'Follow-up to'} {origin.name}</span>}
            <div className="hidden sm:block"><Segmented value={view} onChange={(v) => { if (v === 'preview') captureEditor(); setView(v); }} options={[{ value: 'edit', label: 'Write' }, { value: 'preview', label: 'Preview' }]} /></div>
          </div>

          <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5 border-b border-gallery-border text-sm">
            <span className="text-gallery-light w-8 shrink-0">To</span>
            <button type="button" onClick={() => setPane('recipients')} className={`flex-1 text-left truncate ${selected.size ? '' : 'text-gallery-light'}`}>
              {selected.size === 0 ? 'Choose recipients' : recipients.slice(0, 3).map((p) => p.fullName || p.email).join(', ') + (selected.size > 3 ? ` and ${selected.size - 3} more` : '')}
            </button>
            <button type="button" onClick={() => setShowCc((v) => !v)} className="text-xs text-gallery-mid hover:text-gallery-black shrink-0">Cc/Bcc</button>
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-3 px-3 sm:px-5 py-2 border-b border-gallery-border text-sm">
                <span className="text-gallery-light w-8 shrink-0">Cc</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Comma separated" className="flex-1 bg-transparent outline-none" />
              </div>
              <div className="flex items-center gap-3 px-3 sm:px-5 py-2 border-b border-gallery-border text-sm">
                <span className="text-gallery-light w-8 shrink-0">Bcc</span>
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Comma separated" className="flex-1 bg-transparent outline-none" />
              </div>
            </>
          )}
          <div className="px-3 sm:px-5 py-2.5 border-b border-gallery-border">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full text-base bg-transparent outline-none placeholder:text-gallery-light" />
          </div>

          {view === 'edit' ? (
            <>
              <FormatToolbar editorRef={editorRef} onChange={captureEditor} onInsert={insertTag} />
              <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setBody(e.currentTarget.innerHTML)}
                  className="prose-mail outline-none min-h-[240px] text-[15px] leading-relaxed"
                  data-placeholder="Write your message…"
                />
                {includeSig && (
                  <div className="mt-6 pt-3 border-t border-dashed border-gallery-border text-sm text-gallery-mid leading-relaxed">
                    {SIGNATURE_TEXT.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-gallery-border">
                <Segmented value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Phone' }]} />
                {recipients.length > 0 && (
                  <select className="input-field w-auto py-1 text-sm ml-auto max-w-[50%]" value={previewPerson?.email || ''} onChange={(e) => setPreviewEmail(e.target.value)}>
                    {recipients.slice(0, 200).map((p) => <option key={p.email} value={p.email}>As {p.fullName || p.email}</option>)}
                  </select>
                )}
              </div>
              <Preview html={resolveFor(previewPerson)} subject={resolveMergeTags(subject, previewPerson || {})} device={device} person={previewPerson} />
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gallery-border px-3 sm:px-5 py-2.5 flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gallery-mid cursor-pointer mr-1">
              <input type="checkbox" className="accent-gallery-black" checked={includeSig} onChange={(e) => setIncludeSig(e.target.checked)} /> Signature
            </label>
            <button type="button" className={`btn-ghost ${pdfLink ? 'text-gallery-accent' : ''}`} onClick={() => {
              const url = window.prompt('Google Drive PDF link', pdfLink);
              if (url === null) return;
              setPdfLink(url.trim());
              if (url.trim()) {
                const label = window.prompt('Link text in the email', pdfLabel || 'View PDF');
                if (label !== null) setPdfLabel(label.trim());
              }
            }}>
              {pdfLink ? `PDF: ${pdfLabel || 'View PDF'}` : '+ PDF'}
            </button>
            <div className="relative">
              <button type="button" className="btn-ghost" onClick={() => setShowTemplates((v) => !v)}>Templates</button>
              {showTemplates && (
                <div className="absolute bottom-10 left-0 z-30 card shadow-pop w-64 max-h-72 overflow-y-auto">
                  {templates.length === 0 && <div className="px-4 py-3 text-xs text-gallery-light">No templates yet</div>}
                  {templates.map((t) => (
                    <button key={t.id} type="button" className="w-full text-left px-4 py-2.5 border-b border-gallery-border hover:bg-gallery-bg" onClick={() => { if (t.Subject) setSubject(t.Subject); putBody(t.Body || ''); setShowTemplates(false); }}>
                      <div className="text-sm truncate">{t.Name}</div>
                      {t.Subject && <div className="text-2xs text-gallery-mid truncate">{t.Subject}</div>}
                    </button>
                  ))}
                  <button type="button" className="w-full text-left px-4 py-2.5 text-xs text-gallery-mid hover:text-gallery-black" onClick={() => { setShowTemplates(false); saveTemplate(); }}>Save current as template</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" className="btn-ghost" onClick={() => setTest((t) => ({ ...t, open: !t.open, result: null }))}>Test</button>
              {test.open && (
                <div className="absolute bottom-10 left-0 z-30 card shadow-pop w-72 p-3">
                  <div className="text-2xs text-gallery-mid mb-2">Sends exactly what {previewPerson ? (previewPerson.fullName || previewPerson.email) : 'a recipient'} will get, without tracking.</div>
                  <div className="flex gap-2">
                    <input type="email" value={test.email} onChange={(e) => setTest((t) => ({ ...t, email: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && sendTest()} placeholder="your@email.com" className="input-field py-1.5 text-sm" />
                    <button type="button" className="btn-primary btn-sm" disabled={test.busy} onClick={sendTest}>{test.busy ? '…' : 'Send'}</button>
                  </div>
                  {test.result && <div className="text-2xs mt-2 text-gallery-mid">{test.result}</div>}
                </div>
              )}
            </div>
            {notice && <span className="text-2xs text-gallery-mid">{notice}</span>}
            <button type="button" className="btn-primary ml-auto hidden sm:inline-flex" disabled={!selected.size} onClick={toReview}>
              Review ({selected.size})
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gallery-light">Loading…</div>}>
      <ComposerContent />
    </Suspense>
  );
}
