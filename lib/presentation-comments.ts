import type { EvaluationResponseView } from "@/lib/evaluation-response";

type SlideComment = {
  id: string;
  comment: string | null;
  evaluatorName: string;
  evaluateeName: string;
  response?: EvaluationResponseView | null;
};

// Keep complete text, splitting oversized comments before laying out fixed-size slides.
export function paginateComments<T extends SlideComment>(items: T[]): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let units = 0;
  for (const item of items) {
    const chunks = splitComment(item.comment || "", item.response ? 240 : 600);
    for (let index = 0; index < chunks.length; index++) {
      const response = index === chunks.length - 1 ? item.response : null;
      const segment = { ...item, id: `${item.id}-${index}`, comment: chunks[index], response };
      const lines = textLines(chunks[index]);
      const itemUnits = lines + 4 + (response ? textLines(response.text) + 3 : 0);
      if (page.length && (page.length >= 3 || units + itemUnits > 14)) {
        pages.push(page); page = []; units = 0;
      }
      page.push(segment); units += itemUnits;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

function textLines(text: string) {
  return text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 90)), 0);
}

function splitComment(text: string, limit: number) {
  if (!text) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length) {
    let end = Math.min(rest.length, limit);
    const lines = rest.slice(0, end).split("\n");
    if (lines.length > 6) end = lines.slice(0, 6).join("\n").length + 1;
    if (end < rest.length) {
      const space = rest.lastIndexOf(" ", end - 1);
      if (space > end / 2) end = space + 1;
    }
    chunks.push(rest.slice(0, end)); rest = rest.slice(end);
  }
  return chunks;
}
