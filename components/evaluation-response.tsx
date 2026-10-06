"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Reply, Save, X } from "lucide-react";
import { MAX_RESPONSE_LENGTH, type EvaluationResponseView } from "@/lib/evaluation-response";

export default function EvaluationResponse({ evaluationId, response, canRespond = false, onSaved }: {
  evaluationId: string; response?: EvaluationResponseView | null; canRespond?: boolean;
  onSaved?: (response: EvaluationResponseView) => void;
}) {
  const router = useRouter();
  const editorId = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(response?.text || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<EvaluationResponseView | null>(null);
  const current = response && (!saved || response.updatedAt >= saved.updatedAt) ? response : saved;

  async function save() {
    setSaving(true); setError("");
    try {
      const result = await fetch(`/api/evaluations/${evaluationId}/response`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Ответ не сохранён.");
      setSaved(data.response); setEditing(false); onSaved?.(data.response); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить ответ."); }
    finally { setSaving(false); }
  }

  if (!current && !canRespond) return null;
  return (
    <div className="mt-3">
      {current && !editing ? (
        <div className="border-l-2 border-slate-300 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold text-slate-600">Ответ подразделения</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink">{current.text}</p>
          <div className="mt-1 text-xs text-muted">{current.authorName} · {new Date(current.updatedAt).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      ) : null}
      {canRespond && !editing ? (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${current ? "mt-2" : "border-t border-line pt-3"}`}>
          {!current ? <span className="text-sm font-medium text-amber-800">Без ответа</span> : null}
          <button type="button" className={`focus-ring inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${current ? "border border-line text-slate-600 hover:bg-slate-100" : "bg-brand text-white hover:bg-brand/90"}`} onClick={() => { setText(current?.text || ""); setError(""); setEditing(true); }}>
            <Reply size={18} className="shrink-0" aria-hidden="true" />{current ? "Изменить ответ" : "Ответить на комментарий"}
          </button>
        </div>
      ) : null}
      {editing ? (
        <div className="space-y-2">
          <label htmlFor={editorId} className="block text-xs font-semibold text-slate-600">Ответ подразделения</label>
          <textarea id={editorId} maxLength={MAX_RESPONSE_LENGTH} rows={3} value={text} disabled={saving} onChange={(event) => setText(event.target.value)} className="focus-ring block w-full min-w-0 resize-y rounded-md border border-line bg-white px-3 py-2 text-sm" autoFocus />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-muted">{text.length}/{MAX_RESPONSE_LENGTH}</span>
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="focus-ring inline-flex min-h-10 items-center gap-1 rounded-md border border-line px-3 py-2 text-sm text-slate-600"><X size={16} aria-hidden="true" />Отмена</button>
            <button type="button" onClick={save} disabled={saving || !text.trim()} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}{saving ? "Сохраняю" : "Сохранить ответ"}</button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
