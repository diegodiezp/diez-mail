'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const SIGNATURE_HTML = [
  `<div>Diego Diez</div>`,
  `<div>Director of <a href="https://diez.gallery" style="color:#1a1a1a;text-decoration:underline;">diez</a></div>`,
  `<div>+31 633261845</div>`,
  `<div>+34 648872907</div>`,
  `<div><a href="https://instagram.com/diez.gallery" style="color:#1a1a1a;text-decoration:underline;">Instagram</a></div>`,
].join('');

// Work out the recipients for a reply.
// - "to" is the original sender (or, if we sent the last message, the first To recipient).
// - When replyAll is true, "cc" gathers every other person on the thread
//   (the remaining To recipients plus the original Cc), minus ourselves and
//   the primary recipient, de-duplicated.
function computeReplyRecipients(lastMsg, senderEmail, replyAll) {
  if (!lastMsg) return { toEmail: '', cc: undefined };
  const parse = (str) =>
    (str || '')
      .split(',')
      .map((part) => {
        const m = part.match(/<(.+?)>/);
        return (m ? m[1] : part).trim().toLowerCase();
      })
      .filter(Boolean);

  const fromMe = lastMsg.from.email?.toLowerCase() === senderEmail.toLowerCase();
  const replyToRaw = fromMe ? (lastMsg.to.split(',')[0] || '').trim() : lastMsg.from.email;
  const m = replyToRaw.match(/<(.+?)>/);
  const toEmail = m ? m[1] : replyToRaw;

  let cc;
  if (replyAll) {
    const exclude = new Set([senderEmail.toLowerCase(), toEmail.toLowerCase()]);
    const everyone = [...parse(lastMsg.to), ...parse(lastMsg.cc)];
    const unique = [...new Set(everyone)].filter((e) => e && !exclude.has(e));
    cc = unique.length ? unique.join(', ') : undefined;
  }
  return { toEmail, cc };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_COLORS = {
  Collector: 'bg-purple-50 text-purple-700',
  Advisor: 'bg-blue-50 text-blue-700',
  Curator: 'bg-teal-50 text-teal-700',
  Institution: 'bg-amber-50 text-amber-700',
  Press: 'bg-pink-50 text-pink-700',
  Gallery: 'bg-gray-100 text-gray-700',
};

function ContactBadge({ contact }) {
  if (!contact) return null;
  const types = Array.isArray(contact.type) ? contact.type : [contact.type].filter(Boolean);
  if (types.length === 0) return null;
  return (
    <span className="flex gap-1">
      {types.map((t) => (
        <span key={t} className={`text-2xs px-1.5 py-0.5 ${TYPE_COLORS[t] || 'bg-gray-50 text-gallery-mid'}`}>
          {t}
        </span>
      ))}
    </span>
  );
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

  const btn = 'p-1.5 rounded hover:bg-gallery-border transition-colors text-gallery-dark disabled:opacity-30';

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gallery-border bg-gallery-bg flex-wrap">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className={btn} title="Bold (Ctrl+B)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className={btn} title="Italic (Ctrl+I)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} className={btn} title="Underline (Ctrl+U)">
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

      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft'); }} className={btn} title="Align left">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter'); }} className={btn} title="Align center">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
      </button>

      <div className="w-px h-4 bg-gallery-border mx-1" />

      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }} className={btn} title="Clear formatting">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
      </button>
    </div>
  );
}

export default function MailPage() {
  // Thread list
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [label, setLabel] = useState('INBOX');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Thread detail
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Reply
  const [showReply, setShowReply] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyResult, setReplyResult] = useState(null);
  const [includeSig, setIncludeSig] = useState(true);
  const [replyAll, setReplyAll] = useState(false);
  const replyEditorRef = useRef(null);

  // Compose (new / forward)
  const [composeMode, setComposeMode] = useState(null); // null | 'new' | 'forward'
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeIncludeSig, setComposeIncludeSig] = useState(true);
  const [sendingCompose, setSendingCompose] = useState(false);
  const [composeResult, setComposeResult] = useState(null);
  const composeEditorRef = useRef(null);

  // Thread actions
  const [trashing, setTrashing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const senderEmail = 'diego@diez.gallery';

  // ── Fetch threads ────────────────────────────────────────────────────────
  const fetchThreads = useCallback(async (append = false, token = null) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (label) params.set('label', label);
      if (token) params.set('pageToken', token);
      const res = await fetch(`/api/mail/threads?${params}`);
      const data = await res.json();
      if (append) setThreads((prev) => [...prev, ...(data.threads || [])]);
      else setThreads(data.threads || []);
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQuery, label]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchThreads(), 300);
    return () => clearTimeout(debounce);
  }, [fetchThreads]);

  // ── Load thread detail ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedThreadId) return;
    setLoadingThread(true);
    setShowReply(false);
    setReplyResult(null);
    setComposeMode(null);
    fetch(`/api/mail/${selectedThreadId}`)
      .then((r) => r.json())
      .then((data) => {
        setThreadMessages(data.messages || []);
        setLoadingThread(false);
      })
      .catch(() => setLoadingThread(false));
  }, [selectedThreadId]);

  // ── Reply ────────────────────────────────────────────────────────────────
  const handleReply = async () => {
    if (!replyEditorRef.current) return;
    const html = replyEditorRef.current.innerHTML;
    if (!html.trim()) return;
    const lastMsg = threadMessages[threadMessages.length - 1];
    if (!lastMsg) return;
    const { toEmail, cc: ccEmails } = computeReplyRecipients(lastMsg, senderEmail, replyAll);
    const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
    const fullBody = html + sigBlock;
    setSendingReply(true);
    setReplyResult(null);
    try {
      const res = await fetch('/api/mail/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId,
          to: toEmail,
          cc: ccEmails,
          subject: lastMsg.subject || '(no subject)',
          htmlBody: fullBody,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReplyResult({ success: true });
        setShowReply(false);
        setTimeout(() => {
          fetch(`/api/mail/${selectedThreadId}`)
            .then((r) => r.json())
            .then((d) => setThreadMessages(d.messages || []));
        }, 1000);
      } else {
        setReplyResult({ success: false, error: data.error });
      }
    } catch (err) {
      setReplyResult({ success: false, error: err.message });
    } finally {
      setSendingReply(false);
    }
  };

  // ── Trash ────────────────────────────────────────────────────────────────
  const handleTrash = async () => {
    if (!window.confirm('Move this conversation to trash?')) return;
    setTrashing(true);
    try {
      await fetch(`/api/mail/${selectedThreadId}`, { method: 'DELETE' });
      setSelectedThreadId(null);
      setThreadMessages([]);
      fetchThreads();
    } catch (err) {
      console.error('Trash failed:', err);
    } finally {
      setTrashing(false);
    }
  };

  // ── Archive ──────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await fetch(`/api/mail/${selectedThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      setSelectedThreadId(null);
      setThreadMessages([]);
      fetchThreads();
    } catch (err) {
      console.error('Archive failed:', err);
    } finally {
      setArchiving(false);
    }
  };

  // ── Mark read / unread ───────────────────────────────────────────────────
  const handleMarkReadUnread = async (makeUnread) => {
    await fetch(`/api/mail/${selectedThreadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: makeUnread ? 'markUnread' : 'markRead' }),
    });
    setThreadMessages((prev) => prev.map((msg) => ({ ...msg, isUnread: makeUnread })));
    setThreads((prev) =>
      prev.map((t) => (t.id === selectedThreadId ? { ...t, isUnread: makeUnread } : t))
    );
  };

  // ── Compose ──────────────────────────────────────────────────────────────
  const openCompose = (mode = 'new', forwardMsg = null) => {
    setComposeMode(mode);
    setSelectedThreadId(null);
    setComposeResult(null);
    setComposeCc('');
    setComposeBcc('');
    setShowCc(false);
    setShowBcc(false);
    if (mode === 'forward' && forwardMsg) {
      setComposeTo('');
      setComposeSubject(`Fwd: ${forwardMsg.subject || ''}`);
      setTimeout(() => {
        if (composeEditorRef.current) {
          composeEditorRef.current.innerHTML = [
            '<br/><br/>',
            '<div style="border-left:3px solid #e0e0e0;padding-left:12px;color:#555;margin-top:16px">',
            '<p style="margin:0 0 4px;font-size:13px">———— Forwarded message ————</p>',
            `<p style="margin:0 0 2px;font-size:13px"><strong>From:</strong> ${forwardMsg.from.name || forwardMsg.from.email} &lt;${forwardMsg.from.email}&gt;</p>`,
            `<p style="margin:0 0 2px;font-size:13px"><strong>Date:</strong> ${forwardMsg.date}</p>`,
            `<p style="margin:0 0 8px;font-size:13px"><strong>Subject:</strong> ${forwardMsg.subject}</p>`,
            forwardMsg.htmlBody || `<p>${forwardMsg.textBody || forwardMsg.snippet}</p>`,
            '</div>',
          ].join('');
        }
      }, 100);
    } else {
      setComposeTo('');
      setComposeSubject('');
      setTimeout(() => {
        if (composeEditorRef.current) {
          composeEditorRef.current.innerHTML = '';
          composeEditorRef.current.focus();
        }
      }, 100);
    }
  };

  const handleCompose = async () => {
    if (!composeEditorRef.current) return;
    const html = composeEditorRef.current.innerHTML;
    if (!html.trim() || !composeTo || !composeSubject) return;
    const sigBlock = composeIncludeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
    const fullBody = html + sigBlock;
    setSendingCompose(true);
    setComposeResult(null);
    try {
      const res = await fetch('/api/mail/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          bcc: composeBcc || undefined,
          subject: composeSubject,
          htmlBody: fullBody,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setComposeResult({ success: true });
        setTimeout(() => {
          setComposeMode(null);
          if (label === 'SENT') fetchThreads();
        }, 1500);
      } else {
        setComposeResult({ success: false, error: data.error });
      }
    } catch (err) {
      setComposeResult({ success: false, error: err.message });
    } finally {
      setSendingCompose(false);
    }
  };

  const isThreadUnread = threadMessages[threadMessages.length - 1]?.isUnread ?? false;

  return (
    <div
      className="flex flex-col sm:flex-row"
      style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', margin: '-24px -24px 0' }}
    >
      {/* ── LEFT: Thread list ──────────────────────────────────────────── */}
      <div
        className="hidden sm:flex flex-col border-r border-gallery-border bg-gallery-white flex-shrink-0"
        style={{ width: 360 }}
      >
        {/* Compose + search + tabs */}
        <div className="px-4 py-3 border-b border-gallery-border">
          <button
            onClick={() => openCompose('new')}
            className="btn-primary text-xs py-2 px-4 w-full mb-3 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Compose
          </button>
          <input
            type="text"
            className="input-field text-xs py-1.5 mb-2 w-full"
            placeholder="Search mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex gap-1">
            {['INBOX', 'SENT'].map((l) => (
              <button
                key={l}
                onClick={() => { setLabel(l); setSelectedThreadId(null); setComposeMode(null); }}
                className={`text-2xs px-3 py-1 transition-colors ${
                  label === l
                    ? 'bg-gallery-black text-white'
                    : 'border border-gallery-border text-gallery-mid hover:text-gallery-black'
                }`}
              >
                {l === 'INBOX' ? 'Inbox' : 'Sent'}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-2xs text-gallery-light">Loading...</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-2xs text-gallery-light">No messages found</div>
          ) : (
            <>
              {threads.map((t) => {
                const isSelected = t.id === selectedThreadId;
                const isMe = t.from.email?.toLowerCase() === senderEmail.toLowerCase();
                const displayName = isMe
                  ? (t.to?.split('<')[0]?.trim() || t.to || 'Me')
                  : (t.contact
                    ? `${t.contact.name} ${t.contact.surname}`.trim()
                    : t.from.name || t.from.email);
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gallery-border transition-colors ${
                      isSelected
                        ? 'bg-gallery-accent-light'
                        : t.isUnread
                        ? 'bg-white hover:bg-gallery-bg'
                        : 'hover:bg-gallery-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-xs truncate ${t.isUnread ? 'font-semibold text-gallery-black' : 'font-medium text-gallery-dark'}`}>
                          {displayName}
                        </span>
                        {t.messageCount > 1 && (
                          <span className="text-2xs text-gallery-light flex-shrink-0">({t.messageCount})</span>
                        )}
                        <ContactBadge contact={t.contact} />
                      </div>
                      <span className="text-2xs text-gallery-light flex-shrink-0">{formatDate(t.date)}</span>
                    </div>
                    <div className={`text-2xs truncate ${t.isUnread ? 'font-medium text-gallery-dark' : 'text-gallery-mid'}`}>
                      {t.subject}
                    </div>
                    <div className="text-2xs text-gallery-light truncate mt-0.5">{t.snippet}</div>
                  </button>
                );
              })}
              {nextPageToken && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => fetchThreads(true, nextPageToken)}
                    disabled={loadingMore}
                    className="text-2xs text-gallery-accent hover:text-gallery-black transition-colors"
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Refresh */}
        <div className="p-2 border-t border-gallery-border text-center">
          <button
            onClick={() => fetchThreads()}
            className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── RIGHT: Compose / Thread detail / Empty ────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gallery-white">

        {/* COMPOSE PANEL */}
        {composeMode ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gallery-border flex items-center justify-between">
              <h2 className="text-base font-medium text-gallery-black">
                {composeMode === 'forward' ? 'Forward' : 'New Message'}
              </h2>
              <button
                onClick={() => setComposeMode(null)}
                className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* To */}
              <div className="border-b border-gallery-border px-6 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gallery-light w-8 flex-shrink-0">To</span>
                <input
                  type="text"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="flex-1 text-sm outline-none text-gallery-black bg-transparent"
                  placeholder="Recipients"
                />
                <div className="flex gap-2 flex-shrink-0">
                  {!showCc && (
                    <button onClick={() => setShowCc(true)} className="text-2xs text-gallery-mid hover:text-gallery-black">Cc</button>
                  )}
                  {!showBcc && (
                    <button onClick={() => setShowBcc(true)} className="text-2xs text-gallery-mid hover:text-gallery-black">Bcc</button>
                  )}
                </div>
              </div>
              {/* Cc */}
              {showCc && (
                <div className="border-b border-gallery-border px-6 py-2.5 flex items-center gap-2">
                  <span className="text-xs text-gallery-light w-8 flex-shrink-0">Cc</span>
                  <input
                    type="text"
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    className="flex-1 text-sm outline-none text-gallery-black bg-transparent"
                    placeholder="Cc recipients"
                    autoFocus
                  />
                </div>
              )}
              {/* Bcc */}
              {showBcc && (
                <div className="border-b border-gallery-border px-6 py-2.5 flex items-center gap-2">
                  <span className="text-xs text-gallery-light w-8 flex-shrink-0">Bcc</span>
                  <input
                    type="text"
                    value={composeBcc}
                    onChange={(e) => setComposeBcc(e.target.value)}
                    className="flex-1 text-sm outline-none text-gallery-black bg-transparent"
                    placeholder="Bcc recipients"
                    autoFocus
                  />
                </div>
              )}
              {/* Subject */}
              <div className="border-b border-gallery-border px-6 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gallery-light w-8 flex-shrink-0">Sub</span>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="flex-1 text-sm outline-none text-gallery-black bg-transparent font-medium"
                  placeholder="Subject"
                />
              </div>
              {/* Toolbar */}
              <FormatToolbar editorRef={composeEditorRef} />
              {/* Body */}
              <div className="flex-1 px-6 py-4">
                <div
                  ref={composeEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="outline-none text-sm leading-relaxed text-gallery-black min-h-[200px] font-sans"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
            </div>

            <div className="border-t border-gallery-border px-6 py-3">
              {composeResult?.success && (
                <div className="mb-2 text-sm text-gallery-success">Sent successfully</div>
              )}
              {composeResult && !composeResult.success && (
                <div className="mb-2 text-sm text-red-600">Error: {composeResult.error}</div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCompose}
                    disabled={sendingCompose || !composeTo || !composeSubject}
                    className="btn-primary text-xs py-2 px-6 disabled:opacity-40"
                  >
                    {sendingCompose ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={() => setComposeMode(null)}
                    className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors"
                  >
                    Discard
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={composeIncludeSig}
                    onChange={(e) => setComposeIncludeSig(e.target.checked)}
                    className="accent-gallery-accent"
                  />
                  <span className="text-2xs text-gallery-mid">Signature</span>
                </label>
              </div>
            </div>
          </div>

        ) : !selectedThreadId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gallery-light">
            Select a conversation
          </div>

        ) : loadingThread ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gallery-light">
            Loading...
          </div>

        ) : (
          <>
            {/* Thread header */}
            <div className="px-6 py-4 border-b border-gallery-border flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-gallery-black">
                  {threadMessages[0]?.subject || '(no subject)'}
                </h2>
                <div className="text-2xs text-gallery-mid mt-1">
                  {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 flex-shrink-0 mt-1">
                {/* Mark read/unread */}
                <button
                  onClick={() => handleMarkReadUnread(!isThreadUnread)}
                  className="text-gallery-light hover:text-gallery-black transition-colors"
                  title={isThreadUnread ? 'Mark as read' : 'Mark as unread'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </button>

                {/* Archive */}
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="text-gallery-light hover:text-gallery-black transition-colors disabled:opacity-40"
                  title="Archive"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </button>

                {/* Trash */}
                <button
                  onClick={handleTrash}
                  disabled={trashing}
                  className="text-gallery-light hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Move to trash"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {threadMessages.map((msg) => {
                const isMe = msg.from.email?.toLowerCase() === senderEmail.toLowerCase();
                return (
                  <div key={msg.id} className="px-6 py-5 border-b border-gallery-border">
                    {/* Message header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                          isMe ? 'bg-gallery-accent text-white' : 'bg-gallery-bg text-gallery-mid border border-gallery-border'
                        }`}>
                          {isMe ? 'DD' : (msg.from.name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {isMe ? 'Diego Diez' : msg.from.name || msg.from.email}
                            </span>
                            {msg.contact && <ContactBadge contact={msg.contact} />}
                          </div>
                          <div className="text-2xs text-gallery-light">
                            to {isMe ? msg.to : 'me'}
                            {msg.cc && <span className="ml-1">· cc {msg.cc}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-2xs text-gallery-light">{formatFullDate(msg.date)}</span>
                        {/* Forward per message */}
                        <button
                          onClick={() => openCompose('forward', { ...msg, subject: threadMessages[0]?.subject })}
                          className="text-gallery-light hover:text-gallery-black transition-colors"
                          title="Forward"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 10 20 15 15 20" />
                            <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Message body */}
                    {msg.htmlBody ? (
                      <div
                        className="text-sm leading-relaxed mail-body"
                        dangerouslySetInnerHTML={{ __html: msg.htmlBody }}
                        style={{ maxWidth: '100%', overflow: 'hidden', wordBreak: 'break-word' }}
                      />
                    ) : (
                      <div className="text-sm leading-relaxed text-gallery-dark whitespace-pre-wrap">
                        {msg.textBody || msg.snippet}
                      </div>
                    )}

                    {/* Attachments */}
                    {msg.attachments?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gallery-border">
                        <div className="text-2xs text-gallery-mid mb-2">
                          {msg.attachments.length} attachment{msg.attachments.length !== 1 ? 's' : ''}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`/api/mail/attachment?messageId=${msg.id}&attachmentId=${encodeURIComponent(att.id)}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 border border-gallery-border text-xs text-gallery-dark hover:bg-gallery-bg transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                              <span className="max-w-[160px] truncate">{att.filename}</span>
                              <span className="text-gallery-light flex-shrink-0">{formatFileSize(att.size)}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Reply area */}
            <div className="border-t border-gallery-border">
              {replyResult?.success && (
                <div className="px-6 py-2 bg-green-50 text-sm text-gallery-success">Reply sent with tracking</div>
              )}
              {replyResult && !replyResult.success && (
                <div className="px-6 py-2 bg-red-50 text-sm text-red-700">Error: {replyResult.error}</div>
              )}

              {!showReply ? (
                <div className="px-6 py-3 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setReplyAll(false);
                      setShowReply(true);
                      setReplyResult(null);
                      setTimeout(() => replyEditorRef.current?.focus(), 100);
                    }}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Reply (with tracking)
                  </button>
                  {(() => {
                    const lastMsg = threadMessages[threadMessages.length - 1];
                    const count = (str) =>
                      (str || '').split(',').map((x) => x.trim()).filter(Boolean).length;
                    const canReplyAll =
                      lastMsg && (count(lastMsg.cc) > 0 || count(lastMsg.to) > 1);
                    if (!canReplyAll) return null;
                    return (
                      <button
                        onClick={() => {
                          setReplyAll(true);
                          setShowReply(true);
                          setReplyResult(null);
                          setTimeout(() => replyEditorRef.current?.focus(), 100);
                        }}
                        className="btn-secondary text-xs py-2 px-4"
                      >
                        Reply all (with tracking)
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => openCompose('forward', {
                      ...threadMessages[threadMessages.length - 1],
                      subject: threadMessages[0]?.subject,
                    })}
                    className="text-xs text-gallery-mid hover:text-gallery-black transition-colors py-2 px-3 border border-gallery-border"
                  >
                    Forward
                  </button>
                </div>
              ) : (
                <div className="px-6 py-4">
                  {(() => {
                    const lastMsg = threadMessages[threadMessages.length - 1];
                    const { toEmail, cc } = computeReplyRecipients(lastMsg, senderEmail, replyAll);
                    return (
                      <div className="text-2xs text-gallery-mid mb-2">
                        <span className="uppercase tracking-wide">
                          {replyAll ? 'Reply all' : 'Reply'}
                        </span>
                        <span className="ml-2">To: {toEmail}</span>
                        {cc && <span className="ml-2">· Cc: {cc}</span>}
                      </div>
                    );
                  })()}
                  <div className="border border-gallery-border mb-3">
                    <FormatToolbar editorRef={replyEditorRef} />
                    <div
                      ref={replyEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none text-sm leading-relaxed text-gallery-black p-4 min-h-[120px] font-sans"
                      style={{ fontFamily: 'DM Sans, sans-serif' }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleReply}
                        disabled={sendingReply}
                        className="btn-primary text-xs py-2 px-6 disabled:opacity-40"
                      >
                        {sendingReply ? 'Sending...' : 'Send'}
                      </button>
                      <button
                        onClick={() => setShowReply(false)}
                        className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSig}
                        onChange={(e) => setIncludeSig(e.target.checked)}
                        className="accent-gallery-accent"
                      />
                      <span className="text-2xs text-gallery-mid">Signature</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
