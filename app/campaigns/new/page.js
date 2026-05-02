'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// "All" is always the first filter; the rest come from Airtable
const ALL_FILTER = { value: '', label: 'All' };

// Plain text version (used to render the preview in the compose UI)
const SIGNATURE = `Diego Diez\nDirector of diez\n+31 633261845\n+34 648872907\nInstagram`;

// HTML version sent in the actual email, with links on "diez" and "Instagram"
const SIGNATURE_HTML = [
  `<div>Diego Diez</div>`,
  `<div>Director of <a href="https://diez.gallery" style="color:#1a1a1a;text-decoration:underline;">diez</a></div>`,
  `<div>+31 633261845</div>`,
  `<div>+34 648872907</div>`,
  `<div><a href="https://instagram.com/diez.gallery" style="color:#1a1a1a;text-decoration:underline;">Instagram</a></div>`,
].join('');

// Resolve merge tags for a single recipient against the template
function resolveTemplate(template, person) {
  let resolved = template
    .replace(/\{\{first_name\}\}/g, person.name || '')
    .replace(/\{\{surname\}\}/g, person.surname || '')
    .replace(/\{\{full_name\}\}/g, `${person.name || ''} ${person.surname || ''}`.trim())
    .replace(/\{\{email\}\}/g, person.email || '')
    .replace(/\{\{city\}\}/g, person.city || '');
  // Leave {{pdf_link}} as-is; it's resolved server-side with tracking
  return resolved;
}

function FormatToolbar({ editorRef }) {
  const exec = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const insertLink = () => {
    const url = window.prompt('URL:');
    if (url) exec('createLink', url.startsWith('http') ? url : `https://${url}`);
  };

  const btn = 'p-1.5 rounded hover:bg-gallery-border transition-colors text-gallery-dark';

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gallery-border bg-gallery-bg flex-wrap">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className={btn} title="Bold">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className={btn} title="Italic">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} className={btn} title="Underline">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }} className={btn} title="Strikethrough">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6C16 6 14.5 4 12 4s-5 1.5-5 4c0 5 9 4 9 8s-2.5 4-5 4-5-2-5-2"/></svg>
      </button>
      <div className="w-px h-4 bg-gallery-border mx-1" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} className={btn} title="Bullet list">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }} className={btn} title="Numbered list">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </button>
      <div className="w-px h-4 bg-gallery-border mx-1" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className={btn} title="Insert link">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </button>
      <div className="w-px h-4 bg-gallery-border mx-1" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }} className={btn} title="Clear formatting">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
      </button>
    </div>
  );
}

function NewCampaignContent() {
  const editorRef = useRef(null);
  const searchParams = useSearchParams();

  // URL params
  const existingCampaignId = searchParams.get('campaign') || null;
  const followupId         = searchParams.get('followup') || null;
  const templateId         = searchParams.get('template') || null;

  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject]           = useState('');
  const [pdfLink, setPdfLink]           = useState('');
  const [includeSig, setIncludeSig]     = useState(true);
  const [body, setBody]                 = useState('');

  // Scheduling
  const [scheduledFor, setScheduledFor] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  // Template picker
  const [templates, setTemplates]           = useState([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Follow-up campaign info
  const [followupCampaign, setFollowupCampaign] = useState(null);

  // Type filters (loaded from Airtable on mount)
  const [typeFilters, setTypeFilters] = useState([ALL_FILTER]);

  // Recipients
  const [allPeople, setAllPeople]         = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [selected, setSelected]           = useState(new Set());
  const [searchQuery, setSearchQuery]     = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Already-sent emails (for incremental campaigns)
  const [alreadySentEmails, setAlreadySentEmails] = useState(new Set());

  // Personalize step: map of personId -> edited HTML body
  const [customBodies, setCustomBodies]     = useState({});
  const [editingPersonId, setEditingPersonId] = useState(null);
  const personalizeEditorRef = useRef(null);

  // Sending state
  // Steps: compose | personalize | confirm | sending | done
  const [step, setStep]             = useState('compose');
  const [sendResult, setSendResult] = useState(null);
  const [sendProgress, setSendProgress] = useState('');

  // Load templates list
  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});
  }, []);

  // Load existing campaign data if resuming
  useEffect(() => {
    if (!existingCampaignId) return;
    fetch(`/api/campaigns?id=${existingCampaignId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.campaign) {
          setCampaignName(data.campaign.name || '');
          setSubject(data.campaign.subject || '');
          setPdfLink(data.campaign['PDF Link'] || '');
          if (data.campaign['Body Template']) {
            setBody(data.campaign['Body Template']);
          }
        }
        if (data.events) {
          const sent = new Set();
          data.events.forEach((ev) => {
            if (ev['Event Type'] === 'Sent' && ev['Recipient Email']) {
              sent.add(ev['Recipient Email']);
            }
          });
          setAlreadySentEmails(sent);
        }
      })
      .catch(() => {});
  }, [existingCampaignId]);

  // Load follow-up campaign info
  useEffect(() => {
    if (!followupId) return;
    fetch(`/api/campaigns?id=${followupId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.campaign) {
          setFollowupCampaign(data.campaign);
          const origSubject = data.campaign.subject || '';
          setSubject(origSubject ? `Follow-up: ${origSubject}` : 'Follow-up');
          setCampaignName(`Follow-up: ${data.campaign.name || origSubject}`);
        }
      })
      .catch(() => {});
  }, [followupId]);

  // Load template
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.template) {
          const t = data.template;
          if (t.Subject) setSubject(t.Subject);
          if (t.Name) setCampaignName(t.Name);
          if (t.Body && editorRef.current) {
            editorRef.current.innerHTML = t.Body;
            setBody(t.Body);
          } else if (t.Body) {
            setBody(t.Body);
          }
        }
      })
      .catch(() => {});
  }, [templateId]);

  const applyTemplate = (t) => {
    if (t.Subject) setSubject(t.Subject);
    if (t.Body && editorRef.current) {
      editorRef.current.innerHTML = t.Body;
      setBody(t.Body);
    }
    setShowTemplatePicker(false);
  };

  // Fetch contact-type options from Airtable schema
  useEffect(() => {
    fetch('/api/contact-types')
      .then((r) => r.json())
      .then((data) => {
        if (data.options && Array.isArray(data.options)) {
          const dynamicFilters = data.options.map((name) => ({
            value: name,
            label: name.endsWith('s') ? name : `${name}s`,
          }));
          setTypeFilters([ALL_FILTER, ...dynamicFilters]);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch contacts
  useEffect(() => {
    setLoadingPeople(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAllPeople(data.people || []);
        setLoadingPeople(false);
      })
      .catch(() => setLoadingPeople(false));
  }, [typeFilter]);

  // Filter by search
  useEffect(() => {
    if (!searchQuery) { setFilteredPeople(allPeople); return; }
    const q = searchQuery.toLowerCase();
    setFilteredPeople(
      allPeople.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.surname?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, allPeople]);

  const toggleSelect = useCallback((email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }, []);

  const selectAll  = () => setSelected(new Set(filteredPeople.map((p) => p.email)));
  const selectNone = () => setSelected(new Set());

  const canSend = subject && selected.size > 0;
  const recipientList = allPeople.filter((p) => selected.has(p.email));

  // Rich text toolbar
  const fmt = (cmd, val) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  };

  const insertMergeTag = (tag) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, tag);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
  };

  // Initialize customBodies when entering personalize step
  const enterPersonalizeStep = () => {
    // Capture editor HTML before unmounting it
    const currentBody = editorRef.current ? editorRef.current.innerHTML : body;
    setBody(currentBody);

    const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
    const fullTemplate = currentBody + sigBlock;

    // Pre-populate each recipient's custom body with the resolved template
    const initial = {};
    for (const person of recipientList) {
      initial[person.id] = resolveTemplate(fullTemplate, person);
    }
    setCustomBodies(initial);
    setEditingPersonId(recipientList[0]?.id || null);
    setStep('personalize');
  };

  // Save the currently-editing person's body from the contentEditable
  const saveCurrentPersonBody = () => {
    if (personalizeEditorRef.current && editingPersonId) {
      setCustomBodies((prev) => ({
        ...prev,
        [editingPersonId]: personalizeEditorRef.current.innerHTML,
      }));
    }
  };

  // Switch to a different person in the personalize step
  const switchToPerson = (personId) => {
    saveCurrentPersonBody();
    setEditingPersonId(personId);
  };

  // When the personalizeEditorRef mounts or editingPersonId changes,
  // populate the editor with that person's body
  useEffect(() => {
    if (step === 'personalize' && personalizeEditorRef.current && editingPersonId) {
      personalizeEditorRef.current.innerHTML = customBodies[editingPersonId] || '';
    }
  }, [editingPersonId, step]);

  // Save as template
  const handleSaveTemplate = async () => {
    const name = prompt('Template name:');
    if (!name) return;
    const currentBody = editorRef.current ? editorRef.current.innerHTML : body;
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subject, body: currentBody }),
    });
    alert('Template saved!');
  };

  // Sending
  const handleSend = async () => {
    saveCurrentPersonBody();

    setStep('sending');
    setSendProgress(
      scheduledFor
        ? `Scheduling for ${new Date(scheduledFor).toLocaleString()}...`
        : `Sending to ${recipientList.length} recipient${recipientList.length > 1 ? 's' : ''}...`
    );

    const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
    const fullBody = body + sigBlock;

    const finalCustomBodies = { ...customBodies };
    if (personalizeEditorRef.current && editingPersonId) {
      finalCustomBodies[editingPersonId] = personalizeEditorRef.current.innerHTML;
    }

    try {
      const payload = {
        campaignName: campaignName || subject,
        subject,
        bodyTemplate: fullBody,
        recipients: recipientList,
        pdfLink: pdfLink || undefined,
        customBodies: finalCustomBodies,
        ...(scheduledFor && { scheduledFor }),
      };

      if (existingCampaignId) {
        payload.campaignId = existingCampaignId;
      }

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSendResult({
          success: true,
          sent: data.sent,
          failed: data.failed,
          skipped: data.skipped || 0,
          campaignId: data.campaignId,
          scheduled: data.scheduled || false,
          scheduledFor: data.scheduledFor || null,
        });
        setStep('done');
      } else {
        setSendResult({ success: false, error: data.error });
        setStep('confirm');
      }
    } catch (err) {
      setSendResult({ success: false, error: err.message });
      setStep('confirm');
    }
  };

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done' && sendResult?.success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border border-gallery-border bg-gallery-white p-14 text-center max-w-sm w-full">
          {sendResult.scheduled ? (
            <>
              <div className="font-serif italic text-3xl text-gallery-accent mb-3">Scheduled</div>
              <p className="text-sm text-gallery-mid mb-1">
                Campaign scheduled for{' '}
                <strong className="text-gallery-black">
                  {new Date(sendResult.scheduledFor).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </strong>
              </p>
            </>
          ) : (
            <>
              <div className="font-serif italic text-3xl text-gallery-success mb-3">Campaign Sent</div>
              <p className="text-sm text-gallery-mid mb-1">
                <strong className="text-gallery-black tabular-nums">{sendResult.sent}</strong> emails sent successfully
              </p>
              {sendResult.failed > 0 && (
                <p className="text-sm text-red-600 mb-1">{sendResult.failed} failed</p>
              )}
              {sendResult.skipped > 0 && (
                <p className="text-sm text-gallery-mid mb-1">{sendResult.skipped} skipped (already sent)</p>
              )}
            </>
          )}
          <p className="text-2xs text-gallery-light mt-1 mb-8">{campaignName || subject}</p>
          <div className="flex gap-3 justify-center">
            <a href={`/campaigns/${sendResult.campaignId}`} className="btn-primary">View Campaign</a>
            <a href="/campaigns/new" className="btn-secondary">New Campaign</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (step === 'confirm' || step === 'sending') {
    const isSending = step === 'sending';
    const editedCount = Object.keys(customBodies).filter((id) => {
      // Count how many were actually edited vs the original resolved template
      const person = recipientList.find((p) => p.id === id);
      if (!person) return false;
      const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
      const original = resolveTemplate(body + sigBlock, person);
      return customBodies[id] !== original;
    }).length;

    return (
      <div>
        <button
          onClick={() => { if (!isSending) setStep('personalize'); }}
          className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors mb-4 inline-block"
        >
          ← Back to personalize
        </button>
        <h1 className="font-serif italic text-3xl mb-8">Confirm &amp; Send</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="stat-card">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Campaign</div>
              <div className="text-base font-medium">{campaignName || <span className="text-gallery-light italic">Untitled</span>}</div>
            </div>
            <div className="stat-card">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Subject</div>
              <div className="text-base font-medium">{subject}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Recipients</div>
                <div className="text-2xl font-medium tabular-nums">{recipientList.length}</div>
              </div>
              <div className="stat-card">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Edited</div>
                <div className="text-2xl font-medium tabular-nums">{editedCount}</div>
              </div>
              <div className="stat-card">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">PDF Link</div>
                <div className="text-sm font-medium">{pdfLink ? 'Attached' : <span className="text-gallery-light">None</span>}</div>
              </div>
            </div>
            {existingCampaignId && (
              <div className="border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                Adding to existing campaign. Already-sent recipients will be skipped automatically.
              </div>
            )}
            {scheduledFor && (
              <div className="border border-gallery-border bg-gallery-bg p-4 text-sm text-gallery-mid">
                Scheduled for:{' '}
                <strong className="text-gallery-black">
                  {new Date(scheduledFor).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </strong>
                <button
                  onClick={() => setScheduledFor('')}
                  className="ml-2 text-gallery-light hover:text-gallery-black"
                >
                  ×
                </button>
              </div>
            )}
            {sendResult && !sendResult.success && (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Error: {sendResult.error}
              </div>
            )}
            <button
              onClick={handleSend}
              disabled={isSending}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-40"
            >
              {isSending
                ? sendProgress
                : scheduledFor
                  ? `Schedule for ${new Date(scheduledFor).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : `Send to ${recipientList.length} recipient${recipientList.length !== 1 ? 's' : ''}`}
            </button>
          </div>
          <div>
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-3">
              Recipients ({recipientList.length})
            </div>
            <div className="border border-gallery-border bg-gallery-white max-h-[60vh] overflow-y-auto">
              {recipientList.map((p) => {
                const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
                const original = resolveTemplate(body + sigBlock, p);
                const wasEdited = customBodies[p.id] && customBodies[p.id] !== original;
                return (
                  <div key={p.email} className="flex items-center justify-between px-4 py-2.5 border-b border-gallery-border last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name} {p.surname}</div>
                      <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {wasEdited && (
                        <span className="text-2xs text-gallery-accent font-medium">edited</span>
                      )}
                      {p.type && <span className="badge bg-gallery-accent-light text-gallery-accent">{p.type}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Personalize — per-recipient body editing ──────────────────────────────
  if (step === 'personalize') {
    const currentPerson = recipientList.find((p) => p.id === editingPersonId);

    return (
      <div>
        <button
          onClick={() => setStep('compose')}
          className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors mb-4 inline-block"
        >
          ← Back to compose
        </button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif italic text-3xl mb-1">Personalize</h1>
            <p className="text-sm text-gallery-mid">
              Edit individual messages before sending. Click a name to customize their email.
            </p>
          </div>
          <button
            onClick={() => {
              saveCurrentPersonBody();
              setStep('confirm');
            }}
            className="btn-primary py-2.5 px-6"
          >
            Review &amp; Send ({recipientList.length})
          </button>
        </div>

        <div
          className="flex flex-col sm:flex-row gap-0 border border-gallery-border bg-gallery-white"
          style={{ height: 'calc(100vh - 200px)' }}
        >
          {/* Left: recipient list */}
          <div
            className="hidden sm:flex flex-col border-r border-gallery-border flex-shrink-0 overflow-y-auto"
            style={{ width: 240 }}
          >
            {recipientList.map((p) => {
              const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
              const original = resolveTemplate(body + sigBlock, p);
              const wasEdited = customBodies[p.id] && customBodies[p.id] !== original;
              const isActive = p.id === editingPersonId;
              return (
                <button
                  key={p.id}
                  onClick={() => switchToPerson(p.id)}
                  className={`text-left px-4 py-3 border-b border-gallery-border transition-colors ${
                    isActive ? 'bg-gallery-accent-light' : 'hover:bg-gallery-bg'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium truncate">{p.surname}, {p.name}</div>
                    {wasEdited && (
                      <span className="w-2 h-2 rounded-full bg-gallery-accent flex-shrink-0 ml-2" title="Edited" />
                    )}
                  </div>
                  <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                </button>
              );
            })}
          </div>

          {/* Right: editor for selected person */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentPerson && (
              <>
                <div className="flex items-center justify-between px-6 py-3 border-b border-gallery-border bg-gallery-bg">
                  <div>
                    <span className="text-sm font-medium">{currentPerson.name} {currentPerson.surname}</span>
                    <span className="text-2xs text-gallery-mid ml-3">{currentPerson.email}</span>
                  </div>
                  <button
                    onClick={() => {
                      // Reset this person to the original template
                      const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
                      const original = resolveTemplate(body + sigBlock, currentPerson);
                      setCustomBodies((prev) => ({ ...prev, [currentPerson.id]: original }));
                      if (personalizeEditorRef.current) {
                        personalizeEditorRef.current.innerHTML = original;
                      }
                    }}
                    className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors"
                  >
                    Reset to template
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div
                    ref={personalizeEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={() => saveCurrentPersonBody()}
                    className="outline-none text-sm leading-relaxed text-gallery-black min-h-[200px] font-sans"
                    style={{ fontFamily: 'DM Sans, sans-serif' }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Compose — Arternal-style ──────────────────────────────────────────────
  return (
    <div
      className="flex flex-col sm:flex-row"
      style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', margin: '-24px -24px 0' }}
    >
      {/* ── LEFT: Contacts panel ──────────────────────────────────────────── */}
      <div
        className="hidden sm:flex flex-col border-r border-gallery-border bg-gallery-white flex-shrink-0"
        style={{ width: 240 }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gallery-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">Contacts</span>
            <span className="text-2xs text-gallery-accent font-medium tabular-nums">{selected.size} selected</span>
          </div>
          <input
            type="text"
            className="input-field text-xs py-1.5"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Type filters */}
        <div className="px-3 py-2 border-b border-gallery-border flex flex-wrap gap-1">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`text-2xs px-2 py-0.5 transition-colors ${
                typeFilter === f.value
                  ? 'bg-gallery-black text-white'
                  : 'border border-gallery-border text-gallery-mid hover:text-gallery-black'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Select all / none */}
        <div className="px-4 py-1.5 border-b border-gallery-border flex gap-4">
          <button onClick={selectAll} className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors">
            Select all
          </button>
          <button onClick={selectNone} className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors">
            Clear
          </button>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loadingPeople ? (
            <div className="p-6 text-center text-2xs text-gallery-light">Loading...</div>
          ) : filteredPeople.length === 0 ? (
            <div className="p-6 text-center text-2xs text-gallery-light">No contacts found</div>
          ) : (
            filteredPeople.map((person) => {
              const wasSent = alreadySentEmails.has(person.email);
              return (
                <label
                  key={person.email}
                  className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-gallery-border cursor-pointer transition-colors ${
                    selected.has(person.email)
                      ? 'bg-gallery-accent-light'
                      : wasSent
                        ? 'bg-gray-50 opacity-60'
                        : 'hover:bg-gallery-bg'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(person.email)}
                    onChange={() => toggleSelect(person.email)}
                    className="accent-gallery-accent flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{person.surname}, {person.name}</div>
                    <div className="text-2xs text-gallery-mid truncate">{person.email}</div>
                  </div>
                  {wasSent && (
                    <span className="text-2xs text-gallery-light flex-shrink-0">sent</span>
                  )}
                </label>
              );
            })
          )}
        </div>

        {/* Next button */}
        <div className="p-3 border-t border-gallery-border">
          <button
            onClick={() => canSend && enterPersonalizeStep()}
            disabled={!canSend}
            className="btn-primary w-full justify-center py-2.5 text-xs disabled:opacity-40"
          >
            {selected.size === 0
              ? 'Select contacts'
              : `Personalize (${selected.size})`}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Compose area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gallery-white">

        {/* Campaign name top bar */}
        <div className="flex items-center gap-3 px-6 py-2 border-b border-gallery-border">
          <span className="text-2xs font-medium uppercase tracking-wider text-gallery-mid flex-shrink-0">
            Campaign:
          </span>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Opening Week — True as Good"
            className="flex-1 text-xs bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
            disabled={!!existingCampaignId}
          />
          {followupCampaign && (
            <span className="text-2xs text-purple-700 bg-purple-50 px-2 py-0.5 flex-shrink-0">
              Follow-up to: {followupCampaign.name}
            </span>
          )}
          {existingCampaignId && (
            <span className="text-2xs text-blue-600 bg-blue-50 px-2 py-0.5 flex-shrink-0">
              Adding recipients
            </span>
          )}
          {scheduledFor && (
            <span className="text-2xs text-gallery-accent bg-gallery-accent-light px-2 py-0.5 flex-shrink-0">
              Scheduled
            </span>
          )}
          {pdfLink && (
            <button
              onClick={() => setPdfLink('')}
              className="text-2xs text-gallery-accent bg-gallery-accent-light px-2 py-0.5 flex-shrink-0"
            >
              PDF attached ×
            </button>
          )}
        </div>

        {/* To */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <span className="text-sm text-gallery-mid w-6 flex-shrink-0">To</span>
          <div className={`flex-1 text-sm ${selected.size ? 'text-gallery-black' : 'text-gallery-light italic'}`}>
            {selected.size === 0
              ? 'Select contacts from the panel on the left'
              : selected.size <= 3
                ? recipientList.map((p) => `${p.name} ${p.surname}`).join(', ')
                : `${recipientList.slice(0, 2).map((p) => `${p.name} ${p.surname}`).join(', ')} +${selected.size - 2} more`}
          </div>
          {selected.size > 0 && (
            <span className="text-2xs text-gallery-mid flex-shrink-0">{selected.size} recipients</span>
          )}
        </div>

        {/* Bcc */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <span className="text-sm text-gallery-mid w-6 flex-shrink-0">Bcc</span>
          <input
            placeholder="Add bcc..."
            className="flex-1 text-sm bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line..."
            className="flex-1 text-base font-medium bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-gallery-border flex-wrap">
          {[
            { label: 'B', cmd: 'bold',      cls: 'font-bold' },
            { label: 'I', cmd: 'italic',    cls: 'italic' },
            { label: 'U', cmd: 'underline', cls: 'underline' },
          ].map((b) => (
            <button
              key={b.cmd}
              onMouseDown={(e) => { e.preventDefault(); fmt(b.cmd); }}
              className={`w-7 h-7 text-xs border border-gallery-border bg-gallery-bg text-gallery-black hover:bg-gallery-border transition-colors ${b.cls}`}
            >
              {b.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {[
            { label: '- List', cmd: 'insertUnorderedList' },
            { label: '1. List', cmd: 'insertOrderedList' },
          ].map((b) => (
            <button
              key={b.cmd}
              onMouseDown={(e) => { e.preventDefault(); fmt(b.cmd); }}
              className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-black hover:bg-gallery-border transition-colors"
            >
              {b.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {['{{first_name}}', '{{surname}}', '{{full_name}}', '{{pdf_link}}'].map((tag) => (
            <button
              key={tag}
              onMouseDown={(e) => { e.preventDefault(); insertMergeTag(tag); }}
              className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-accent-light text-gallery-accent hover:opacity-80 transition-opacity"
            >
              {tag.replace(/\{\{|\}\}/g, '')}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              const url = prompt('Google Drive PDF link:');
              if (url) setPdfLink(url);
            }}
            className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-mid hover:text-gallery-black transition-colors"
          >
            + Attach PDF
          </button>

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {/* Template picker */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setShowTemplatePicker((v) => !v); }}
              className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-mid hover:text-gallery-black transition-colors"
            >
              Templates
            </button>
            {showTemplatePicker && (
              <div className="absolute top-8 left-0 z-50 bg-gallery-white border border-gallery-border shadow-lg min-w-[220px] max-h-60 overflow-y-auto">
                {templates.length === 0 ? (
                  <div className="px-4 py-3 text-2xs text-gallery-light">No templates saved yet</div>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-gallery-bg border-b border-gallery-border last:border-0"
                    >
                      <div className="font-medium truncate">{t.Name}</div>
                      {t.Subject && <div className="text-gallery-light truncate">{t.Subject}</div>}
                    </button>
                  ))
                )}
                <div className="border-t border-gallery-border">
                  <a href="/templates" className="block px-4 py-2 text-2xs text-gallery-accent hover:text-gallery-black">
                    Manage templates →
                  </a>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSaveTemplate(); }}
            className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-mid hover:text-gallery-black transition-colors"
          >
            Save as template
          </button>

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {/* Schedule */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setShowSchedule((v) => !v); }}
              className={`h-7 px-2 text-2xs border transition-colors ${
                scheduledFor
                  ? 'border-gallery-accent bg-gallery-accent-light text-gallery-accent'
                  : 'border-gallery-border bg-gallery-bg text-gallery-mid hover:text-gallery-black'
              }`}
            >
              {scheduledFor ? '🗓 Scheduled' : 'Schedule'}
            </button>
            {showSchedule && (
              <div className="absolute top-8 right-0 z-50 bg-gallery-white border border-gallery-border shadow-lg p-4 min-w-[240px]">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-2">
                  Send later
                </div>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="input-field text-xs w-full mb-2"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSchedule(false)}
                    className="btn-primary text-2xs py-1 px-3 flex-1 justify-center"
                  >
                    Set
                  </button>
                  {scheduledFor && (
                    <button
                      type="button"
                      onClick={() => { setScheduledFor(''); setShowSchedule(false); }}
                      className="btn-secondary text-2xs py-1 px-3"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body — contentEditable rich text */}
        <FormatToolbar editorRef={editorRef} />
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setBody(e.currentTarget.innerHTML)}
            onBlur={(e) => setBody(e.currentTarget.innerHTML)}
            className="outline-none text-sm leading-relaxed text-gallery-black min-h-[200px] font-sans"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
            dangerouslySetInnerHTML={existingCampaignId && body ? { __html: body } : undefined}
          />
        </div>

        {/* Signature */}
        <div className="px-6 border-t border-gallery-border">
          <label className="flex items-center gap-2 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSig}
              onChange={(e) => setIncludeSig(e.target.checked)}
              className="accent-gallery-accent"
            />
            <span className="text-2xs text-gallery-mid">Include signature</span>
          </label>
          {includeSig && (
            <div className="pb-5 text-sm text-gallery-mid leading-relaxed border-t border-gallery-border pt-3">
              {SIGNATURE.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gallery-light text-sm">Loading...</div>}>
      <NewCampaignContent />
    </Suspense>
  );
}