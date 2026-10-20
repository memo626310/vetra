import { getCoreAdminClient, PushSetupError } from "@/lib/push-server";
import { getListingTable, matchError, resolveMatchActor } from "@/lib/match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function notify(admin: ReturnType<typeof getCoreAdminClient>, recipient: string, actor: string, eventType: string, threadId: string) {
  const { data, error } = await admin.from("vetra_match_notifications").select("id").eq("recipient_key", recipient).eq("actor_key", actor).eq("event_type", eventType).eq("thread_id", threadId).limit(1);
  if (error) throw error;
  if (!data?.length) {
    const { error: insertError } = await admin.from("vetra_match_notifications").insert({ recipient_key: recipient, actor_key: actor, event_type: eventType, thread_id: threadId });
    if (insertError) throw insertError;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    const admin = getCoreAdminClient();
    const action = body.action;

    if (action === "block-thread" || action === "report-thread") {
      const threadId = typeof body.threadId === "string" ? body.threadId : "";
      const { data: thread, error } = await admin.from("vetra_match_threads").select("id,listing_type,listing_id,requester_key,listing_owner_key").eq("id", threadId).maybeSingle();
      if (error) throw error;
      if (!thread || ![thread.requester_key, thread.listing_owner_key].includes(actor.key)) throw new PushSetupError("لا يمكنك اتخاذ إجراء على هذه المحادثة.", 403);
      const other = thread.requester_key === actor.key ? thread.listing_owner_key : thread.requester_key;
      if (action === "block-thread") {
        const { error: blockError } = await admin.from("vetra_match_blocks").upsert({ owner_key: actor.key, blocked_owner_key: other }, { onConflict: "owner_key,blocked_owner_key" });
        if (blockError) throw blockError;
        const { error: closeError } = await admin.from("vetra_match_threads").update({ status: "blocked" }).eq("id", thread.id);
        if (closeError) throw closeError;
        return Response.json({ blocked: true }, { status: 201 });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
      if (reason.length < 5) return Response.json({ error: "اكتب سبب البلاغ (٥ أحرف على الأقل)." }, { status: 400 });
      const { error: reportError } = await admin.from("vetra_match_reports").upsert({ reporter_key: actor.key, target_listing_id: thread.listing_id, listing_type: thread.listing_type, reason }, { onConflict: "reporter_key,target_listing_id" });
      if (reportError) throw reportError;
      return Response.json({ reported: true }, { status: 201 });
    }

    if (action === "message") {
      const threadId = typeof body.threadId === "string" ? body.threadId : "";
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!threadId || message.length < 1 || message.length > 2000) return Response.json({ error: "اكتب رسالة من حرف إلى ٢٠٠٠ حرف." }, { status: 400 });
      const { data: thread, error: threadError } = await admin.from("vetra_match_threads").select("id,requester_key,listing_owner_key,status").eq("id", threadId).maybeSingle();
      if (threadError) throw threadError;
      if (!thread || ![thread.requester_key, thread.listing_owner_key].includes(actor.key)) throw new PushSetupError("لا يمكنك الوصول إلى هذه المحادثة.", 403);
      if (thread.status !== "open") throw new PushSetupError("المحادثة مغلقة.", 409);
      const [first, second] = [thread.requester_key, thread.listing_owner_key];
      const { data: block } = await admin.from("vetra_match_blocks").select("owner_key").or(`and(owner_key.eq.${first},blocked_owner_key.eq.${second}),and(owner_key.eq.${second},blocked_owner_key.eq.${first})`).limit(1).maybeSingle();
      if (block) throw new PushSetupError("تعذر إرسال الرسالة بسبب إعدادات الخصوصية.", 403);
      const { data, error } = await admin.from("vetra_match_messages").insert({ thread_id: threadId, sender_key: actor.key, body: message }).select("id,thread_id,sender_key,body,created_at").single();
      if (error) throw error;
      await admin.from("vetra_match_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      const recipient = thread.requester_key === actor.key ? thread.listing_owner_key : thread.requester_key;
      await admin.from("vetra_match_notifications").insert({ recipient_key: recipient, actor_key: actor.key, event_type: "message", thread_id: threadId });
      return Response.json({ message: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    const type = body.type;
    const table = getListingTable(type);
    if (!listingId) return Response.json({ error: "الملف المطلوب غير موجود." }, { status: 400 });
    const { data: listing, error: listingError } = await admin.from(table).select("id,name,species,gender,status,is_demo,owner_key").eq("id", listingId).maybeSingle();
    if (listingError) throw listingError;
    if (!listing || listing.status !== "published") throw new PushSetupError("الملف لم يعد متاحًا.", 404);
    if (!listing.owner_key && action === "pass") return Response.json({ accepted: true, demo: true }, { status: 200 });
    if (!listing.owner_key) throw new PushSetupError("هذا الملف التجريبي لا يقبل تواصلًا حقيقيًا.", 409);
    if (listing.owner_key === actor.key) throw new PushSetupError("لا يمكنك التفاعل مع ملفك.", 400);

    if (action === "report") {
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
      if (reason.length < 5) return Response.json({ error: "اكتب سبب البلاغ (٥ أحرف على الأقل)." }, { status: 400 });
      const { error } = await admin.from("vetra_match_reports").upsert({ reporter_key: actor.key, target_listing_id: listingId, listing_type: type, reason, status: "open" }, { onConflict: "reporter_key,target_listing_id" });
      if (error) throw error;
      return Response.json({ reported: true }, { status: 201 });
    }
    if (action === "block") {
      const { error } = await admin.from("vetra_match_blocks").upsert({ owner_key: actor.key, blocked_owner_key: listing.owner_key }, { onConflict: "owner_key,blocked_owner_key" });
      if (error) throw error;
      await admin.from("vetra_match_threads").update({ status: "blocked" }).or(`and(requester_key.eq.${actor.key},listing_owner_key.eq.${listing.owner_key}),and(requester_key.eq.${listing.owner_key},listing_owner_key.eq.${actor.key})`).eq("status", "open");
      return Response.json({ blocked: true }, { status: 201 });
    }
    if (action !== "like" && action !== "pass") return Response.json({ error: "الإجراء غير مدعوم." }, { status: 400 });
    const [{ data: actorBlock, error: actorBlockError }, { data: targetBlock, error: targetBlockError }] = await Promise.all([
      admin.from("vetra_match_blocks").select("owner_key").eq("owner_key", actor.key).eq("blocked_owner_key", listing.owner_key).maybeSingle(),
      admin.from("vetra_match_blocks").select("owner_key").eq("owner_key", listing.owner_key).eq("blocked_owner_key", actor.key).maybeSingle(),
    ]);
    if (actorBlockError) throw actorBlockError;
    if (targetBlockError) throw targetBlockError;
    if (actorBlock || targetBlock) throw new PushSetupError("لا يمكن التفاعل مع هذا الملف بسبب إعدادات الحظر.", 403);
    if (action === "like" && type === "breeding") {
      const oppositeGender = listing.gender === "female" ? "male" : listing.gender === "male" ? "female" : "";
      if (!oppositeGender) throw new PushSetupError("يلزم تسجيل جنس الحيوان ومراجعته قبل طلب التزاوج.", 409);
      const eligible = admin.from("vetra_breeding_listings").select("id,gender,owner_key")
        .eq("owner_key", actor.key).eq("species", listing.species).eq("status", "published")
        .eq("health_review_status", "approved").eq("reproductive_review_status", "approved").eq("welfare_review_status", "approved")
        .eq("gender", oppositeGender).eq("is_demo", false).limit(1);
      const { data: owned, error: ownedError } = await eligible;
      if (ownedError) throw ownedError;
      if (!owned?.length) throw new PushSetupError("لا يمكن إرسال اهتمام بالتزاوج قبل نشر حيوانك وموافقة الطبيب على فحص الصحة والتكاثر والرفق بالحيوان للنوع نفسه والجنس المتوافق.", 409);
    }

    const storedAction = type === "adoption" && action === "like" ? "inquiry" : action;
    const { error: saveError } = await admin.from("vetra_match_interactions").upsert({ actor_key: actor.key, target_listing_id: listingId, listing_type: type, action: storedAction }, { onConflict: "actor_key,target_listing_id" });
    if (saveError) throw saveError;

    if (storedAction === "inquiry") {
      const { data: thread, error } = await admin.from("vetra_match_threads").upsert({ listing_type: type, listing_id: listingId, requester_key: actor.key, listing_owner_key: listing.owner_key }, { onConflict: "listing_id,requester_key" }).select("id").single();
      if (error) throw error;
      await notify(admin, listing.owner_key, actor.key, "adoption_inquiry", thread.id);
      return Response.json({ accepted: true, inquiry: true, message: "تم إرسال طلب التواصل لصاحب الملف." }, { status: 201 });
    }

    let matched = false;
    if (storedAction === "like") {
      const ownerTable = table;
      const { data: ownListings, error: ownError } = await admin.from(ownerTable).select("id,gender,species")
        .eq("owner_key", actor.key).eq("status", "published").eq("is_demo", false).eq("species", listing.species);
      if (ownError) throw ownError;
      for (const own of ownListings || []) {
        const { data: reciprocal, error: reciprocalError } = await admin.from("vetra_match_interactions").select("id")
          .eq("actor_key", listing.owner_key).eq("target_listing_id", own.id).eq("action", "like").maybeSingle();
        if (reciprocalError) throw reciprocalError;
        if (reciprocal) {
          matched = true;
          const { data: thread, error } = await admin.from("vetra_match_threads").upsert({ listing_type: type, listing_id: own.id, requester_key: listing.owner_key, listing_owner_key: actor.key }, { onConflict: "listing_id,requester_key" }).select("id").single();
          if (error) throw error;
          await notify(admin, listing.owner_key, actor.key, "breeding_match", thread.id);
          await notify(admin, actor.key, listing.owner_key, "breeding_match", thread.id);
        }
      }
    }
    return Response.json({ accepted: true, matched, message: matched ? "حصل توافق متبادل. افتح صندوق التواصل." : "تم حفظ اهتمامك." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return matchError(error); }
}
