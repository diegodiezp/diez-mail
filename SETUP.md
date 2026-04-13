# Diez Mail — Setup Guide

A self-hosted email campaign tool for Diez Gallery.
Sends personalized one-to-one emails via your Gmail, tracks opens with pixel tracking, and syncs everything to Airtable.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Diez Mail (Next.js on Vercel)                  │
│                                                 │
│  /campaigns/new    → Compose + select recipients│
│  /campaigns/[id]   → Campaign stats + timeline  │
│  /contacts         → Contact list + history     │
│                                                 │
│  /api/send         → Gmail API (send emails)    │
│  /api/track/[data] → Tracking pixel (log opens) │
│  /api/contacts     → Pull from Airtable         │
│  /api/campaigns    → Campaign CRUD + stats      │
└──────────┬────────────────┬─────────────────────┘
           │                │
     ┌─────▼─────┐   ┌─────▼─────┐
     │  Airtable  │   │  Gmail    │
     │  (data)    │   │  (send)   │
     └───────────┘   └───────────┘
```

---

## Step 1: Create Airtable Tables

You need two new tables in your base `appkTmFvjmDLOQS4p`:

### Table: "Campaigns"

| Field Name       | Type              | Notes                          |
|------------------|-------------------|--------------------------------|
| Name             | Single line text  | Primary field                  |
| Subject          | Single line text  |                                |
| Body Template    | Long text         | The email body with merge tags |
| Status           | Single select     | Options: Draft, Sending, Sent, Partial, Failed |
| Recipient Count  | Number (integer)  |                                |
| Sent Count       | Number (integer)  |                                |
| Failed Count     | Number (integer)  |                                |
| Unique Opens     | Number (integer)  | Updated by tracking            |
| Open Rate        | Formula           | `IF({Sent Count}>0, ROUND({Unique Opens}/{Sent Count}*100,1), 0)` |
| Created          | Date (ISO)        | Include time                   |

### Table: "Email Events"

| Field Name       | Type              | Notes                          |
|------------------|-------------------|--------------------------------|
| Tracking ID      | Single line text  | Primary field                  |
| Recipient Email  | Email             |                                |
| Recipient Name   | Single line text  |                                |
| Campaign         | Link to Campaigns |                                |
| Event Type       | Single select     | Options: Sent, Open, Failed    |
| Timestamp        | Date (ISO)        | Include time                   |
| Device           | Single select     | Options: Computer, Mobile, Tablet, Unknown |
| User Agent       | Long text         |                                |
| IP Address       | Single line text  |                                |
| Gmail Message ID | Single line text  |                                |
| Error Message    | Single line text  |                                |

---

## Step 2: Gmail API Setup

This is the most involved step. You need OAuth2 credentials so the app can send emails as diego@diez.gallery.

### 2a. Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create a new project (name: "Diez Mail")
3. Enable the **Gmail API**:
   - APIs & Services → Library → search "Gmail API" → Enable

### 2b. OAuth2 Credentials

1. APIs & Services → Credentials → Create Credentials → OAuth client ID
2. Application type: **Web application**
3. Authorized redirect URIs: add `https://developers.google.com/oauthplayground`
4. Save the **Client ID** and **Client Secret**

### 2c. Get Refresh Token

1. Go to https://developers.google.com/oauthplayground
2. Click the gear icon (top right) → check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. In the left panel, scroll to "Gmail API v1" → select `https://www.googleapis.com/auth/gmail.send`
5. Click "Authorize APIs" → sign in with diego@diez.gallery
6. Click "Exchange authorization code for tokens"
7. Copy the **Refresh Token**

### 2d. Important Note on Gmail Sending Limits

Gmail allows ~500 emails/day for workspace accounts (2,000 for paid Workspace).
With the 1.5 second delay between sends, a 200-person campaign takes about 5 minutes.
For larger campaigns, adjust the `delayMs` parameter in the send API.

---

## Step 3: Deploy to Vercel

### 3a. Push to GitHub

```bash
cd diez-mail
git init
git add .
git commit -m "Initial Diez Mail setup"
git remote add origin git@github.com:YOUR_USERNAME/diez-mail.git
git push -u origin main
```

### 3b. Import in Vercel

1. Go to https://vercel.com/new
2. Import the GitHub repository
3. Framework: Next.js (auto-detected)
4. Add environment variables (from .env.local.example):

```
AIRTABLE_PAT          = pat...
AIRTABLE_BASE_ID      = appkTmFvjmDLOQS4p
GMAIL_CLIENT_ID       = xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET   = GOCSPX-xxxxx
GMAIL_REFRESH_TOKEN   = 1//xxxxx
GMAIL_SENDER_EMAIL    = diego@diez.gallery
GMAIL_SENDER_NAME     = Diego / Diez Gallery
NEXT_PUBLIC_APP_URL   = https://diez-mail.vercel.app
TRACKING_SECRET       = (generate with: openssl rand -hex 16)
```

5. Deploy

### 3c. Custom Domain (optional)

You can assign `mail.diez.gallery` or similar via Vercel's domain settings + a CNAME in your DNS.

---

## Step 4: Test

1. Open the deployed app
2. Go to "New Campaign"
3. Select 1 test contact (yourself: diego@diez.gallery)
4. Write a test subject and body
5. Send
6. Check your inbox — the email should arrive from diego@diez.gallery
7. Open the email, then check the Campaign detail page — an "Open" event should appear within seconds

---

## How Tracking Works

1. When a campaign is sent, each email gets a unique 1x1 transparent pixel image embedded at the bottom
2. The pixel URL is: `https://your-app.vercel.app/api/track/ENCODED_DATA`
3. When a recipient opens the email, their email client loads the pixel
4. The server decodes the tracking data, identifies the recipient and campaign, and logs an "Open" event to the Email Events table in Airtable
5. The campaign dashboard aggregates these events: unique opens, total opens, open rate, per-recipient timeline

### Tracking Limitations

- **Image blocking**: Some email clients block images by default (Outlook desktop, some privacy-focused clients). These opens won't be tracked.
- **Apple Mail Privacy Protection**: iOS 15+ pre-fetches images, which can inflate open counts. This affects all email tracking tools, including Arternal.
- **No read duration**: Unlike Arternal, this system does not measure how long someone reads the email. This would require JavaScript, which email clients don't execute.
- **Multiple opens**: If someone opens the same email 5 times, you'll see 5 open events. The dashboard distinguishes "unique opens" (at least 1) from "total opens" (all events).

---

## Merge Tags Reference

| Tag              | Replaced with          | Example output     |
|------------------|------------------------|--------------------|
| `{{first_name}}` | Contact's Name field   | Antonia            |
| `{{surname}}`    | Contact's Surname      | Jansen             |
| `{{full_name}}`  | Name + Surname         | Antonia Jansen     |
| `{{email}}`      | Contact's email        | a@example.com      |
| `{{city}}`       | Contact's City field   | Amsterdam          |

---

## File Structure

```
diez-mail/
├── app/
│   ├── layout.js              # Root layout with nav
│   ├── globals.css             # Tailwind + custom styles
│   ├── page.js                 # Campaigns list (home)
│   ├── campaigns/
│   │   ├── new/page.js         # Campaign composer
│   │   └── [id]/page.js        # Campaign detail + tracking
│   ├── contacts/
│   │   └── page.js             # Contact list + timeline
│   └── api/
│       ├── send/route.js       # Send campaign endpoint
│       ├── track/[data]/route.js  # Tracking pixel
│       ├── campaigns/route.js  # Campaign data
│       └── contacts/
│           ├── route.js        # Contact list
│           └── events/route.js # Per-contact events
├── lib/
│   ├── airtable.js             # Airtable client
│   └── gmail.js                # Gmail API + tracking
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.local.example
└── SETUP.md                    # This file
```

---

## Future Enhancements

These can be added incrementally without changing the core architecture:

- **Click tracking**: Wrap links in a redirect through `/api/track/click/[data]` that logs the click and redirects to the actual URL
- **Artwork attachment**: Pull artwork images from Airtable/R2 and embed them in the email body
- **Template library**: Save and reuse email body templates
- **Scheduled sends**: Use Vercel Cron to send campaigns at a specific time
- **Campaign duplication**: Clone a previous campaign with a new recipient list
- **Unsubscribe handling**: Add an unsubscribe link and manage opt-outs in Airtable
