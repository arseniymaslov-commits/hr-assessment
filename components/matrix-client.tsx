"use client";

import { useMemo, useState } from "react";
import { scoreClass } from "@/lib/format";

type Department = {
  id: string;
  name: string;
  shortName: string;
};

type MatrixEvaluation = {
  id: string;
  evaluatorDepartmentId: string;
  evaluateeDepartmentId: string;
  evaluatorName: string;
  evaluateeName: string;
  score: number | null;
  noInteraction: boolean;
  comment: string | null;
};

export default function MatrixClient({
  departments,
  evaluations
}: {
  departments: Department[];
  evaluations: MatrixEvaluation[];
}) {
  const [selected, setSelected] = useState<MatrixEvaluation | null>(null);
  const map = useMemo(() => {
    const next = new Map<string, MatrixEvaluation>();
    for (const evaluation of evaluations) {
      next.set(`${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`, evaluation);
    }
    return next;
  }, [evaluations]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <th className="sticky left-0 z-10 border-b border-line bg-slate-50 px-4 py-3 text-left">
                Кто оценивает
              </th>
              {departments.map((department) => (
                <th className="border-b border-line px-3 py-3 text-center" key={department.id}>
                  {department.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departments.map((evaluator) => (
              <tr key={evaluator.id}>
                <th className="sticky left-0 z-10 border-b border-line bg-white px-4 py-3 text-left font-medium text-ink">
                  {evaluator.name}
                </th>
                {departments.map((evaluatee) => {
                  const evaluation = map.get(`${evaluator.id}:${evaluatee.id}`);
                  const isSelf = evaluator.id === evaluatee.id;
                  return (
                    <td className="border-b border-line p-2 text-center" key={evaluatee.id}>
                      {isSelf ? (
                        <div className="rounded-lg bg-slate-100 px-2 py-3 text-slate-400">—</div>
                      ) : evaluation?.noInteraction ? (
                        <button
                          className="focus-ring w-full rounded-lg bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                          type="button"
                          onClick={() => setSelected(evaluation)}
                        >
                          нет взаимо.
                        </button>
                      ) : evaluation ? (
                        <button
                          className={`focus-ring w-full rounded-lg px-2 py-3 font-semibold ring-1 ${scoreClass(evaluation.score)}`}
                          type="button"
                          onClick={() => setSelected(evaluation)}
                        >
                          {evaluation.score}
                        </button>
                      ) : (
                        <button
                          className="focus-ring w-full rounded-lg bg-slate-50 px-2 py-3 text-slate-400 ring-1 ring-slate-200"
                          type="button"
                          onClick={() => setSelected(null)}
                        >
                          нет
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="rounded-lg border border-line bg-white p-5">
        <h2 className="font-semibold text-ink">Комментарий по ячейке</h2>
        {selected ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-sm text-muted">Связка</div>
              <div className="mt-1 font-medium">
                {selected.evaluatorName} → {selected.evaluateeName}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Оценка</div>
              <div className="mt-1 text-3xl font-semibold text-ink">
                {selected.noInteraction ? "Нет взаимодействия" : selected.score}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Комментарий</div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {selected.comment ||
                  (selected.noInteraction
                    ? "Подразделение отметило, что взаимодействия за период не было."
                    : "Комментарий не указан, потому что оценка 9 или выше.")}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">
            Выберите ячейку с оценкой, чтобы увидеть детали и комментарий руководителя.
          </p>
        )}
      </aside>
    </div>
  );
}
