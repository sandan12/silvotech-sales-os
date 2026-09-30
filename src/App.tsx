import { useEffect, useMemo, useRef, useState } from "react";
import { crmSnapshot } from "./crm";
import { Icons } from "./icons";
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

type View = "today" | "opportunities" | "result";
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
  { id: "today" as const, label: "Сегодня", icon: Icons.Today },
  { id: "opportunities" as const, label: "Возможности", icon: Icons.Opportunity },
  { id: "result" as const, label: "Результат", icon: Icons.Result },
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

function inferNextActionAt(text: string) {
  const value = text.toLowerCase();
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  let matched = true;
  if (/послезавтра/.test(value)) date.setDate(date.getDate() + 2);
  else if (/завтра/.test(value)) date.setDate(date.getDate() + 1);
  else if (/сегодня/.test(value)) date.setHours(new Date().getHours() + 1, 0, 0, 0);
  else if (/следующ(ей|ую) недел/.test(value)) date.setDate(date.getDate() + 7);
  else {
    const days = value.match(/через\s+(\d+)\s+дн/);
    if (days) date.setDate(date.getDate() + Number(days[1]));
    else matched = false;
  }
  return matched ? date.toISOString() : null;
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
  const [selectedClientId, setSelectedClientId] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const type = inferActivityType(text);
  const nextActionAt = inferNextActionAt(text);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function detectClient() {
    const normalized = text.toLocaleLowerCase("ru");
    const detected = [...clients]
      .sort((a, b) => b.name.length - a.name.length)
      .find((item) => normalized.includes(item.name.toLocaleLowerCase("ru")));
    setSelectedClientId(detected?.id ?? "");
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
    if (!selectedClientId) {
      setSaveError("Выберите клиента перед подтверждением.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await save({ clientId: selectedClientId, content: text.trim(), type, nextActionAt });
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
              <div><strong>{selectedClientId ? "Клиент найден — проверьте" : "Выберите клиента"}</strong><span>Автосовпадение основано только на названии из CRM</span></div>
            </div>
            <label className="preview-field">
              <span>Клиент</span>
              <select aria-label="Клиент" value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                <option value="">Не выбран</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <div className="change-list">
              <div><span>Запись в историю</span><p>{text.trim()}</p></div>
              <div><span>Тип события</span><p>{activityLabels[type]}</p></div>
              <div><span>Следующее действие</span><p>{nextActionAt ? formatDate(nextActionAt, true) : "Дата не найдена — текущий срок CRM не изменится"}</p></div>
              <div><span>Источник</span><p>Sales OS · {source}</p></div>
            </div>
            {mode !== "live" && <p className="save-error" role="alert">Для записи сначала подключите CRM.</p>}
            {saveError && <p className="save-error" role="alert">{saveError}</p>}
            <div className="capture-actions">
              <button className="secondary-button" onClick={() => setStep("input")}>Исправить</button>
              <button className="primary-button" onClick={confirm} disabled={saving || mode !== "live" || !selectedClientId}>
                <Icons.Check />{saving ? "Сохраняем…" : "Подтвердить и записать"}
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
  interests,
  stages,
  mode,
}: {
  counts: { clients: number; activities: number; products: number };
  clients: CrmClient[];
  interests: CrmInterest[];
  stages: CrmStage[];
  mode: CrmConnectionMode;
}) {
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
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Результат</p><h1>Только измеримое движение</h1><p>Показатели рассчитаны из текущих записей CRM. Финансовый вклад не считается без себестоимости.</p></div>
      </section>
      <section className="metrics">
        <article><span>Клиенты с активной потребностью</span><strong>{activeClientIds.size}</strong><p>уникальных клиентов</p></article>
        <article><span>Подтверждённые потребности</span><strong>{interests.length}</strong><p>связок клиент–товар</p></article>
        <article><span>Просроченные действия</span><strong>{overdue}</strong><p>по полю следующего шага</p></article>
        <article className="metric-muted"><span>Вклад продаж</span><strong>—</strong><p>нет подтверждённой себестоимости</p></article>
      </section>
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
          {view === "opportunities" && <Opportunities items={opportunities} mode={crm.mode} onOpen={setSelected} />}
          {view === "result" && <Result counts={crm.counts} clients={crm.clients} interests={crm.interests} stages={crm.stages} mode={crm.mode} />}
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