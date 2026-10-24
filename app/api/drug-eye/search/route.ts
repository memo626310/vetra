import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY WORKAROUND: the DrugEye HTTPS certificate is currently expired.
// Use plain HTTP only for public medicine-name lookup until DrugEye renews its certificate.
// Do not send patient/client data to this endpoint. Prefer HTTPS again once fixed.
const DRUG_EYE_URL =
  process.env.DRUG_EYE_URL?.trim() ||
  "http://drugeye.pharorg.com/drugeyeapp/android-search/drugeye-android-live-go.aspx";
const DRUG_EYE_ORIGIN = new URL(DRUG_EYE_URL).origin;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { expiresAt: number; results: DrugEyeResult[] }>();

type DrugEyeResult = {
  id: string;
  name: string;
  price: string | null;
  activeIngredient: string | null;
  category: string | null;
  manufacturer: string | null;
};

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const hexadecimal = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(number);
      } catch {
        return entity;
      }
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function htmlText(value: string): string {
  return decodeHtml(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function attribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(tag);
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function inputValue(html: string, wantedName: string): string | null {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const tag of inputs) {
    if ((attribute(tag, "name") ?? "").toLowerCase() === wantedName.toLowerCase()) {
      return attribute(tag, "value") ?? "";
    }
  }
  return null;
}

function getCookieHeader(headers: Headers): string {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof extended.getSetCookie === "function"
      ? extended.getSetCookie()
      : [headers.get("set-cookie") ?? ""];

  return setCookies
    .flatMap((header) => header.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g))
    .map((header) => header.trim().split(";")[0])
    .filter((cookie) => /^[^=;\s]+=/.test(cookie))
    .join("; ");
}

function getMainTable(html: string): string | null {
  const opening = /<table\b(?=[^>]*\bid\s*=\s*(?:"MyTable"|'MyTable'))[^>]*>/i.exec(html);
  if (!opening) return null;

  const start = opening.index;
  const tokenRegex = /<\/?table\b[^>]*>/gi;
  tokenRegex.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html))) {
    if (/^<\s*\/table/i.test(match[0])) {
      depth -= 1;
      if (depth === 0) return html.slice(start, tokenRegex.lastIndex);
    } else {
      depth += 1;
    }
  }
  return null;
}

type Cell = { tag: string; html: string };

function directRows(tableHtml: string): string[] {
  const outerOpen = /^<table\b[^>]*>/i.exec(tableHtml);
  if (!outerOpen) return [];
  const tokens = /<table\b[^>]*>|<\/table\s*>|<tr\b[^>]*>|<\/tr\s*>/gi;
  tokens.lastIndex = outerOpen[0].length;
  let tableDepth = 1;
  let rowStart = -1;
  let match: RegExpExecArray | null;
  const rows: string[] = [];

  while ((match = tokens.exec(tableHtml))) {
    const token = match[0];
    if (/^<\s*\/table/i.test(token)) {
      tableDepth -= 1;
      if (tableDepth === 0) break;
    } else if (/^<\s*table/i.test(token)) {
      tableDepth += 1;
    } else if (tableDepth === 1 && /^<\s*tr/i.test(token)) {
      if (rowStart === -1) rowStart = match.index;
    } else if (tableDepth === 1 && /^<\s*\/tr/i.test(token) && rowStart !== -1) {
      rows.push(tableHtml.slice(rowStart, tokens.lastIndex));
      rowStart = -1;
    }
  }
  return rows;
}

function directCells(rowHtml: string): Cell[] {
  const tokens = /<table\b[^>]*>|<\/table\s*>|<td\b[^>]*>|<\/td\s*>/gi;
  const cells: Cell[] = [];
  let nestedTableDepth = 0;
  let currentStart = -1;
  let currentTag = "";
  let match: RegExpExecArray | null;

  while ((match = tokens.exec(rowHtml))) {
    const token = match[0];
    if (/^<\s*table/i.test(token)) {
      nestedTableDepth += 1;
    } else if (/^<\s*\/table/i.test(token)) {
      nestedTableDepth = Math.max(0, nestedTableDepth - 1);
    } else if (nestedTableDepth === 0 && /^<\s*td\b/i.test(token)) {
      if (currentStart === -1) {
        currentStart = tokens.lastIndex;
        currentTag = token;
      }
    } else if (nestedTableDepth === 0 && /^<\s*\/td/i.test(token) && currentStart !== -1) {
      cells.push({ tag: currentTag, html: rowHtml.slice(currentStart, match.index) });
      currentStart = -1;
      currentTag = "";
    }
  }
  return cells;
}

function parseDrugEyeResults(html: string): DrugEyeResult[] {
  const table = getMainTable(html);
  if (!table) return [];

  const rows = directRows(table);
  const results: DrugEyeResult[] = [];
  let current: DrugEyeResult | null = null;
  let productCounter = 0;

  for (const row of rows) {
    const cells = directCells(row);
    if (!cells.length) continue;

    const firstClass = attribute(cells[0].tag, "class") ?? "";
    const firstText = htmlText(cells[0].html);
    if (
      cells.length >= 2 &&
      firstText &&
      (/\bmitrfont\b/i.test(firstClass) || /color\s*:\s*blue/i.test(attribute(cells[0].tag, "style") ?? ""))
    ) {
      productCounter += 1;
      current = {
        id: `${firstText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drug"}-${productCounter}`,
        name: firstText,
        price: htmlText(cells[1]?.html) || null,
        activeIngredient: null,
        category: null,
        manufacturer: null,
      };
      results.push(current);
      continue;
    }

    if (!current || cells.length !== 1) continue;
    const className = attribute(cells[0].tag, "class") ?? "";
    if (/options-u/i.test(className)) continue;

    const value = htmlText(cells[0].html);
    if (!value) continue;

    const style = attribute(cells[0].tag, "style") ?? "";
    if (/color\s*:\s*black/i.test(style)) current.activeIngredient ??= value;
    else if (/color\s*:\s*green/i.test(style)) current.category ??= value;
    else if (/color\s*:\s*blueviolet/i.test(style)) current.manufacturer ??= value;
  }

  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.name}|${result.price ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSearchResults(query: string): Promise<DrugEyeResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const landing = await fetch(DRUG_EYE_URL, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    if (!landing.ok) throw new Error(`DrugEye page returned ${landing.status}`);

    const landingHtml = await landing.text();
    const viewState = inputValue(landingHtml, "__VIEWSTATE");
    const eventValidation = inputValue(landingHtml, "__EVENTVALIDATION");
    const viewStateGenerator = inputValue(landingHtml, "__VIEWSTATEGENERATOR");
    if (viewState === null || eventValidation === null) {
      throw new Error("DrugEye form tokens were not found in the initial page.");
    }

    const cookie = getCookieHeader(landing.headers);
    const body = new URLSearchParams();
    body.set("__VIEWSTATE", viewState);
    if (viewStateGenerator !== null) body.set("__VIEWSTATEGENERATOR", viewStateGenerator);
    body.set("__EVENTVALIDATION", eventValidation);
    body.set("ttt", query);
    body.set("BtnHelp", "wait...");
    body.set("TttHelper", inputValue(landingHtml, "TttHelper") ?? "نتيجة البحث بالاسم التجاري بالطريقة التقليدية");
    body.set("Passgenericname", inputValue(landingHtml, "Passgenericname") ?? "");

    const post = await fetch(DRUG_EYE_URL, {
      method: "POST",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: DRUG_EYE_ORIGIN,
        Referer: DRUG_EYE_URL,
        "User-Agent": USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body.toString(),
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    if (!post.ok) throw new Error(`DrugEye search returned ${post.status}`);

    const responseHtml = await post.text();
    let results = parseDrugEyeResults(responseHtml);

    // Some ASP.NET page states use the primary Search button instead of the H (traditional-name) button.
    // Retry that same form once only when the first mode does not yield product rows.
    if (!results.length) {
      body.delete("BtnHelp");
      body.set("b1", "wait...");
      const fallback = await fetch(DRUG_EYE_URL, {
        method: "POST",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: DRUG_EYE_ORIGIN,
          Referer: DRUG_EYE_URL,
          "User-Agent": USER_AGENT,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body.toString(),
        cache: "no-store",
        signal: controller.signal,
        redirect: "follow",
      });
      if (fallback.ok) results = parseDrugEyeResults(await fallback.text());
    }

    return results.slice(0, 25);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 2) {
    return NextResponse.json({ query, results: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: "Search term is too long." }, { status: 400 });
  }

  const cacheKey = query.toLocaleLowerCase();
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { query, results: cached.results, cached: true },
      { headers: { "Cache-Control": "private, max-age=5" } },
    );
  }

  try {
    const results = await fetchSearchResults(query);
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, results });
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(
      { query, results, cached: false },
      { headers: { "Cache-Control": "private, max-age=5" } },
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const root = error instanceof Error ? error : new Error(String(error));
    const cause = (root as Error & { cause?: unknown }).cause;
    const causeText = cause instanceof Error
      ? `${cause.name}: ${cause.message}${"code" in cause && typeof (cause as Error & { code?: unknown }).code === "string" ? ` [${(cause as Error & { code: string }).code}]` : ""}`
      : cause == null ? "" : String(cause);
    const diagnostic = `${root.name}: ${root.message}${causeText ? ` | cause: ${causeText}` : ""}`;
    console.error("[DrugEye search] upstream request failed:", diagnostic);

    return NextResponse.json(
      {
        query,
        results: [],
        error: isTimeout
          ? "DrugEye took too long to respond. Try again."
          : "Could not search DrugEye right now. Local VETRA medication search is still available.",
        // Only expose the upstream exception in local development, never production.
        ...(process.env.NODE_ENV !== "production" ? { diagnostic } : {}),
      },
      { status: isTimeout ? 504 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
