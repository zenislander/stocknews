const SEARCH_QUERY = "Arcturus Therapeutics cystic fibrosis 12-week CF Phase 2 study";
const RECIPIENT_EMAIL = "zenislander@gmail.com";
const TIME_ZONE = "America/New_York";
const RESULT_LIMIT = 10;
const STATE_KEY = "daily-search:arcturus-cf-phase-2:last-urls";

function assertCronAuthorized(request) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    throw Object.assign(new Error("CRON_SECRET is not configured."), { statusCode: 500 });
  }

  if (request.headers.authorization !== `Bearer ${expected}`) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

function shouldRunNow() {
  if (process.env.ENFORCE_NY_8AM !== "true") {
    return true;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  return hour === 8;
}

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function getTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtml(match[1]).trim() : "";
}

function normalizeGoogleNewsUrl(url) {
  try {
    const parsed = new URL(url);
    const directUrl = parsed.searchParams.get("url");
    return directUrl || url;
  } catch {
    return url;
  }
}

async function fetchSearchResults() {
  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", SEARCH_QUERY);
  rssUrl.searchParams.set("hl", "en-US");
  rssUrl.searchParams.set("gl", "US");
  rssUrl.searchParams.set("ceid", "US:en");

  const response = await fetch(rssUrl, {
    headers: {
      "User-Agent": "daily-search-cron/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Search request failed with ${response.status}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, RESULT_LIMIT);

  return items.map(([, item]) => ({
    title: stripTags(getTag(item, "title")),
    link: normalizeGoogleNewsUrl(getTag(item, "link")),
    publishedAt: stripTags(getTag(item, "pubDate")),
    source: stripTags(getTag(item, "source")),
    snippet: stripTags(getTag(item, "description"))
  }));
}

async function redisRequest(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Redis request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.result;
}

async function readPreviousUrls() {
  const previous = await redisRequest(["GET", STATE_KEY]);
  const storageConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (!previous) {
    return { urls: [], storageConfigured };
  }

  try {
    return { urls: JSON.parse(previous), storageConfigured: true };
  } catch {
    return { urls: [], storageConfigured };
  }
}

async function writeCurrentUrls(urls) {
  await redisRequest(["SET", STATE_KEY, JSON.stringify(urls)]);
}

function renderEmail({ results, newResults, storageConfigured }) {
  const newSearchFound = storageConfigured ? newResults.length > 0 : "Unknown";
  const resultLines = (newResults.length ? newResults : results)
    .map((result, index) => {
      const source = result.source ? ` (${result.source})` : "";
      const publishedAt = result.publishedAt ? `\nPublished: ${result.publishedAt}` : "";
      const snippet = result.snippet ? `\n${result.snippet}` : "";

      return `${index + 1}. ${result.title}${source}\n${result.link}${publishedAt}${snippet}`;
    })
    .join("\n\n");

  const storageNote = storageConfigured
    ? ""
    : "\n\nComparison note: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not configured, so this run could not compare against the previous search.";

  return {
    subject: `Daily search: Arcturus CF Phase 2 - New search found: ${newSearchFound}`,
    text: `Search topic: ${SEARCH_QUERY}
New search found: ${newSearchFound}

${newResults.length ? "New links:" : "Current links:"}

${resultLines || "No results found."}${storageNote}`
  };
}

async function sendWithResend({ subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Daily Search <onboarding@resend.dev>",
      to: [RECIPIENT_EMAIL],
      subject,
      text
    })
  });

  if (!response.ok) {
    throw new Error(`Resend email failed with ${response.status}: ${await response.text()}`);
  }

  return true;
}

async function sendWithGmailSmtp({ subject, text }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return false;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
    to: RECIPIENT_EMAIL,
    subject,
    text
  });

  return true;
}

async function sendEmail(email) {
  if (await sendWithResend(email)) {
    return "resend";
  }

  if (await sendWithGmailSmtp(email)) {
    return "gmail-smtp";
  }

  throw new Error(
    "No email provider configured. Set RESEND_API_KEY, or set GMAIL_USER and GMAIL_APP_PASSWORD."
  );
}

export default async function handler(request, response) {
  try {
    assertCronAuthorized(request);

    if (!shouldRunNow()) {
      return response.status(200).json({ ok: true, skipped: "Not 8 AM in America/New_York." });
    }

    const results = await fetchSearchResults();
    const currentUrls = results.map((result) => result.link);
    const { urls: previousUrls, storageConfigured } = await readPreviousUrls();
    const previousUrlSet = new Set(previousUrls);
    const newResults = storageConfigured
      ? results.filter((result) => !previousUrlSet.has(result.link))
      : results;
    const email = renderEmail({ results, newResults, storageConfigured });
    const emailProvider = await sendEmail(email);

    await writeCurrentUrls(currentUrls);

    return response.status(200).json({
      ok: true,
      emailProvider,
      resultCount: results.length,
      newSearchFound: storageConfigured ? newResults.length > 0 : null
    });
  } catch (error) {
    return response.status(error.statusCode || 500).json({
      ok: false,
      error: error.message
    });
  }
}
