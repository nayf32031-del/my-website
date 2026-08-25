import { analyzeQuestion, citationLabel } from "./engine.js";

const elements = {
  question: document.querySelector("#question"),
  ask: document.querySelector("#ask-button"),
  clear: document.querySelector("#clear-button"),
  count: document.querySelector("#character-count"),
  quickList: document.querySelector("#quick-list"),
  result: document.querySelector("#result-panel"),
  toast: document.querySelector("#toast"),
};

let guide = null;
let currentResult = null;
let toastTimer = null;

const icons = {
  info: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 8.5v5M10 6v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  external: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11 4h5v5M16 4l-7 7M8 6H4.5v9.5H14V12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  copy: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 6V4.5H4.5V13H6" stroke="currentColor" stroke-width="1.5"/></svg>`,
  print: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 7V3.5h8V7M5 14H3.5V8.5h13V14H15M6 11h8v5.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function statusClass(status = "") {
  if (status.includes("غير متحقق") || status.includes("لا يوجد")) return "danger";
  if (
    status.includes("استثناء") ||
    status.includes("رفع") ||
    status.includes("مكمل") ||
    status.includes("تحقق")
  ) return "warning";
  return "";
}

function setQuestion(value, submit = false) {
  elements.question.value = value;
  updateCount();
  elements.question.focus();
  if (submit) askGuide();
}

function updateCount() {
  elements.count.textContent = `${elements.question.value.length} / 800`;
}

function renderQuickQuestions(questions) {
  elements.quickList.innerHTML = questions
    .slice(0, 6)
    .map(
      (question) =>
        `<button class="quick-chip" type="button" title="${escapeHtml(question)}">${escapeHtml(question)}</button>`,
    )
    .join("");

  elements.quickList.querySelectorAll(".quick-chip").forEach((button, index) => {
    button.addEventListener("click", () => setQuestion(questions[index], true));
  });
}

function relatedMarkup(related = []) {
  if (!related.length) return "";
  return `
    <section class="related-block">
      <h3>نصوص مرتبطة قد تفيد في استكمال الحالة</h3>
      <div class="related-list">
        ${related
          .map(
            (rule) => `
              <button class="related-item" type="button" data-rule-id="${escapeHtml(rule.id)}">
                <span>${escapeHtml(rule.title)}</span>
                <small>${escapeHtml(citationLabel(rule))}</small>
              </button>`,
          )
          .join("")}
      </div>
    </section>`;
}

function sourceMarkup(rule) {
  if (!rule) return "";
  return `
    <section class="source-block">
      <h3>المرجع الحاكم في الدليل</h3>
      <div class="citation-card">
        <div class="page-number"><span>صفحة</span><strong>${escapeHtml(rule.page)}</strong></div>
        <div class="citation-copy">
          <strong>${escapeHtml(rule.paragraph)}</strong>
          <p>${escapeHtml(rule.sourceText)}</p>
        </div>
      </div>
      <div class="result-actions">
        <a class="action-button" href="./documents/admission-guide.pdf#page=${encodeURIComponent(rule.page)}" target="_blank" rel="noopener">
          ${icons.external}<span>فتح الصفحة الأصلية</span>
        </a>
        <button class="action-button" type="button" data-action="copy">${icons.copy}<span>نسخ الإجابة</span></button>
        <button class="action-button" type="button" data-action="print">${icons.print}<span>طباعة</span></button>
      </div>
    </section>`;
}

function renderAnswer(result) {
  const rule = result.rule;
  const steps = rule.steps?.length
    ? `
      <section class="steps-block">
        <h3>الشروط والخطوات الواردة</h3>
        <ol class="steps-list">
          ${rule.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </section>`
    : "";

  elements.result.innerHTML = `
    <article class="result-content">
      <div class="result-heading">
        <div>
          <div class="result-kicker">الحكم المستخرج من الدليل</div>
          <h2>${escapeHtml(rule.title)}</h2>
        </div>
        <span class="status-badge ${statusClass(result.status)}">${escapeHtml(result.status)}</span>
      </div>

      <div class="answer-box">
        <span class="answer-label">الخلاصة</span>
        <p>${escapeHtml(result.answer)}</p>
      </div>
      ${result.note ? `<div class="result-note">${icons.info}<span>${escapeHtml(result.note)}</span></div>` : ""}
      ${steps}
      ${sourceMarkup(rule)}
      ${relatedMarkup(result.related)}
    </article>`;
  bindResultActions();
}

function renderClarification(result) {
  elements.result.innerHTML = `
    <article class="clarification-card">
      <div class="clarification-icon" aria-hidden="true">؟</div>
      <div class="result-kicker">معلومة لازمة قبل الحكم</div>
      <h2>${escapeHtml(result.question)}</h2>
      <p>${escapeHtml(result.note || "اختر الإجابة الأقرب للحالة.")}</p>
      <div class="clarification-options">
        ${result.options
          .map(
            (option, index) =>
              `<button class="clarification-option" type="button" data-option-index="${index}">${escapeHtml(option.label)}</button>`,
          )
          .join("")}
      </div>
    </article>`;

  elements.result.querySelectorAll(".clarification-option").forEach((button) => {
    button.addEventListener("click", () => {
      const option = result.options[Number(button.dataset.optionIndex)];
      const nextQuestion = `${elements.question.value.trim()}${option.append}`;
      setQuestion(nextQuestion);
      askGuide();
    });
  });
}

function renderNotFound(result) {
  elements.result.innerHTML = `
    <article class="not-found-card">
      <div class="result-heading">
        <div>
          <div class="result-kicker">نتيجة البحث في الدليل</div>
          <h2>لم يرد حكم مطابق صراحة</h2>
        </div>
        <span class="status-badge danger">${escapeHtml(result.status)}</span>
      </div>
      <div class="answer-box">
        <span class="answer-label">الخلاصة المنضبطة</span>
        <p>${escapeHtml(result.answer)}</p>
      </div>
      ${result.note ? `<div class="result-note">${icons.info}<span>${escapeHtml(result.note)}</span></div>` : ""}
      ${relatedMarkup(result.related)}
    </article>`;
  bindResultActions();
}

function answerAsText() {
  if (!currentResult || currentResult.kind !== "answer") return "";
  const { rule, status, answer } = currentResult;
  const steps = rule.steps?.length
    ? `\n\nالشروط والخطوات:\n${rule.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
    : "";
  return `${rule.title}\nالحكم: ${status}\n${answer}${steps}\n\nالمرجع: ${citationLabel(rule)}\nالنص الحاكم: ${rule.sourceText}\n\nالمصدر: دليل عمليات القبول في المدارس – التعليم الحكومي.`;
}

function bindResultActions() {
  elements.result.querySelector('[data-action="copy"]')?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(answerAsText());
      showToast("تم نسخ الإجابة مع المرجع");
    } catch {
      showToast("تعذر النسخ التلقائي؛ حدّد النص وانسخه يدويًا");
    }
  });

  elements.result.querySelector('[data-action="print"]')?.addEventListener("click", () => window.print());

  elements.result.querySelectorAll(".related-item").forEach((button) => {
    button.addEventListener("click", () => {
      const rule = guide.rules.find((entry) => entry.id === button.dataset.ruleId);
      if (!rule) return;
      currentResult = { kind: "answer", rule, status: rule.status, answer: rule.answer, note: "", related: [] };
      renderAnswer(currentResult);
      elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function rememberQuestion(question) {
  try {
    const key = "admission-guide-recent-questions";
    const old = JSON.parse(localStorage.getItem(key) || "[]");
    const next = [question, ...old.filter((item) => item !== question)].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // التخزين المحلي ميزة مساعدة فقط؛ لا يؤثر تعطله في الإجابة.
  }
}

function askGuide() {
  const question = elements.question.value.trim();
  if (!guide) {
    showToast("جاري تحميل قاعدة الدليل، حاول بعد لحظة");
    return;
  }
  if (!question) {
    elements.question.focus();
    showToast("اكتب تفاصيل الحالة أولًا");
    return;
  }

  currentResult = analyzeQuestion(question, guide.rules);
  rememberQuestion(question);

  if (currentResult.kind === "clarification") renderClarification(currentResult);
  else if (currentResult.kind === "not_found") renderNotFound(currentResult);
  else renderAnswer(currentResult);

  if (window.matchMedia("(max-width: 920px)").matches) {
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function initialize() {
  try {
    const response = await fetch("./data/guide-rules.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    guide = await response.json();
    renderQuickQuestions(guide.quickQuestions || []);
  } catch (error) {
    elements.result.innerHTML = `
      <article class="not-found-card">
        <div class="result-heading"><h2>تعذر تحميل بيانات الدليل</h2><span class="status-badge danger">خطأ تقني</span></div>
        <div class="answer-box"><p>تأكد من رفع مجلدات التطبيق كاملة، ثم أعد تحميل الصفحة.</p></div>
      </article>`;
    console.error(error);
  }
}

elements.ask.addEventListener("click", askGuide);
elements.clear.addEventListener("click", () => {
  setQuestion("");
  currentResult = null;
  elements.result.innerHTML = `
    <div class="empty-result" id="empty-result">
      <span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M12 7h19l7 7v27H12z" stroke="currentColor" stroke-width="2"/><path d="M31 7.5V15h7M18 22h14M18 28h14M18 34h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      <h2>تظهر الإجابة الموثقة هنا</h2>
      <p>ستشمل الحكم، الشروط أو الخطوات، رقم الصفحة، اسم الفقرة، والنص الحاكم.</p>
      <div class="empty-checks"><span>صفحة محددة</span><span>فقرة محددة</span><span>النص الأصلي</span></div>
    </div>`;
});
elements.question.addEventListener("input", updateCount);
elements.question.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") askGuide();
});
document.querySelectorAll(".topic-card").forEach((card) => {
  card.addEventListener("click", () => {
    setQuestion(card.dataset.question || "", true);
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

initialize();
