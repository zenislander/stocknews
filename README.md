# Daily Search Cron

This project includes a Vercel Cron Job that searches Google News RSS every day for:

`Arcturus Therapeutics cystic fibrosis 12-week CF Phase 2 study`

It emails `zenislander@gmail.com` with whether new links were found compared with the last stored search.

## Schedule

Vercel cron schedules run in UTC. The project schedules the same endpoint at `12:00 UTC` and `13:00 UTC`, then the function sends only when the current time is `8:00 AM America/New_York`.

This handles both daylight saving time and standard time when `ENFORCE_NY_8AM=true`.

## Required Environment Variables

Set these in Vercel Project Settings:

```txt
CRON_SECRET=replace-with-a-long-random-secret
ENFORCE_NY_8AM=true
```

For comparison with the last search, add an Upstash Redis database and set:

```txt
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

For email, choose one:

```txt
RESEND_API_KEY=...
EMAIL_FROM="Daily Search <you@yourdomain.com>"
```

or:

```txt
GMAIL_USER=zenislander@gmail.com
GMAIL_APP_PASSWORD=...
EMAIL_FROM=zenislander@gmail.com
```

Gmail SMTP requires a Google app password. Do not use your normal Gmail password.

## Endpoint

The cron endpoint is:

```txt
/api/cron/daily-search
```

It rejects requests unless the `Authorization` header matches:

```txt
Bearer $CRON_SECRET
```
