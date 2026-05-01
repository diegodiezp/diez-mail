'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// HTML signature for replies (same as campaigns)
const SIGNATURE_HTML = [
  `<div>Diego Diez</div>`,
  `<div>Director of <a href="https://diez.gallery" style="color:#1a1a1a;text-decoration:underline;">diez</a></div>`,
  `<div>+31 633261845</div>`,
  `<div>+34 648872907</div>`,
  `<div><a href="https://instagram.com/diez.gallery" style="color:#1a1a1a;text-decoration:underline;">Instagram</a></div>`,
].join('');

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
        <span
          key={t}
          className={`text-2xs px-1.5 py-0.5 ${TYPE_COLORS[t] || 'bg-gray-50 text-gallery-mid'}`}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

export default function MailPage() {
  // Thread list state
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [label, setLabel] = useState('INBOX');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Selected thread state
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Reply state
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyResult, setReplyResult] = useState(null);
  const [includeSig, setIncludeSig] = useState(true);
  const replyEditorRef = useRef(null);

  // Fetch threads
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

      if (append) {
        setThreads((prev) => [...prev, ...(data.threads || [])]);
      } else {
        setThreads(data.threads || []);
      }
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQuery, label]);

  // Initial load + when label/search changes
  useEffect(() => {
    const debounce = setTimeout(() => fetchThreads(), 300);
    return () => clearTimeout(debounce);
  }, [fetchThreads]);

  // Load thread detail
  useEffect(() => {
    if (!selectedThreadId) return;
    setLoadingThread(true);
    setShowReply(false);
    setReplyResult(null);

    fetch(`/api/mail/threads/${selectedThreadId}`)
      .then((r) => r.json())
      .then((data) => {
        setThreadMessages(data.messages || []);
        setLoadingThread(false);
      })
      .catch(() => setLoadingThread(false));
  }, [selectedThreadId]);

  // Send reply
  const handleReply = async () => {
    if (!replyEditorRef.current) return;
    const html = replyEditorRef.current.innerHTML;
    if (!html.trim()) return;

    const lastMsg = threadMessages[threadMessages.length - 1];
    if (!lastMsg) return;

    // Determine who we're replying to
    const senderEmail = process.env.NEXT_PUBLIC_SENDER_EMAIL || 'diego@diez.gallery';
    const replyTo =
      lastMsg.from.email?.toLowerCase() === senderEmail.toLowerCase()
        ? lastMsg.to.split(',')[0].trim()
        : lastMsg.from.email;

    // Parse just the email from "Name <email>" format
    const emailMatch = replyTo.match(/<(.+?)>/);
    const toEmail = emailMatch ? emailMatch[1] : replyTo;

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
          subject: lastMsg.subject || '(no subject)',
          htmlBody: fullBody,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setReplyResult({ success: true });
        setShowReply(false);
        // Reload thread to see the sent reply
        setTimeout(() => {
          fetch(`/api/mail/threads/${selectedThreadId}`)
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

  const senderEmail = 'diego@diez.gallery';

  return (
    <div
      className="flex"
      style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', margin: '-24px -24px 0' }}
    >
      {/* ── LEFT: Thread list ──────────────────────────────────────────── */}
      <div
        className="flex flex-col border-r border-gallery-border bg-gallery-white flex-shrink-0"
        style={{ width: 360 }}
      >
        {/* Search + label tabs */}
        <div className="px-4 py-3 border-b border-gallery-border">
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
                onClick={() => {
                  setLabel(l);
                  setSelectedThreadId(null);
                }}
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
                        <span
                          className={`text-xs truncate ${
                            t.isUnread ? 'font-semibold text-gallery-black' : 'font-medium text-gallery-dark'
                          }`}
                        >
                          {displayName}
                        </span>
                        {t.messageCount > 1 && (
                          <span className="text-2xs text-gallery-light flex-shrink-0">
                            ({t.messageCount})
                          </span>
                        )}
                        <ContactBadge contact={t.contact} />
                      </div>
                      <span className="text-2xs text-gallery-light flex-shrink-0">
                        {formatDate(t.date)}
                      </span>
                    </div>
                    <div
                      className={`text-2xs truncate ${
                        t.isUnread ? 'font-medium text-gallery-dark' : 'text-gallery-mid'
                      }`}
                    >
                      {t.subject}
                    </div>
                    <div className="text-2xs text-gallery-light truncate mt-0.5">
                      {t.snippet}
                    </div>
                  </button>
                );
              })}

              {/* Load more */}
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

      {/* ── RIGHT: Thread detail ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gallery-white">
        {!selectedThreadId ? (
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
            <div className="px-6 py-4 border-b border-gallery-border">
              <h2 className="text-lg font-medium text-gallery-black">
                {threadMessages[0]?.subject || '(no subject)'}
              </h2>
              <div className="text-2xs text-gallery-mid mt-1">
                {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {threadMessages.map((msg, idx) => {
                const isMe = msg.from.email?.toLowerCase() === senderEmail.toLowerCase();
                return (
                  <div
                    key={msg.id}
                    className="px-6 py-5 border-b border-gallery-border"
                  >
                    {/* Message header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                            isMe
                              ? 'bg-gallery-accent text-white'
                              : 'bg-gallery-bg text-gallery-mid border border-gallery-border'
                          }`}
                        >
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
                          </div>
                        </div>
                      </div>
                      <span className="text-2xs text-gallery-light flex-shrink-0">
                        {formatFullDate(msg.date)}
                      </span>
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
                  </div>
                );
              })}
            </div>

            {/* Reply area */}
            <div className="border-t border-gallery-border">
              {replyResult?.success && (
                <div className="px-6 py-2 bg-green-50 text-sm text-gallery-success">
                  Reply sent with tracking
                </div>
              )}
              {replyResult && !replyResult.success && (
                <div className="px-6 py-2 bg-red-50 text-sm text-red-700">
                  Error: {replyResult.error}
                </div>
              )}

              {!showReply ? (
                <div className="px-6 py-3">
                  <button
                    onClick={() => {
                      setShowReply(true);
                      setReplyResult(null);
                      setTimeout(() => replyEditorRef.current?.focus(), 100);
                    }}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Reply (with tracking)
                  </button>
                </div>
              ) : (
                <div className="px-6 py-4">
                  <div className="border border-gallery-border mb-3">
                    <div
                      ref={replyEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none text-sm leading-relaxed text-gallery-black p-4 min-h-[120px] font-sans"
                      style={{ fontFamily: 'DM Sans, sans-serif' }}
                      onInput={(e) => setReplyBody(e.currentTarget.innerHTML)}
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
