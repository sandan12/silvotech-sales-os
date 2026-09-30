import { useMemo, useState } from "react";
import { crmSnapshot, findClient } from "./crm";
import { Icons } from "./icons";
import { opportunities } from "./data/opportunities";
import type { Opportunity } from "./types";
import { useCrmConnection, type CrmConnectionMode } from "./useCrmConnection";

type View = "today" | "opportunities" | "result";

const nav = [
  { id: "today" as const, label: "Сегодня", icon: Icons.Today },
  { id: "opportunities" as const, label: "Возможности", icon: Icons.Opportunity },
  { id: "result" as const, label: "Результат", icon: Icons.Result },
];

function formatSnapshotDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function Confidence({ value }: { value: Opportunity["confidence"] }) {
  const tone =
    value === "Подтверждено" ? "success" : value === "Со слов клиента" ? "info" : "warning";
  return <span className={`confidence confidence--${tone}`}>{value}</span>;
}

function Fit({ value }: { value: number }) {
  const label = value >= 75 ? "Хорошее совпадение" : value >= 55 ? "Нужна проверка" : "Есть препятствие";
  return (
    <div className="fit" aria-label={`${label}: ${value}%`}>
      <div className="fit__top">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="fit__track">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function OpportunityCard({
  item,
  onOpen,
}: {
  item: Opportunity;
  onOpen: (item: Opportunity) => void;
}) {
  return (
    <article className="opportunity-card">
      <header>
        <div>
          <p className="eyebrow">{item.company}</p>
          <h3>{item.application}</h3>
        </div>
        <span className={`status status--${item.status.toLowerCase()}`}>{item.status}</span>
      </header>
      <p className="product">{item.product}</p>
      <Fit value={item.fit} />
      <div className="blocker">
        <span>Главное препятствие</span>
        <p>{item.blocker}</p>
      </div>
      <footer>
        <div>
          <span className="muted-label">Следующий шаг</span>
          <p>{item.nextAction}</p>
        </div>
        <button className="icon-button" onClick={() => onOpen(item)} aria-label={`Открыть ${item.company}`}>
          <Icons.Arrow />
        </button>
      </footer>
    </article>
  );
}

function CapturePanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"input" | "preview" | "saved">("input");
  const [text, setText] = useState(
    "Созвонился с Мартой из Aqua-Trend. Ждём цену на чёрный TPV на следующей неделе.",
  );
  const client = findClient("Aqua-Trend");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="capture-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="capture-panel__header">
          <div>
            <p className="eyebrow">Быстрое обновление</p>
            <h2 id="capture-title">Расскажите, что изменилось</h2>
          </div>
          <button className="ghost-icon" onClick={onClose} aria-label="Закрыть">
            <Icons.Close />
          </button>
        </header>

        {step === "input" && (
          <>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Сообщение об изменении"
            />
            <button className="record-button" type="button">
              <Icons.Mic />
              <span>Удерживайте, чтобы записать голосом</span>
            </button>
            <div className="capture-actions">
              <p>ИИ сначала покажет изменения. Ничего не запишется автоматически.</p>
              <button className="primary-button" onClick={() => setStep("preview")}>
                Разобрать сообщение
                <Icons.Spark />
              </button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="preview-callout">
              <Icons.Spark />
              <div>
                <strong>Найден клиент: {client?.name ?? "Aqua‑Trend"}</strong>
                <span>Совпадение по названию и истории CRM</span>
              </div>
            </div>
            <div className="change-list">
              <div>
                <span>Статус</span>
                <p>Ожидаем ответ закупщика</p>
              </div>
              <div>
                <span>Следующий шаг</span>
                <p>Получить цену чёрного TPV</p>
              </div>
              <div>
                <span>Срок</span>
                <p>Следующая неделя</p>
              </div>
              <div>
                <span>Источник</span>
                <p>Голосовая заметка менеджера</p>
              </div>
            </div>
            <div className="capture-actions">
              <button className="secondary-button" onClick={() => setStep("input")}>
                Исправить
              </button>
              <button className="primary-button" onClick={() => setStep("saved")}>
                <Icons.Check />
                Подтвердить изменения
              </button>
            </div>
          </>
        )}

        {step === "saved" && (
          <div className="success-state">
            <span className="success-state__icon">
              <Icons.Check />
            </span>
            <h3>Черновик подтверждён</h3>
            <p>
              В первой версии запись в CRM отключена. Изменение готово для будущей синхронизации.
            </p>
            <button
              className="primary-button"
              onClick={() => {
                onSaved();
                onClose();
              }}
            >
              Готово
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Today({
  onCapture,
  onOpen,
}: {
  onCapture: () => void;
  onOpen: (item: Opportunity) => void;
}) {
  const primary = opportunities[2]!;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Среда, 30 сентября</p>
          <h1>Три шага, которые приблизят заказы</h1>
          <p className="hero__copy">
            Система отделила действия от старых заметок и технических вопросов. Начните с
            подтверждённой возможности.
          </p>
        </div>
        <button className="capture-button" onClick={onCapture}>
          <span className="capture-button__icon">
            <Icons.Mic />
          </span>
          <span>
            <strong>Обновить голосом</strong>
            <small>Система сама разложит информацию</small>
          </span>
        </button>
      </section>

      <div className="today-grid">
        <section className="priority-panel">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Приоритет №1</p>
              <h2>{primary.company}</h2>
            </div>
            <Confidence value={primary.confidence} />
          </header>
          <h3>{primary.nextAction}</h3>
          <p>
            Товар уже прошёл первую проверку, все размеры были на складе. Сейчас нужно подтвердить
            регулярность спроса — это важнее нового холодного контакта.
          </p>
          <div className="priority-meta">
            <div>
              <span>Почему сейчас</span>
              <strong>Есть положительный опыт клиента</strong>
            </div>
            <div>
              <span>Ожидаемый результат</span>
              <strong>Параметры повторного заказа</strong>
            </div>
          </div>
          <button className="primary-button" onClick={() => onOpen(primary)}>
            Открыть возможность
            <Icons.Arrow />
          </button>
        </section>

        <aside className="queue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Дальше</p>
              <h2>Очередь решений</h2>
            </div>
            <span className="count-badge">2</span>
          </div>
          {opportunities.slice(0, 2).map((item, index) => (
            <button className="queue-item" key={item.id} onClick={() => onOpen(item)}>
              <span className="queue-item__number">0{index + 2}</span>
              <span>
                <strong>{item.company}</strong>
                <small>{item.nextAction}</small>
              </span>
              <Icons.Arrow />
            </button>
          ))}
        </aside>
      </div>
    </>
  );
}

function Opportunities({ onOpen }: { onOpen: (item: Opportunity) => void }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Активный портфель</p>
          <h1>Возможности, где есть следующий шаг</h1>
          <p>Не вся CRM — только клиенты, с которыми имеет смысл работать сейчас.</p>
        </div>
        <div className="portfolio-summary">
          <strong>{opportunities.length}</strong>
          <span>активные возможности</span>
        </div>
      </section>
      <section className="opportunity-grid">
        {opportunities.map((item) => (
          <OpportunityCard item={item} key={item.id} onOpen={onOpen} />
        ))}
      </section>
    </>
  );
}

function connectionLabel(mode: CrmConnectionMode) {
  if (mode === "live") return "Онлайн · только чтение";
  if (mode === "connecting") return "Подключение…";
  if (mode === "auth-required") return "Требуется вход";
  if (mode === "error") return "Ошибка подключения";
  return "Снимок · только чтение";
}

function Result({
  counts,
  mode,
}: {
  counts: { clients: number; activities: number; products: number };
  mode: CrmConnectionMode;
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Результат</p>
          <h1>Не активность, а движение к заказу</h1>
          <p>Первая версия показывает только показатели, которые подтверждаются источниками.</p>
        </div>
      </section>
      <section className="metrics">
        <article>
          <span>Активный портфель</span>
          <strong>2</strong>
          <p>уникальных клиента</p>
        </article>
        <article>
          <span>Подтверждённые потребности</span>
          <strong>3</strong>
          <p>без выдуманных объёмов</p>
        </article>
        <article>
          <span>Ближайшие действия</span>
          <strong>3</strong>
          <p>у каждого есть причина</p>
        </article>
        <article className="metric-muted">
          <span>Вклад продаж</span>
          <strong>—</strong>
          <p>нет подтверждённой себестоимости</p>
        </article>
      </section>
      <section className="evidence-panel">
        <div>
          <p className="eyebrow">Качество данных</p>
          <h2>Что система знает о своём источнике</h2>
        </div>
        <dl>
          <div>
            <dt>Снимок CRM</dt>
            <dd>{formatSnapshotDate(crmSnapshot.exportedAt)}</dd>
          </div>
          <div>
            <dt>Активных записей</dt>
            <dd>{counts.clients}</dd>
          </div>
          <div>
            <dt>Событий в истории</dt>
            <dd>{counts.activities}</dd>
          </div>
          <div>
            <dt>Режим подключения</dt>
            <dd>{connectionLabel(mode)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function Drawer({ item, onClose }: { item: Opportunity; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{item.company}</p>
            <h2>{item.application}</h2>
          </div>
          <button className="ghost-icon" onClick={onClose} aria-label="Закрыть">
            <Icons.Close />
          </button>
        </header>
        <Confidence value={item.confidence} />
        <Fit value={item.fit} />
        <section>
          <span className="muted-label">Наш вариант</span>
          <h3>{item.product}</h3>
        </section>
        <section>
          <span className="muted-label">Подтверждено</span>
          <ul className="fact-list">
            {item.facts.map((fact) => (
              <li key={fact}>
                <Icons.Check />
                {fact}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <span className="muted-label">Неизвестно</span>
          <ul className="unknown-list">
            {item.unknowns.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </section>
        <div className="drawer__action">
          <span>Следующий шаг</span>
          <strong>{item.nextAction}</strong>
          <small>{item.due}</small>
        </div>
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
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [saved, setSaved] = useState(false);
  const title = useMemo(() => nav.find((item) => item.id === view)?.label, [view]);
  const crm = useCrmConnection();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="SilvoTech Sales OS">
          <span className="brand__mark">S</span>
          <span>
            <strong>SilvoTech</strong>
            <small>Sales OS</small>
          </span>
        </div>
        <nav aria-label="Основная навигация">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar__status">
          <span className={crm.mode === "live" ? "live-dot" : "live-dot live-dot--muted"} />
          <div>
            <strong>{crm.mode === "live" ? "CRM подключена" : "CRM: безопасный режим"}</strong>
            <small>{connectionLabel(crm.mode)}</small>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="mobile-title">{title}</span>
          </div>
          <div className="topbar__right">
            {saved && <span className="saved-note">Черновик сохранён</span>}
            {crm.mode === "auth-required" && (
              <button className="auth-button" onClick={() => setAuthOpen(true)}>
                Войти в CRM
              </button>
            )}
            <button className="quick-capture" onClick={() => setCaptureOpen(true)}>
              <Icons.Mic />
              <span>Быстрое обновление</span>
            </button>
            <button
              className="avatar"
              aria-label={crm.user ? `Профиль ${crm.user.email ?? "пользователя"}` : "Профиль Sandan"}
              onClick={() => {
                if (crm.user) void crm.signOut();
              }}
              title={crm.user ? "Выйти" : undefined}
            >
              SC
            </button>
          </div>
        </header>

        <main>
          {view === "today" && (
            <Today onCapture={() => setCaptureOpen(true)} onOpen={setSelected} />
          )}
          {view === "opportunities" && <Opportunities onOpen={setSelected} />}
          {view === "result" && <Result counts={crm.counts} mode={crm.mode} />}
        </main>

        <nav className="mobile-nav" aria-label="Мобильная навигация">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "mobile-nav__item mobile-nav__item--active" : "mobile-nav__item"}
                onClick={() => setView(item.id)}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {captureOpen && (
        <CapturePanel onClose={() => setCaptureOpen(false)} onSaved={() => setSaved(true)} />
      )}
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
              if (result.error) {
                setAuthError(result.error);
                return;
              }
              setAuthPassword("");
              setAuthOpen(false);
            }}
          >
            <header className="capture-panel__header">
              <div>
                <p className="eyebrow">Безопасное подключение</p>
                <h2 id="auth-title">Вход в CRM</h2>
              </div>
              <button
                className="ghost-icon"
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Закрыть"
              >
                <Icons.Close />
              </button>
            </header>
            <p className="auth-panel__copy">
              Используйте тот же email и пароль, что и в существующей SilvoTech CRM.
            </p>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
            </label>
            <label className="auth-field">
              <span>Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
            </label>
            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}
            <button className="primary-button auth-submit" type="submit" disabled={authBusy}>
              {authBusy ? "Подключаем…" : "Войти и подключить CRM"}
            </button>
          </form>
        </div>
      )}
      {selected && <Drawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
