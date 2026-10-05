import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { serializeEvaluationResponse } from "@/lib/evaluation-response";
import { ResponseError, saveEvaluationResponse } from "@/lib/evaluation-response-service";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.isActive) return NextResponse.json({ error: "Необходим вход в систему." }, { status: 401 });
  let body: { text?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 }); }
  try {
    const response = await saveEvaluationResponse(user, params.id, body?.text, request);
    return NextResponse.json({ response: serializeEvaluationResponse(response) });
  } catch (error) {
    if (error instanceof ResponseError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Evaluation response failed", error);
    return NextResponse.json({ error: "Ответ не сохранён. Попробуйте ещё раз." }, { status: 500 });
  }
}
