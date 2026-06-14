'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// "All" is always the first filter; the rest come from Airtable
const ALL_FILTER = { value: '', label: 'All' };

// Max recipients for a direct send before the Vercel function risks a
// timeout (300s budget / ~1.7s per email ≈ 175, with safety margin = 150).
// Above this, the campaign should be scheduled so the cron sends it.
const DIRECT_SEND_LIMIT = 150;

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

  // Cc / Bcc en texto libre. Se aplican a CADA correo del envio.
  const [cc, setCc]   = useState('');
  const [bcc, setBcc] = useState('');

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

  // Master map of every person we've loaded across ALL filter tabs.
  // This is the key to cross-tab selection: `allPeople` only holds the
  // currently visible tab, but `peopleByEmail` remembers everyone we've
  // seen, so the final recipient list can be rebuilt from the full set.
  const [peopleByEmail, setPeopleByEmail] = useState(new Map());

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

  // Test email state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
            // Volcamos el cuerpo en el editor UNA sola vez. A partir de aquí el
            // editor queda "no controlado" por React y el cursor ya no salta al
            // principio cada vez que escribes.
            requestAnimationFrame(() => {
              if (editorRef.current) {
                editorRef.current.innerHTML = data.campaign['Body Template'];
              }
            });
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

  // Fetch contacts whenever the active type filter changes.
  // Incoming people replace the visible list (allPeople) but are ALSO merged
  // into the master peopleByEmail map so selections survive tab switches.
  useEffect(() => {
    setLoadingPeople(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const incoming = data.people || [];
        setAllPeople(incoming);
        setPeopleByEmail((prev) => {
          const next = new Map(prev);
          incoming.forEach((p) => {
            if (p.email) next.set(p.email, p);
          });
          return next;
        });
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
