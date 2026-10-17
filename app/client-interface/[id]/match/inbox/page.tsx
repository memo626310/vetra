"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

type Message = { id: string; sender_key: string; body: string; created_at: string; isMine: boolean };
type Thread = { id: string; listingId: string; type: string; status: string; side: string; listing: { name: string; species: string; city: string } | null; messages: Message[] };

export default function MatchInboxPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unread, setUnread] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await vetraCore.auth.getSession();
      const session = data.session;
      let authToken = "";
      let legacy: Record<string, string> = {};
      if (session?.user.email_confirmed_at) { authToken = session.access_token; setToken(authToken); }
      else {
        const clientCode = window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code") || "";
        const phone = window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone") || "";
        const clientId = window.localStorage.getItem("vetra-client-id") || window.sessionStorage.getItem("vetra-client-id") || "";
        if (clientId === id && clientCode && phone) { legacy = { clientCode, phone }; setOwner(legacy); }
      }
      const response = await fetch("/api/match/inbox", { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(legacy), cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحميل صندوق التواصل.");
      setThreads(result.threads || []); setError("");
      const notificationResponse = await fetch("/api/match/notifications", { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(legacy), cache: "no-store" });
      const notificationResult = await notificationResponse.json(); if (notificationResponse.ok) setUnread(notificationResult.unread || 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل صندوق التواصل."); }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function send(event: FormEvent<HTMLFormElement>, threadId: string) {
    event.preventDefault(); const message = (drafts[threadId] || "").trim(); if (!message) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/match/interactions", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "message", threadId, message, ...owner }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر إرسال الرسالة.");
      setDrafts((old) => ({ ...old, [threadId]: "" })); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة."); }
    finally { setBusy(false); }
  }

  async function threadAction(threadId: string, action: "block-thread" | "report-thread") {
    const reason = action === "report-thread" ? window.prompt("اكتب سبب البلاغ")?.trim() || "" : "";
    if (action === "report-thread" && reason.length < 5) return;
    if (action === "block-thread" && !window.confirm("حظر الطرف الآخر وإغلاق المحادثة؟")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/match/interactions", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, threadId, reason, ...owner }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الطلب."); }
    finally { setBusy(false); }
  }
  async function markRead() {
    const { data } = await vetraCore.auth.getSession();
    const authToken = data.session?.access_token || token;
    await fetch("/api/match/notifications", { method: "PATCH", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(owner) });
    setUnread(0);
  }

  return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:p-8"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between"><Link href={`/client-interface/${id}/match`} className="text-sm font-bold text-[#138780]">← العودة إلى VETRA Tinder</Link><div className="flex items-center gap-2"><span className="rounded-full bg-[#E6F6F0] px-3 py-2 text-xs font-black text-[#138780]">إشعارات غير مقروءة: {unread}</span>{unread > 0 && <button onClick={() => void markRead()} className="min-h-10 rounded-xl border border-[#E7EAE6] bg-white px-3 text-xs font-bold">تعليم كمقروء</button>}<button onClick={() => void refresh()} className="min-h-10 rounded-xl border border-[#E7EAE6] bg-white px-4 text-sm font-bold">تحديث</button></div></header><h1 className="mt-5 text-3xl font-black">طلبات التواصل والمحادثات</h1><p className="mt-2 text-sm text-[#657585]">لا نعرض البريد أو الهاتف أو عنوان السكن. شارك بيانات التواصل خارج التطبيق بحذر.</p>{error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351]">{error}</p>}
    <div className="mt-6 space-y-4">{threads.length === 0 ? <div className="rounded-2xl border border-dashed border-[#BFE8DB] bg-white p-8 text-center text-sm text-[#657585]">لا توجد طلبات أو محادثات بعد.</div> : threads.map((thread) => <section key={thread.id} className="rounded-2xl border border-[#E7EAE6] bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black">{thread.listing?.name || "ملف حيوان"} · {thread.type === "adoption" ? "طلب تبنٍ" : "تزاوج مسؤول"}</h2><p className="mt-1 text-xs text-[#657585]">{thread.listing?.city || ""} · {thread.side === "owner" ? "أنت صاحب الملف" : "طلبك"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${thread.status === "open" ? "bg-[#E6F6F0] text-[#138780]" : "bg-[#FAF8F4] text-[#657585]"}`}>{thread.status === "open" ? "مفتوحة" : "مغلقة"}</span></div><div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-xl bg-[#FAF8F4] p-3">{thread.messages.length === 0 ? <p className="text-xs text-[#657585]">تم فتح طلب التواصل. اكتب رسالة لبدء المحادثة.</p> : thread.messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl p-3 text-sm leading-6 ${message.isMine ? "ms-auto bg-[#E6F6F0]" : "bg-white"}`}><p>{message.body}</p><time className="mt-1 block text-[10px] text-[#657585]">{new Date(message.created_at).toLocaleString("ar-EG")}</time></div>)}</div>{thread.status === "open" && <><form onSubmit={(event) => void send(event, thread.id)} className="mt-3 flex gap-2"><input maxLength={2000} value={drafts[thread.id] || ""} onChange={(event) => setDrafts((old) => ({ ...old, [thread.id]: event.target.value }))} placeholder="اكتب رسالة…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3 text-sm"/><button disabled={busy} className="rounded-xl bg-[#138780] px-4 text-sm font-black text-white disabled:opacity-50">إرسال</button></form><div className="mt-3 flex gap-4 text-xs font-bold text-[#657585]"><button onClick={() => void threadAction(thread.id, "report-thread")} className="underline">الإبلاغ عن المحادثة</button><button onClick={() => void threadAction(thread.id, "block-thread")} className="underline">حظر الطرف الآخر</button></div></>}</section>)}</div>
  </div></main>;
}
