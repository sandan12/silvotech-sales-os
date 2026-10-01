import { useEffect, useMemo, useRef, useState } from "react";
import { crmSnapshot } from "./crm";
import { Icons } from "./icons";
import { askSalesOsAi, getMailStatus, syncMail } from "./salesOsApi";
import {
  useCrmConnection,
  type CrmActivity,
  type CrmClient,
  type CrmConnectionMode,
  type CrmInterest,
  type CrmProduct,
  type CrmStage,
  type CrmUpdateDraft,
} from "./useCrmConnection";

type View = "today" | "discovery" | "opportunities" | "result" | "integrations";
type SpeechResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechConstructor = new () => SpeechRecognition;

type LiveOpportunity = {
  id: string;
  client: CrmClient;
  product: CrmProduct;
  interest: CrmInterest;
  stage: CrmStage | null;
  latestActivity: CrmActivity | null;
};

type TodayAction = {
  client: CrmClient;
  stage: CrmStage | null;
  latestActivity: CrmActivity | null;
  interestCount: number;
  rank: number;
  reason: string;
  action: string;
};

const nav = [
  { id: "today" as const, label: "Командный центр", icon: Icons.Today },
  { id: "discovery" as const, label: "Поиск рынка", icon: Icons.Discovery },
  { id: "opportunities" as const, label: "Возможности", icon: Icons.Opportunity },
  { id: "result" as const, label: "Неделя", icon: Icons.Result },
  { id: "integrations" as const, label: "Ядро", icon: Icons.Brain },
];

const activityLabels: Record<string, string> = {
  note: "Заметка",
  call: "Звонок",
  email: "Письмо",
  meeting: "Встреча",
  task: "Задача",
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Не назначено";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Некорректная дата";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function truncate(value: string, limit = 150) {
  return value.length > limit ? `${value.slice(0, limit).trim()}…` : value;
}

function stageTone(stage: CrmStage | null) {
  if (stage?.isWon) return "success";
  if (stage?.isLost) return "warning";
  return "info";
}

function buildOpportunities(
  clients: CrmClient[],
  products: CrmProduct[],
  interests: CrmInterest[],
  stages: CrmStage[],
  activities: CrmActivity[],
) {
  const clientById = new Map(clients.map((item) => [item.id, item]));
  const productById = new Map(products.map((item) => [item.id, item]));
  const stageById = new Map(stages.map((item) => [item.id, item]));
  const latestByClient = new Map<string, CrmActivity>();
  activities.forEach((item) => {
    if (!latestByClient.has(item.clientId)) latestByClient.set(item.clientId, item);
  });

  return interests
    .map((interest): LiveOpportunity | null => {
      const client = clientById.get(interest.clientId);
      const product = productById.get(interest.productId);
      if (!client || !product) return null;
      return {
        id: interest.id,
        client,
        product,
        interest,
        stage: client.stageId ? stageById.get(client.stageId) ?? null : null,
        latestActivity: latestByClient.get(client.id) ?? null,
      };
    })
    .filter((item): item is LiveOpportunity => Boolean(item))
    .sort((a, b) => {
      const aDate = a.client.nextActionAt ? new Date(a.client.nextActionAt).getTime() : Infinity;
      const bDate = b.client.nextActionAt ? new Date(b.client.nextActionAt).getTime() : Infinity;
      return aDate - bDate || a.client.name.localeCompare(b.client.name, "ru");
    });
}

function buildTodayActions(
  clients: CrmClient[],
  interests: CrmInterest[],
  stages: CrmStage[],
  activities: CrmActivity[],
) {
  const now = Date.now();
  const week = now + 7 * 86400000;
  const stageById = new Map(stages.map((item) => [item.id, item]));
  const interestCount = new Map<string, number>();
  interests.forEach((item) => interestCount.set(item.clientId, (interestCount.get(item.clientId) ?? 0) + 1));
  const latestByClient = new Map<string, CrmActivity>();
  activities.forEach((item) => {
    if (!latestByClient.has(item.clientId)) latestByClient.set(item.clientId, item);
  });

  return clients
    .map((client): TodayAction | null => {
      const stage = client.stageId ? stageById.get(client.stageId) ?? null : null;
      if (stage?.isWon || stage?.isLost) return null;
      const nextTime = client.nextActionAt ? new Date(client.nextActionAt).getTime() : null;
      const count = interestCount.get(client.id) ?? 0;
      const common = {
        client,
        stage,
        latestActivity: latestByClient.get(client.id) ?? null,
        interestCount: count,
      };
      if (nextTime !== null && nextTime < now) {
        return { ...common, rank: nextTime, reason: `Срок прошёл ${formatDate(client.nextActionAt)}`, action: "Проверить просроченное действие" };
      }
      if (nextTime !== null && nextTime <= week) {
        return { ...common, rank: nextTime + 1e13, reason: `Действие назначено на ${formatDate(client.nextActionAt)}`, action: "Выполнить ближайшее действие" };
      }
      if (count > 0 && nextTime === null) {
        return { ...common, rank: 3e13 - new Date(client.updatedAt).getTime(), reason: `${count} ${count === 1 ? "потребность" : "потребности"} без даты следующего шага`, action: "Назначить следующий шаг" };
      }
      return null;
    })
    .filter((item): item is TodayAction => Boolean(item))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
}

function inferActivityType(text: string): CrmUpdateDraft["type"] {
  const value = text.toLowerCase();
  if (/встреч|переговор|увиделись/.test(value)) return "meeting";
  if (/письм|email|e-mail|почт/.test(value)) return "email";
  if (/звон|созвон|позвони|телефон/.test(value)) return "call";
  if (/задач|сделать|подготовить|отправить|уточнить/.test(value)) return "task";
  return "note";
}

type NarrativeAnalysis = {
  facts: string[];
  blocker: string | null;
  nextAction: string;
  channel: string;
  reason: string;
  questions: string[];
  suggestedDate: string;
  emailSubject: string;
  emailBody: string;
};

const companyNoise = new Set([
  "sp", "z", "oo", "s", "a", "sa", "spolka", "ograniczona", "odpowiedzialnoscia",
  "ltd", "limited", "gmbh", "company", "firma", "client", "klient",
]);

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => !companyNoise.has(word))
    .join(" ");
}

function matchClient(text: string, clients: CrmClient[]) {
  const normalizedText = normalizeName(text);
  const textWords = new Set(normalizedText.split(/\s+/));
  let best: { client: CrmClient; score: number } | null = null;

  for (const client of clients) {
    const normalizedClient = normalizeName(client.name);
    if (!normalizedClient) continue;
    const words = normalizedClient.split(/\s+/).filter((word) => word.length >= 4);
    let score = normalizedText.includes(normalizedClient) ? 100 : 0;
    if (!score && words.length) {
      const matched = words.filter((word) => textWords.has(word)).length;
      score = Math.round((matched / words.length) * 90);
    }
    const websiteDomain = client.website
      ?.replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/.]/)[0];
    if (websiteDomain && normalizedText.includes(normalizeName(websiteDomain))) score = 98;
    if (!best || score > best.score) best = { client, score };
  }

  return best && best.score >= 60 ? best : null;
}

function extractCandidateName(text: string) {
  const firstPart = text
    .trim()
    .split(/\s+(?:должен|должна|должны|говорит|сказал|сказала|покупает|закупается|ждёт|ждет|просит|хочет|нужно|надо)(?:\s|$)/i)[0]
    ?.replace(/^(?:по|про|клиент|компания)\s+/i, "")
    .replace(/[,:;.!?]+$/g, "")
    .trim();
  if (!firstPart || firstPart.length > 80) return "Новый клиент";
  return firstPart
    .split(/\s+/)
    .slice(0, 5)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function addBusinessDays(count: number) {
  const date = new Date();
  while (count > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function analyzeNarrative(text: string, clientName: string): NarrativeAnalysis {
  const value = text.toLowerCase();
  const facts: string[] = [];
  const offerSent = /отправил|отправила|выслал|выслала/.test(value) && /цен|оферт|предложен/.test(value);
  const priceObjection = /цен[аы]?.{0,30}(высок|дорог)|высок.{0,20}цен/.test(value);
  const reviewPending = /должен.{0,35}провер|должна.{0,35}провер|рассматрива|жд[её]м.{0,30}ответ/.test(value);
  const declarationSent = /отправил|отправила|выслал|выслала/.test(value) && /декларац|сертификат|документ/.test(value);
  const germany = /германи/.test(value);

  if (reviewPending) facts.push("Клиент проверяет предложение");
  if (priceObjection) facts.push("Клиент сообщил, что прежняя цена была высокой");
  if (offerSent) facts.push("Отправлена обновлённая цена или предложение");
  if (declarationSent) facts.push("Клиенту отправлена декларация или технический документ");
  if (germany) facts.push("Текущий источник закупки — Германия, со слов менеджера");
  if (!facts.length) facts.push("Зафиксировано новое сообщение менеджера без дополнительных выводов");

  const nextAction = offerSent || reviewPending
    ? "Уточнить результат проверки обновлённой цены и декларации"
    : "Уточнить текущий статус и следующий критерий решения";
  const channel = offerSent || declarationSent ? "Сначала email, затем звонок при отсутствии ответа" : "Короткий звонок";
  const reason = offerSent || declarationSent
    ? "Клиенту нужно сверить цену и документ; письмо сохранит предметный контекст, звонок нужен только для ускорения решения."
    : "В истории недостаточно данных о критерии решения; разговор быстрее закроет главный пробел.";
  const questions = [
    priceObjection ? "Стала ли новая цена конкурентной относительно текущей закупки?" : "Какой критерий сейчас определяет решение?",
    declarationSent ? "Подходит ли декларация под требования клиента?" : "Какие документы обязательны для согласования?",
    "Какой объём, спецификация и желаемый срок первой закупки?",
    "Когда клиент готов дать окончательный ответ?",
  ];
  const emailSubject = `Уточнение по предложению — ${clientName}`;
  const emailBody = [
    "Добрый день!",
    "",
    "Хочу уточнить, удалось ли проверить обновлённое предложение и отправленные документы.",
    priceObjection ? "Буду благодарен за обратную связь: стала ли новая цена конкурентной для вас?" : "Буду благодарен за обратную связь по условиям.",
    declarationSent ? "Также прошу подтвердить, подходит ли наша декларация под ваши требования." : "",
    "Если предложение актуально, подскажите, пожалуйста, требуемую спецификацию, объём и желаемый срок поставки.",
    "",
    "С уважением,",
    "Sandan",
  ].filter(Boolean).join("\n");

  return {
    facts,
    blocker: priceObjection ? "Цена выше ожидаемой / сравнение с текущим поставщиком" : null,
    nextAction,
    channel,
    reason,
    questions,
    suggestedDate: addBusinessDays(3),
    emailSubject,
    emailBody,
  };
}

function CapturePanel({
  clients,
  mode,
  onClose,
  onSaved,
  save,
}: {
  clients: CrmClient[];
  mode: CrmConnectionMode;
  onClose: () => void;
  onSaved: () => void;
  save: (draft: CrmUpdateDraft) => Promise<{ error: string | null }>;
}) {
  const [step, setStep] = useState<"input" | "preview" | "saved">("input");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"текст" | "голос">("текст");
  const [clientChoice, setClientChoice] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const type = inferActivityType(text);
  const selectedClient = clients.find((client) => client.id === clientChoice) ?? null;
  const analysis = useMemo(
    () => analyzeNarrative(text, selectedClient?.name ?? (newClientName || "клиент")),
    [text, selectedClient?.name, newClientName],
  );

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function detectClient() {
    const match = matchClient(text, clients);
    const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? "";
    const website = text.match(/https?:\/\/[^\s]+|(?:www\.)?[\w-]+\.(?:pl|com|de|eu|ru)\b/i)?.[0] ?? "";
    const phone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? "";
    if (match) {
      setClientChoice(match.client.id);
      setMatchScore(match.score);
    } else {
      setClientChoice("__new__");
      setNewClientName(extractCandidateName(text));
      setNewClientEmail(email);
      setNewClientPhone(phone);
      setNewClientWebsite(website);
      setMatchScore(null);
    }
    setNextActionDate(analyzeNarrative(text, match?.client.name ?? extractCandidateName(text)).suggestedDate);
    setStep("preview");
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Голосовой ввод не поддерживается этим браузером. Используйте Chrome или введите текст.");
      return;
    }
    setVoiceError(null);
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    const initialText = text.trim();
    recognition.onresult = (event) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index]?.[0]?.transcript ?? "";
      }
      setSource("голос");
      setText([initialText, spoken.trim()].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === "not-allowed" ? "Разрешите доступ к микрофону в браузере и повторите." : "Не удалось распознать речь. Попробуйте ещё раз или введите текст.");
      setRecording(false);
    };
    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    try {
      recognition.start();
      setRecording(true);
    } catch {
      setVoiceError("Не удалось запустить микрофон. Обновите страницу и повторите.");
    }
  }

  async function confirm() {
    const creating = clientChoice === "__new__";
    if (!clientChoice || (creating && !newClientName.trim())) {
      setSaveError("Выберите клиента или укажите название нового.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const nextActionAt = nextActionDate
      ? new Date(`${nextActionDate}T09:00:00`).toISOString()
      : null;
    const result = await save({
      clientId: creating ? null : clientChoice,
      newClient: creating
        ? {
            name: newClientName.trim(),
            email: newClientEmail.trim() || null,
            phone: newClientPhone.trim() || null,
            website: newClientWebsite.trim() || null,
            notes: `Исходный контекст из Sales OS: ${text.trim()}`,
          }
        : null,
      content: text.trim(),
      type,
      nextActionAt,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    setStep("saved");
    onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="capture-panel" role="dialog" aria-modal="true" aria-labelledby="capture-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="capture-panel__header">
          <div><p className="eyebrow">Быстрое обновление</p><h2 id="capture-title">Расскажите, что изменилось</h2></div>
          <button className="ghost-icon" onClick={onClose} aria-label="Закрыть"><Icons.Close /></button>
        </header>
        {step === "input" && (
          <>
            <textarea
              value={text}
              onChange={(event) => { setText(event.target.value); setSource("текст"); }}
              aria-label="Сообщение об изменении"
              placeholder="Например: созвонился с Aqua‑Trend, отправить предложение завтра…"
            />
            <button className={recording ? "record-button record-button--active" : "record-button"} type="button" onClick={toggleRecording} aria-pressed={recording}>
              <Icons.Mic /><span>{recording ? "Слушаю… нажмите, чтобы остановить" : "Записать голосом"}</span>
            </button>
            {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
            <div className="capture-actions">
              <p>Система сначала покажет запись. В CRM попадёт только подтверждённый текст.</p>
              <button className="primary-button" onClick={detectClient} disabled={!text.trim()}>Разобрать сообщение<Icons.Spark /></button>
            </div>
          </>
        )}
        {step === "preview" && (
          <>
            <div className="preview-callout">
              <Icons.Spark />
              <div>
                <strong>{clientChoice === "__new__" ? "Клиента нет в CRM — подготовлено создание" : "Клиент распознан — проверьте"}</strong>
                <span>{matchScore ? `Совпадение по названию или домену: ${matchScore}%` : "Будут сохранены только доступные данные из сообщения"}</span>
              </div>
            </div>
            <label className="preview-field">
              <span>Клиент</span>
              <select aria-label="Клиент" value={clientChoice} onChange={(event) => setClientChoice(event.target.value)}>
                <option value="">Не выбран</option>
                <option value="__new__">＋ Создать нового клиента</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            {clientChoice === "__new__" && (
              <div className="new-client-grid">
                <label><span>Название *</span><input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} /></label>
                <label><span>Email</span><input type="email" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} /></label>
                <label><span>Телефон</span><input value={newClientPhone} onChange={(event) => setNewClientPhone(event.target.value)} /></label>
                <label><span>Сайт</span><input value={newClientWebsite} onChange={(event) => setNewClientWebsite(event.target.value)} /></label>
              </div>
            )}
            <div className="change-list">
              <div><span>Запись в историю</span><p>{text.trim()}</p></div>
              <div><span>Тип события</span><p>{activityLabels[type]}</p></div>
              <div><span>Источник</span><p>Sales OS · {source}</p></div>
            </div>
            <section className="advisor-card">
              <div>
                <p className="eyebrow">Контекст сделки</p>
                <ul>{analysis.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                {analysis.blocker && <p className="advisor-blocker"><strong>Препятствие:</strong> {analysis.blocker}</p>}
              </div>
              <div>
                <p className="eyebrow">Рекомендация</p>
                <h3>{analysis.nextAction}</h3>
                <p><strong>Канал:</strong> {analysis.channel}</p>
                <p>{analysis.reason}</p>
                <label className="date-field">
                  <span>Предлагаемый срок</span>
                  <input type="date" value={nextActionDate} onChange={(event) => setNextActionDate(event.target.value)} />
                </label>
              </div>
            </section>
            <section className="question-card">
              <p className="eyebrow">Что нужно узнать</p>
              <ol>{analysis.questions.map((question) => <li key={question}>{question}</li>)}</ol>
            </section>
            <section className="email-draft">
              <div><p className="eyebrow">Черновик письма</p><strong>{analysis.emailSubject}</strong></div>
              <pre>{analysis.emailBody}</pre>
            </section>
            {mode !== "live" && <p className="save-error" role="alert">Для записи сначала подключите CRM.</p>}
            {saveError && <p className="save-error" role="alert">{saveError}</p>}
            <div className="capture-actions">
              <button className="secondary-button" onClick={() => setStep("input")}>Исправить</button>
              <button className="primary-button" onClick={confirm} disabled={saving || mode !== "live" || !clientChoice || (clientChoice === "__new__" && !newClientName.trim())}>
                <Icons.Check />{saving ? "Сохраняем…" : clientChoice === "__new__" ? "Создать клиента и записать" : "Подтвердить и записать"}
              </button>
            </div>
          </>
        )}
        {step === "saved" && (
          <div className="success-state">
            <span className="success-state__icon"><Icons.Check /></span>
            <h3>Изменение записано в CRM</h3>
            <p>Исходный текст добавлен в историю клиента. Найденный срок обновлён только после подтверждения.</p>
            <button className="primary-button" onClick={onClose}>Готово</button>
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="empty-state">
      <span className="empty-state__mark"><Icons.Check /></span>
      <h2>{title}</h2><p>{text}</p>
    </section>
  );
}

function Today({ actions, mode, onCapture }: { actions: TodayAction[]; mode: CrmConnectionMode; onCapture: () => void }) {
  const today = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const primary = actions[0];
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>{actions.length ? `${actions.length} приоритетных действия` : "Приоритеты на сегодня"}</h1>
          <p className="hero__copy">Только действия с ближайшим или пропущенным сроком и клиенты с подтверждённой потребностью без следующего шага.</p>
        </div>
        <button className="capture-button" onClick={onCapture}>
          <span className="capture-button__icon"><Icons.Mic /></span>
          <span><strong>Обновить голосом</strong><small>Проверить черновик и записать в CRM</small></span>
        </button>
      </section>
      {mode === "connecting" ? (
        <EmptyState title="Загружаем CRM" text="Собираем ближайшие действия и подтверждённые потребности." />
      ) : primary ? (
        <div className="today-grid">
          <section className="priority-panel">
            <header className="section-heading">
              <div><p className="eyebrow">Приоритет №1</p><h2>{primary.client.name}</h2></div>
              <span className={`confidence confidence--${stageTone(primary.stage)}`}>{primary.stage?.name ?? primary.client.status ?? "Без этапа"}</span>
            </header>
            <h3>{primary.action}</h3><p>{primary.reason}</p>
            <div className="priority-meta">
              <div><span>Потребности в CRM</span><strong>{primary.interestCount || "Нет связанных товаров"}</strong></div>
              <div><span>Последнее событие</span><strong>{primary.latestActivity ? truncate(primary.latestActivity.content, 100) : "История пуста"}</strong></div>
            </div>
            <span className="source-note">Источник: CRM · запись клиента</span>
          </section>
          <aside className="queue-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Дальше</p><h2>Очередь решений</h2></div>
              <span className="count-badge">{Math.max(actions.length - 1, 0)}</span>
            </div>
            {actions.slice(1).map((item, index) => (
              <div className="queue-item queue-item--static" key={item.client.id}>
                <span className="queue-item__number">0{index + 2}</span>
                <span><strong>{item.client.name}</strong><small>{item.reason}</small></span>
                <span className="queue-date">{formatDate(item.client.nextActionAt)}</span>
              </div>
            ))}
            {actions.length === 1 && <p className="queue-empty">Других срочных действий в CRM нет.</p>}
          </aside>
        </div>
      ) : (
        <EmptyState title={mode === "live" ? "Срочных действий нет" : "Подключите CRM"} text={mode === "live" ? "Просроченных и ближайших действий не найдено." : "После подключения здесь появятся реальные приоритеты."} />
      )}
    </>
  );
}

function OpportunityCard({ item, onOpen }: { item: LiveOpportunity; onOpen: (item: LiveOpportunity) => void }) {
  const detail = item.interest.note || item.latestActivity?.content || "Дополнительное описание не заполнено";
  return (
    <article className="opportunity-card opportunity-card--real">
      <header>
        <div><p className="eyebrow">{item.client.name}</p><h3>{item.product.name}</h3></div>
        <span className={`confidence confidence--${stageTone(item.stage)}`}>{item.stage?.name ?? "Без этапа"}</span>
      </header>
      <p className="product">{[item.product.sku, item.product.category].filter(Boolean).join(" · ") || "Карточка товара CRM"}</p>
      <div className="evidence-block"><span>Подтверждено в CRM</span><p>{truncate(detail)}</p></div>
      <dl className="opportunity-facts">
        <div><dt>Количество</dt><dd>{item.interest.quantity ?? "Не указано"}{item.interest.quantity ? ` ${item.product.unit}` : ""}</dd></div>
        <div><dt>Следующее действие</dt><dd>{formatDate(item.client.nextActionAt)}</dd></div>
      </dl>
      <footer>
        <span className="source-note">Источник: CRM · потребность клиента</span>
        <button className="icon-button" onClick={() => onOpen(item)} aria-label={`Открыть ${item.client.name}: ${item.product.name}`}><Icons.Arrow /></button>
      </footer>
    </article>
  );
}

function Opportunities({ items, mode, onOpen }: { items: LiveOpportunity[]; mode: CrmConnectionMode; onOpen: (item: LiveOpportunity) => void }) {
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Активный портфель</p><h1>Подтверждённые потребности из CRM</h1><p>Одна карточка — одна реальная связка клиента и товара. Без придуманного рейтинга или объёма.</p></div>
        <div className="portfolio-summary"><strong>{items.length}</strong><span>потребностей загружено</span></div>
      </section>
      {items.length ? (
        <section className="opportunity-grid">{items.map((item) => <OpportunityCard item={item} key={item.id} onOpen={onOpen} />)}</section>
      ) : (
        <EmptyState title={mode === "live" ? "Потребностей не найдено" : "Нет данных CRM"} text={mode === "live" ? "Добавьте интерес клиента к товару в CRM — он появится здесь." : "Подключите CRM, чтобы загрузить клиентские потребности."} />
      )}
    </>
  );
}

const discoveryCountries = [
  "Польша", "Германия", "Чехия", "Словакия", "Литва",
  "Латвия", "Эстония", "Нидерланды", "Бельгия", "Франция",
];

function Discovery({ products, mode }: { products: CrmProduct[]; mode: CrmConnectionMode }) {
  const [country, setCountry] = useState("Польша");
  const [productId, setProductId] = useState("all");
  const [customerType, setCustomerType] = useState("");
  const [result, setResult] = useState("");
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const product = products.find((item) => item.id === productId);

  async function runDiscovery() {
    setBusy(true);
    setError("");
    setResult("");
    const catalogContext = product
      ? `Товар: ${product.name}; SKU: ${product.sku ?? "не указан"}; категория: ${product.category}; единица: ${product.unit}.`
      : `Используй весь активный каталог CRM (${products.filter((item) => item.isActive).length} позиций).`;
    try {
      const response = await askSalesOsAi(
        "discovery",
        [
          `Страна поиска: ${country}.`,
          customerType ? `Предпочтительный тип компании: ${customerType}.` : "",
          catalogContext,
          "Найди до пяти новых подходящих компаний. Для каждой покажи источники, товары-кандидаты, основания, неизвестные параметры, гипотезу модели закупок, первое письмо и начало звонка. Не создавай записи CRM.",
        ].filter(Boolean).join("\n"),
      );
      setResult(response.reply);
      setProvider(response.provider);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Не удалось выполнить исследование";
      setError(message === "AI provider is not configured"
        ? "AI пока не подключён. Добавьте бесплатный ключ Groq, Gemini или OpenRouter в CRM → Настройки → Модели AI."
        : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading discovery-heading">
        <div>
          <p className="eyebrow">Исследователь рынка</p>
          <h1>Новые клиенты одной командой</h1>
          <p>Выберите рынок и товар. Ядро изучит компании и каталоги, отделит факты от гипотез и подготовит первый контакт.</p>
        </div>
      </section>
      <section className="discovery-console">
        <div className="discovery-controls">
          <label><span>Страна</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{discoveryCountries.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>
            <span>Каталог</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="all">Весь активный каталог</option>
              {products.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span>Тип компании — необязательно</span>
            <input value={customerType} onChange={(event) => setCustomerType(event.target.value)} placeholder="Например: дистрибьюторы пищевого оборудования" />
          </label>
          <button className="discovery-run" onClick={runDiscovery} disabled={busy || mode !== "live"}>
            <Icons.Discovery />
            <span><strong>{busy ? "Исследую рынок…" : "Найти подходящих клиентов"}</strong><small>Факты, гипотезы, товары и первый контакт</small></span>
          </button>
        </div>
        <div className="discovery-status"><span className={mode === "live" ? "live-dot" : "live-dot live-dot--muted"} /><p>{mode === "live" ? `${products.length} товаров доступны для сопоставления` : "Подключите CRM, чтобы использовать каталог и AI-ядро"}</p></div>
      </section>
      {error && <section className="system-message system-message--error"><strong>Исследование не запущено</strong><p>{error}</p></section>}
      {result ? (
        <section className="research-result">
          <header><div><p className="eyebrow">Результат исследования</p><h2>{country} · {product?.name ?? "весь каталог"}</h2></div><span>{provider}</span></header>
          <pre>{result}</pre>
          <p className="source-note">Кандидаты не добавлены в CRM. Сначала проверьте источники и выводы.</p>
        </section>
      ) : (
        <section className="research-placeholder">
          <div><strong>1</strong><span>Поиск компаний и каталогов</span></div>
          <div><strong>2</strong><span>Сопоставление с товарами</span></div>
          <div><strong>3</strong><span>Письмо, звонок и вопросы</span></div>
        </section>
      )}
    </>
  );
}

function connectionLabel(mode: CrmConnectionMode) {
  if (mode === "live") return "Онлайн · запись после подтверждения";
  if (mode === "connecting") return "Подключение…";
  if (mode === "auth-required") return "Требуется вход";
  if (mode === "error") return "Ошибка подключения";
  return "Демо-данные отключены";
}

function Result({
  counts,
  clients,
  activities,
  interests,
  stages,
  mode,
}: {
  counts: { clients: number; activities: number; products: number };
  clients: CrmClient[];
  activities: CrmActivity[];
  interests: CrmInterest[];
  stages: CrmStage[];
  mode: CrmConnectionMode;
}) {
  const [report, setReport] = useState("");
  const [reportProvider, setReportProvider] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const activeClientIds = new Set(
    interests
      .map((item) => clients.find((client) => client.id === item.clientId))
      .filter((client): client is CrmClient => Boolean(client))
      .filter((client) => {
        const stage = client.stageId ? stageById.get(client.stageId) : null;
        return !stage?.isWon && !stage?.isLost;
      })
      .map((client) => client.id),
  );
  const overdue = clients.filter((client) => client.nextActionAt && new Date(client.nextActionAt).getTime() < Date.now()).length;
  const now = new Date();
  const thursdayStart = new Date(now);
  const daysSinceThursday = (now.getDay() - 4 + 7) % 7;
  thursdayStart.setDate(now.getDate() - daysSinceThursday);
  thursdayStart.setHours(8, 0, 0, 0);
  if (thursdayStart.getTime() > now.getTime()) thursdayStart.setDate(thursdayStart.getDate() - 7);
  const weekActivities = activities.filter((item) => new Date(item.createdAt) >= thursdayStart);
  const processedClients = new Set(weekActivities.map((item) => item.clientId)).size;

  async function generateReport() {
    setReportBusy(true);
    setReportError("");
    try {
      const response = await askSalesOsAi(
        "weekly",
        [
          `Отчётный период начался ${thursdayStart.toISOString()}.`,
          `Содержательных событий: ${weekActivities.length}.`,
          `Уникальных обработанных клиентов: ${processedClients}.`,
          `Подтверждённых потребностей сейчас: ${interests.length}.`,
          `Просроченных следующих действий сейчас: ${overdue}.`,
          "Подготовь доклад руководству: обещания и факты только из CRM, результаты, препятствия, управляемый план и три сценария прогноза до следующего четверга.",
        ].join("\n"),
      );
      setReport(response.reply);
      setReportProvider(response.provider);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Не удалось подготовить отчёт");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Цикл четверг → четверг</p><h1>План, факт и прогноз</h1><p>Система показывает не активность ради активности, а действия, их последствия и управляемый план до следующего созвона.</p></div>
        <button className="report-button" onClick={generateReport} disabled={reportBusy || mode !== "live"}><Icons.Spark />{reportBusy ? "Готовлю доклад…" : "Подготовить доклад"}</button>
      </section>
      <section className="metrics">
        <article><span>Обработано в текущем цикле</span><strong>{processedClients}</strong><p>уникальных клиентов</p></article>
        <article><span>Содержательных событий</span><strong>{weekActivities.length}</strong><p>с четверга 08:00</p></article>
        <article><span>Активные потребности</span><strong>{activeClientIds.size}</strong><p>уникальных клиентов</p></article>
        <article><span>Просроченные действия</span><strong>{overdue}</strong><p>по полю следующего шага</p></article>
      </section>
      {reportError && <section className="system-message system-message--error"><strong>Доклад не подготовлен</strong><p>{reportError}</p></section>}
      {report && <section className="research-result weekly-report"><header><div><p className="eyebrow">Доклад руководству</p><h2>Текущий цикл</h2></div><span>{reportProvider}</span></header><pre>{report}</pre></section>}
      <section className="evidence-panel">
        <div><p className="eyebrow">Качество данных</p><h2>Что система знает об источнике</h2></div>
        <dl>
          <div><dt>Резервный снимок</dt><dd>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(crmSnapshot.exportedAt))}</dd></div>
          <div><dt>Клиентов в CRM</dt><dd>{counts.clients}</dd></div>
          <div><dt>Событий в истории</dt><dd>{counts.activities}</dd></div>
          <div><dt>Товаров в CRM</dt><dd>{counts.products}</dd></div>
          <div><dt>Режим подключения</dt><dd>{connectionLabel(mode)}</dd></div>
        </dl>
      </section>
    </>
  );
}

function Integrations({ mode, onRefresh }: { mode: CrmConnectionMode; onRefresh: () => Promise<void> }) {
  const [mailStatus, setMailStatus] = useState<Awaited<ReturnType<typeof getMailStatus>> | null>(null);
  const [mailError, setMailError] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<Awaited<ReturnType<typeof syncMail>> | null>(null);
  const [aiState, setAiState] = useState<{ provider: string; fallback: string[] } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    void getMailStatus().then(setMailStatus).catch((error) => setMailError(error.message));
  }, [mode]);

  async function checkAi() {
    setAiBusy(true);
    setAiError("");
    try {
      const response = await askSalesOsAi("command", "Проверь доступность ядра. Не меняй данные. Ответь одним коротким предложением.");
      setAiState({ provider: response.provider, fallback: response.fallback });
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "AI недоступен");
    } finally {
      setAiBusy(false);
    }
  }

  async function runMailSync() {
    setMailBusy(true);
    setMailError("");
    try {
      const result = await syncMail();
      setSyncResult(result);
      await onRefresh();
    } catch (caught) {
      setMailError(caught instanceof Error ? caught.message : "Почта недоступна");
    } finally {
      setMailBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Ядро системы</p><h1>Источники, память и AI</h1><p>Модели можно заменить. Контекст, правила и доказательства остаются в системе.</p></div>
      </section>
      <section className="integration-grid">
        <article className="integration-card">
          <header><Icons.Brain /><div><p className="eyebrow">AI-маршрутизатор</p><h2>Основной и резервные модели</h2></div></header>
          <p>При лимите или временной ошибке ядро передаёт тот же контекст следующему активному провайдеру.</p>
          {aiState && <div className="integration-fact"><span>Активный провайдер</span><strong>{aiState.provider}</strong></div>}
          {aiError && <p className="integration-error">{aiError}</p>}
          <button className="secondary-button" onClick={checkAi} disabled={aiBusy || mode !== "live"}>{aiBusy ? "Проверяю…" : "Проверить AI-ядро"}</button>
        </article>
        <article className="integration-card">
          <header><Icons.Mail /><div><p className="eyebrow">Корпоративная почта</p><h2>IMAP · только чтение</h2></div></header>
          <p>Письма связываются с клиентами по точному email или однозначному домену. Отправка отключена.</p>
          <div className="integration-fact"><span>Состояние</span><strong>{mailStatus?.configured ? "Готово к синхронизации" : "Нужен серверный пароль"}</strong></div>
          {mailStatus && <small>{mailStatus.host}:{mailStatus.port} · TLS · {mailStatus.user || "ящик не указан"}</small>}
          {mailError && <p className="integration-error">{mailError}</p>}
          {syncResult && <p className="sync-summary">Проверено: {syncResult.scanned} · связано: {syncResult.linked} · без клиента: {syncResult.unmatched.length}</p>}
          <button className="secondary-button" onClick={runMailSync} disabled={mailBusy || mode !== "live" || !mailStatus?.configured}>{mailBusy ? "Синхронизирую…" : "Синхронизировать 45 дней"}</button>
        </article>
        <article className="integration-card integration-card--wide">
          <p className="eyebrow">Правило памяти</p>
          <h2>Суть работы не принадлежит модели</h2>
          <p>Каталог, история клиентов, источники, недельные планы и правила Sales OS хранятся отдельно. Поэтому переключение Gemini → Groq → OpenRouter не меняет задачу и не обнуляет контекст.</p>
        </article>
      </section>
    </>
  );
}

function Drawer({ item, onClose }: { item: LiveOpportunity; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">{item.client.name}</p><h2>{item.product.name}</h2></div><button className="ghost-icon" onClick={onClose} aria-label="Закрыть"><Icons.Close /></button></header>
        <span className={`confidence confidence--${stageTone(item.stage)}`}>{item.stage?.name ?? item.client.status ?? "Без этапа"}</span>
        <section><span className="muted-label">Товар из CRM</span><h3>{[item.product.sku, item.product.category, item.product.unit].filter(Boolean).join(" · ")}</h3></section>
        <section><span className="muted-label">Подтверждённая потребность</span><p className="drawer-copy">{item.interest.note || "Описание не заполнено"}</p><p className="drawer-copy"><strong>Количество:</strong> {item.interest.quantity ?? "не указано"}{item.interest.quantity ? ` ${item.product.unit}` : ""}</p></section>
        <section><span className="muted-label">Последняя запись в истории</span><p className="drawer-copy">{item.latestActivity?.content ?? "История клиента пуста"}</p>{item.latestActivity && <small className="source-note">{formatDate(item.latestActivity.createdAt, true)} · {activityLabels[item.latestActivity.type] ?? item.latestActivity.type}</small>}</section>
        <div className="drawer__action"><span>Следующее действие</span><strong>{item.client.nextActionAt ? "Срок назначен в CRM" : "Срок не назначен"}</strong><small>{formatDate(item.client.nextActionAt, true)}</small></div>
      </aside>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>("today");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [selected, setSelected] = useState<LiveOpportunity | null>(null);
  const [saved, setSaved] = useState(false);
  const title = useMemo(() => nav.find((item) => item.id === view)?.label, [view]);
  const crm = useCrmConnection();
  const opportunities = useMemo(() => buildOpportunities(crm.clients, crm.products, crm.interests, crm.stages, crm.activities), [crm.clients, crm.products, crm.interests, crm.stages, crm.activities]);
  const todayActions = useMemo(() => buildTodayActions(crm.clients, crm.interests, crm.stages, crm.activities), [crm.clients, crm.interests, crm.stages, crm.activities]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="SilvoTech Sales OS"><span className="brand__mark">S</span><span><strong>SilvoTech</strong><small>Sales OS</small></span></div>
        <nav aria-label="Основная навигация">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "nav-item nav-item--active" : "nav-item"} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar__status"><span className={crm.mode === "live" ? "live-dot" : "live-dot live-dot--muted"} /><div><strong>{crm.mode === "live" ? "CRM подключена" : "CRM: безопасный режим"}</strong><small>{connectionLabel(crm.mode)}</small></div></div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-title">{title}</span>
          <div className="topbar__right">
            {saved && <span className="saved-note">Записано в CRM</span>}
            {crm.mode === "auth-required" && <button className="auth-button" onClick={() => setAuthOpen(true)}>Войти в CRM</button>}
            <button className="quick-capture" onClick={() => setCaptureOpen(true)}><Icons.Mic /><span>Быстрое обновление</span></button>
            <div className="avatar" aria-label={crm.user ? `Профиль ${crm.user.email ?? "пользователя"}` : "Профиль"}>SC</div>
          </div>
        </header>
        <main>
          {view === "today" && <Today actions={todayActions} mode={crm.mode} onCapture={() => setCaptureOpen(true)} />}
          {view === "discovery" && <Discovery products={crm.products} mode={crm.mode} />}
          {view === "opportunities" && <Opportunities items={opportunities} mode={crm.mode} onOpen={setSelected} />}
          {view === "result" && <Result counts={crm.counts} clients={crm.clients} activities={crm.activities} interests={crm.interests} stages={crm.stages} mode={crm.mode} />}
          {view === "integrations" && <Integrations mode={crm.mode} onRefresh={crm.refresh} />}
        </main>
        <nav className="mobile-nav" aria-label="Мобильная навигация">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "mobile-nav__item mobile-nav__item--active" : "mobile-nav__item"} onClick={() => setView(item.id)}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>
      </div>
      {captureOpen && <CapturePanel clients={crm.clients} mode={crm.mode} onClose={() => setCaptureOpen(false)} onSaved={() => setSaved(true)} save={crm.saveConfirmedUpdate} />}
      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAuthOpen(false)}>
          <form
            className="auth-panel"
            aria-labelledby="auth-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={async (event) => {
              event.preventDefault();
              setAuthBusy(true);
              setAuthError(null);
              const result = await crm.signIn(authEmail, authPassword);
              setAuthBusy(false);
              if (result.error) { setAuthError(result.error); return; }
              setAuthPassword("");
              setAuthOpen(false);
            }}
          >
            <header className="capture-panel__header"><div><p className="eyebrow">Безопасное подключение</p><h2 id="auth-title">Вход в CRM</h2></div><button className="ghost-icon" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть"><Icons.Close /></button></header>
            <p className="auth-panel__copy">Если CRM уже открыта в этом браузере, подключение займёт несколько секунд.</p>
            <button
              className="primary-button auth-submit auth-submit--bridge"
              type="button"
              disabled={bridgeBusy}
              onClick={async () => {
                setBridgeBusy(true);
                setAuthError(null);
                const result = await crm.signInViaCrm();
                setBridgeBusy(false);
                if (result.error) { setAuthError(result.error); return; }
                setAuthOpen(false);
              }}
            >{bridgeBusy ? "Подключаем…" : "Подключить через открытую CRM"}</button>
            <div className="auth-divider"><span>или</span></div>
            <p className="auth-panel__fallback">Войдите отдельным аккаунтом CRM:</p>
            <label className="auth-field"><span>Email</span><input type="email" autoComplete="username" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
            <label className="auth-field"><span>Пароль</span><input type="password" autoComplete="current-password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required /></label>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button className="secondary-button auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Подключаем…" : "Войти и подключить CRM"}</button>
          </form>
        </div>
      )}
      {selected && <Drawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}