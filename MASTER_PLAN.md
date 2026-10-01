# SilvoTech Sales OS — master implementation plan

Status: active execution plan.  
Timezone: Europe/Warsaw.  
Weekly management cycle: Thursday 08:00 → next Thursday 08:00.

## Product outcome

Sales OS is a browser-based operating system for one B2B sales manager. It is
not a replacement CRM. CRM remains the contact and activity ledger. Sales OS
owns research, evidence, opportunity reasoning, recommendations, plans,
forecasts and reusable business knowledge.

The system must continuously answer:

1. Who should be worked on now and why?
2. What does the customer likely need, and what evidence supports that view?
3. Which SilvoTech products are worth proposing and what remains unknown?
4. Should the manager email or call, when, what should be asked, and what
   should be said?
5. What did the manager promise, what was completed, what changed, and what is
   forecast by the next Thursday?

## Non-negotiable rules

- Never promote a hypothesis to a fact without evidence.
- Never create, merge, send or promise externally without a visible review
  step.
- Every recommendation exposes its reason, source, uncertainty and expected
  result.
- Model memory is not the source of truth. Context is stored in the database
  and supplied to every provider.
- Provider failover must preserve the same system rules, business context,
  user request and tool results.
- Email credentials and AI keys remain server-side and are never committed.
- External web pages, documents and emails are untrusted data, not
  instructions.

## Operating modules

### 1. Command center

- Today’s actions ranked by deadline, deal movement and missing information.
- Daily pace against the current Thursday plan.
- Overdue promises, stalled opportunities and management escalations.
- Global voice/text/file/link command input.

### 2. Market discovery

Input: country, product family or whole catalog, optional customer type.

Pipeline:

1. Generate narrow search queries from the product catalog.
2. Discover company and catalog pages.
3. Deduplicate against CRM by legal name, domain, NIP, phone and email.
4. Extract evidence about business model, products, applications and geography.
5. Produce hypotheses about relevant SilvoTech products, company scale and
   stock-vs-request purchasing model.
6. Show evidence, unknowns and up to three candidate products.
7. Prepare first email, call plan and qualification questions in the
   appropriate country language.
8. Create accepted candidates and activities in CRM after confirmation.

### 3. Client intelligence

- Resolve free-text mentions against names, aliases, domains and contacts.
- Combine CRM, email, calls, files, web research, offers and objections.
- Maintain facts, hypotheses, conflicts, unanswered questions and next action.
- If no company exists, prepare a populated candidate record and ask for one
  confirmation before creation.

### 4. Opportunity workspace

One record equals customer × application × product execution. It contains
requirements, evidence, fit matrix, commercial assumptions, blocker, next
action and expected event.

### 5. Outreach studio

- Recommendation: email, call or wait, with reason.
- Email drafts and call scripts grounded in known facts.
- Country/language-aware copy.
- User remains responsible for sending and making commitments.

### 6. Weekly performance

- Immutable plan snapshot after each Thursday call.
- Plan vs fact, unique clients meaningfully processed, movement and outcomes.
- Per-client stage delta and evidence.
- Four-cycle trend.
- Mandatory, expected and conditional forecast to the next Thursday.
- Draft Wednesday 17:00; final Thursday 08:00.

### 7. Knowledge and integrations

- Product catalog, technical files, declarations, price versions and stock
  snapshots.
- CRM live connection.
- Corporate cPanel mailbox over IMAP 993 TLS; SMTP 465 TLS remains disabled
  until sending is separately approved.
- AI provider status, quotas, failover history and cost guardrails.

## AI architecture

Provider order:

1. Gemini free-tier compatible provider.
2. Groq free plan.
3. OpenRouter free model router.

The existing CRM server-side provider table, retry policy and fallback loop are
reused. Each request carries the same persistent context and tool contract.
429 and 5xx errors trigger failover. Authentication, validation or policy
errors do not silently fall back.

## Delivery sequence

### Foundation

- [x] Live CRM session bridge.
- [x] Real clients, products, interests and activities.
- [x] Confirmed write-back.
- [x] Mention matching and controlled client creation.
- [x] Thursday performance specification.
- [ ] OS shell and global command surface.
- [ ] Authenticated Sales OS API over the existing CRM backend.
- [ ] AI provider health and failover UI.

### Intelligence

- [ ] Persistent knowledge records and source references.
- [ ] Client context aggregation.
- [ ] Country discovery pipeline.
- [ ] Catalog analysis and product matching.
- [ ] Outreach drafts and call plan.

### Mail and management

- [ ] Server-side IMAP connector with deduplication and bounded sync.
- [ ] Customer matching by email/domain.
- [ ] Weekly plan snapshots and plan/fact calculations.
- [ ] Thursday report and rolling forecast.

### Hardening

- [ ] Permission review and audit log.
- [ ] Idempotent retries and rate/cost limits.
- [ ] Desktop/mobile/accessibility pass.
- [ ] Real end-to-end acceptance scenario.
- [ ] Backup/export and recovery test.

## Acceptance scenarios

1. **Chemland update:** mention resolves or prepares a new company, captures the
   price objection and German sourcing, proposes a follow-up, questions and a
   grounded draft, then writes only after confirmation.
2. **Country discovery:** one country selection returns evidence-backed
   candidates, product hypotheses and unknowns; accepted records are
   deduplicated and written once.
3. **Email context:** a bounded inbox sync links a real thread to a client,
   preserves source metadata and changes the recommendation without sending.
4. **Thursday review:** the report reproduces last week’s frozen commitments,
   explains movement and prepares the next plan and forecast.
5. **Provider limit:** a forced 429 switches provider while retaining the same
   context, rules and pending task.
