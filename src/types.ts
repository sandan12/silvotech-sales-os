export type OpportunityStatus = "Действие" | "Ожидаем" | "Проверка";
export type Confidence = "Подтверждено" | "Со слов клиента" | "Требует проверки";

export type Opportunity = {
  id: string;
  company: string;
  application: string;
  product: string;
  status: OpportunityStatus;
  confidence: Confidence;
  nextAction: string;
  due: string;
  blocker: string;
  fit: number;
  facts: string[];
  unknowns: string[];
};