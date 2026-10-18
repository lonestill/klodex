import {
  loadConfig,
  saveTagflowAccount,
  listTagflowAccounts,
  switchTagflowAccount,
} from "./config.ts";

export const FIREBASE_KEY = "AIzaSyATZzX5Fw2HjR34VxB3UQWTmljprA5uXqE";
export const TAGFLOW_USAGE_URL = "https://adcode.bluethenics.com/v1/ai/tagflow/usage";

export type TagflowUsageData = {
  ok: boolean;
  email: string | null;
  todayTokens: number;
  dailyLimit: number;
  remainingTokens: number;
  percentRemaining: number;
  sessionRemainingCredits?: number;
  sessionLimitCredits?: number;
  resetsAt?: number;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function clearTagflowTokenCache(): void {
  tokenCache.clear();
}

/**
 * Sign in to Firebase Auth using email and password, returning the idToken.
 */
export async function resolveTagflowIdToken(email: string, password: string): Promise<string> {
  const cacheKey = `${email.trim().toLowerCase()}:${password.trim()}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: password.trim(), returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const fbMsg = json?.error?.message ?? "UNKNOWN_ERROR";
    if (fbMsg === "INVALID_LOGIN_CREDENTIALS") {
      throw new Error(`Ошибка авторизации ADCode: неверный пароль для «${email}».`);
    }
    if (fbMsg === "EMAIL_NOT_FOUND") {
      throw new Error(`Аккаунт «${email}» не зарегистрирован в ADCode.`);
    }
    if (fbMsg === "USER_DISABLED") {
      throw new Error(`Аккаунт «${email}» отключён в ADCode.`);
    }
    throw new Error(`Ошибка входа в ADCode (${fbMsg}).`);
  }

  if (!json.idToken) {
    throw new Error("Не получен токен авторизации ADCode");
  }

  try {
    const claims = JSON.parse(
      Buffer.from(json.idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as any;
    if (claims.email_verified !== true) {
      throw new Error(
        `Почта «${email}» в ADCode ещё не подтверждена.`,
      );
    }
  } catch (err: any) {
    if (err.message?.includes("ещё не подтверждена")) throw err;
  }

  // Cache token for 45 minutes (Firebase tokens are valid for 60 min)
  tokenCache.set(cacheKey, {
    token: json.idToken,
    expiresAt: Date.now() + 45 * 60 * 1000,
  });

  return json.idToken;
}

/**
 * Creates a brand new, fully verified ADCode account via mail.tm in ~3 seconds.
 */
export async function createTagflowAutoAccount(): Promise<{ email: string; password: string; idToken: string }> {
  // 1. Fetch available domain from mail.tm
  const domRes = await fetch("https://api.mail.tm/domains", { signal: AbortSignal.timeout(8000) });
  if (!domRes.ok) throw new Error("Не удалось получить домен временной почты (mail.tm)");
  const domData = (await domRes.json()) as any;
  const domains = domData?.["hydra:member"] || [];
  const activeDomain = domains.find((d: any) => d.isActive !== false)?.domain || domains[0]?.domain;
  if (!activeDomain) throw new Error("Нет доступных доменов временной почты");

  // 2. Generate random address and strong password
  const randSuffix = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const email = `kldx_${randSuffix}@${activeDomain}`.toLowerCase();
  const password = `Klodex_${Math.random().toString(36).slice(2, 10)}!9`;

  // 3. Create mailbox on mail.tm
  const accRes = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!accRes.ok) throw new Error("Ошибка создания ящика на mail.tm");

  // 4. Get mail.tm JWT token
  const tokenRes = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenRes.ok) throw new Error("Ошибка получения токена mail.tm");
  const tokenData = (await tokenRes.json()) as any;
  const mailTmToken = tokenData.token;
  if (!mailTmToken) throw new Error("Отсутствует токен доступа mail.tm");

  // 5. Register in ADCode Firebase Auth
  const fbRegRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const fbReg = (await fbRegRes.json()) as any;
  if (!fbRegRes.ok || !fbReg.idToken) {
    throw new Error(`Ошибка регистрации в ADCode: ${fbReg?.error?.message ?? "unknown"}`);
  }

  // 6. Send verification email
  await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: fbReg.idToken }),
      signal: AbortSignal.timeout(8000),
    },
  );

  // 7. Poll mail.tm for verification message
  let oobCode: string | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const msgListRes = await fetch("https://api.mail.tm/messages", {
        headers: { Authorization: `Bearer ${mailTmToken}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!msgListRes.ok) continue;
      const msgListData = (await msgListRes.json()) as any;
      const messages = msgListData?.["hydra:member"] || [];
      if (messages.length > 0) {
        const msgId = messages[0].id;
        const msgDetailRes = await fetch(`https://api.mail.tm/messages/${msgId}`, {
          headers: { Authorization: `Bearer ${mailTmToken}` },
          signal: AbortSignal.timeout(6000),
        });
        if (msgDetailRes.ok) {
          const msgDetail = (await msgDetailRes.json()) as any;
          const bodyText = (msgDetail.text || "") + " " + (Array.isArray(msgDetail.html) ? msgDetail.html.join(" ") : msgDetail.html || "");
          const match = bodyText.match(/oobCode=([a-zA-Z0-9_\-]+)/);
          if (match && match[1]) {
            oobCode = match[1];
            break;
          }
        }
      }
    } catch {}
  }

  // 8. Confirm verification
  if (oobCode) {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode }),
        signal: AbortSignal.timeout(8000),
      },
    );
  }

  // 9. Save to pool and set active
  saveTagflowAccount({ email, password });

  // 10. Return fresh idToken
  const idToken = await resolveTagflowIdToken(email, password);
  return { email, password, idToken };
}

/**
 * Transparently rotates to another account from pool or generates a brand new one.
 */
export async function rotateTagflowAccount(excludeEmail?: string): Promise<{ email: string; idToken: string }> {
  const pool = listTagflowAccounts();
  const current = excludeEmail?.toLowerCase() || pool.activeEmail?.toLowerCase() || null;

  // Try finding an alternative saved account
  const candidates = pool.accounts.filter(
    (a) => !current || a.email.toLowerCase() !== current,
  );

  for (const cand of candidates) {
    try {
      const cfg = loadConfig();
      const rawAccounts = (cfg.auth as Record<string, any>)?.tagflow_accounts || [];
      const match = rawAccounts.find((x: any) => x.email.toLowerCase() === cand.email.toLowerCase());
      if (match && match.password) {
        clearTagflowTokenCache();
        const token = await resolveTagflowIdToken(match.email, match.password);
        switchTagflowAccount(match.email);
        return { email: match.email, idToken: token };
      }
    } catch {}
  }

  // No alternative valid account found in pool — auto-generate a fresh one on the fly!
  clearTagflowTokenCache();
  const created = await createTagflowAutoAccount();
  return { email: created.email, idToken: created.idToken };
}

/**
 * Fetches token quota and usage statistics for the current active Tagflow account.
 */
export async function fetchTagflowUsage(): Promise<TagflowUsageData> {
  const cfg = loadConfig();
  const rawAuth = (cfg.auth as Record<string, any>) ?? {};
  const currentKey = typeof rawAuth.tagflow === "string" ? rawAuth.tagflow.trim() : "";
  if (!currentKey) {
    return {
      ok: false,
      email: null,
      todayTokens: 0,
      dailyLimit: 2_000_000,
      remainingTokens: 2_000_000,
      percentRemaining: 100,
    };
  }

  let idToken: string;
  let email: string | null = null;
  if (currentKey.includes(":") && !currentKey.startsWith("eyJ")) {
    const colonIdx = currentKey.indexOf(":");
    email = currentKey.slice(0, colonIdx).trim();
    const password = currentKey.slice(colonIdx + 1).trim();
    idToken = await resolveTagflowIdToken(email, password);
  } else {
    idToken = currentKey;
    try {
      const claims = JSON.parse(
        Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as any;
      email = claims.email || null;
    } catch {}
  }

  const res = await fetch(TAGFLOW_USAGE_URL, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`ADCode usage endpoint returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const today = data.today || data.usage || {};
  const todayTokens = (today.inputTokens || 0) + (today.outputTokens || 0);
  const dailyLimit = data.limits?.dailyTokens || 2_000_000;
  const remainingTokens = Math.max(0, dailyLimit - todayTokens);
  const percentRemaining = Math.round((remainingTokens / dailyLimit) * 100);

  return {
    ok: true,
    email,
    todayTokens,
    dailyLimit,
    remainingTokens,
    percentRemaining,
    sessionRemainingCredits: data.credits?.session?.remaining,
    sessionLimitCredits: data.credits?.session?.limit,
    resetsAt: data.resetsAt,
  };
}
