export const DEVIATION_CATEGORIES = [
  "Нарушение сроков исполнения",
  "Несвоевременная или неполная обратная связь",
  "Неполные или некорректные данные и документы",
  "Недостаточная координация действий",
  "Некорректная деловая коммуникация",
  "Несоответствие результата требованиям",
  "Неисполнение обязательного требования или поручения",
  "Иное"
] as const;

export function isValidDeviationCategory(value: string) {
  return (DEVIATION_CATEGORIES as readonly string[]).includes(value);
}
