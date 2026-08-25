const ARABIC_STOP_WORDS = new Set([
  "في",
  "من",
  "على",
  "الى",
  "عن",
  "هل",
  "ما",
  "هو",
  "هي",
  "له",
  "لها",
  "لديه",
  "لديها",
  "هذا",
  "هذه",
  "مع",
  "او",
  "و",
  "ثم",
  "تم",
  "يتم",
  "طالب",
  "الطالب",
  "طالبه",
  "حاله",
  "حالة",
]);

const DIGIT_MAP = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const SYNONYMS = {
  زياره: ["تاشيره", "زائر", "هويه"],
  اقامه: ["مقيم", "اقامته"],
  ميلاد: ["مولود", "شهاده"],
  اهليه: ["خاص", "خصوصي", "رسوم"],
  انقطاع: ["منقطع", "ترك", "توقف"],
  وثائق: ["شهاده", "مستندات", "اوراق"],
  معادله: ["شهاده", "قادم", "خارج"],
  تحويل: ["نقل", "انتقال"],
};

export function normalizeArabic(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (digit) => DIGIT_MAP[digit])
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[ئىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[،؛؟!?.,:()\[\]{}\/\\|"'«»…–—_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(value) {
  return normalizeArabic(value)
    .split(" ")
    .filter((token) => token.length > 1 && !ARABIC_STOP_WORDS.has(token));
}

function expandedTokens(value) {
  const base = new Set(tokens(value));
  for (const token of [...base]) {
    for (const [root, related] of Object.entries(SYNONYMS)) {
      if (token.includes(root) || related.some((word) => token.includes(word))) {
        base.add(root);
        related.forEach((word) => base.add(word));
      }
    }
  }
  return base;
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalizeArabic(phrase)));
}

function getRule(rules, id) {
  return rules.find((rule) => rule.id === id);
}

function ruleAnswer(rule, overrides = {}) {
  return {
    kind: "answer",
    rule,
    status: overrides.status || rule.status,
    answer: overrides.answer || rule.answer,
    note: overrides.note || "",
    related: overrides.related || [],
  };
}

function clarification(question, options, note = "") {
  return { kind: "clarification", question, options, note };
}

function noExplicitText(answer, related = [], note = "") {
  return {
    kind: "not_found",
    status: "لا يوجد نص صريح",
    answer,
    related,
    note,
  };
}

function detectNationality(q) {
  if (includesAny(q, ["يمني", "يمنية", "اليمن"])) return "yemen";
  if (includesAny(q, ["سوداني", "سودانية", "السودان"])) return "sudan";
  if (includesAny(q, ["سوري", "سورية", "سوريا"])) return "syria";
  if (includesAny(q, ["أردني", "اردني", "أردنية", "الاردن"])) return "jordan";
  if (includesAny(q, ["سعودي", "سعودية"])) return "saudi";
  if (includesAny(q, ["جنسية أخرى", "جنسيه اخري", "غير يمني", "غير سوداني"])) return "other";
  return null;
}

function detectGuardianStatus(q) {
  const guardian = "(?:ولي الامر|الاب|الام|الوالد|الوالده)";
  const residency = "(?:اقامه|مقيم)";
  const visit = "(?:زياره|تاشيره زياره|تاشيره زائر|هويه زائر)";
  const negative = "(?:لا يحمل|ليس لديه|بدون|بلا|منتهي|منتهيه)";

  if (
    new RegExp(`${guardian}.{0,30}${negative}.{0,15}${residency}`).test(q) ||
    new RegExp(`${guardian}.{0,30}${visit}`).test(q) ||
    new RegExp(`${visit} (?:لولي الامر|للاب|للام|للوالد|للوالده)`).test(q)
  ) {
    return "not_resident";
  }

  if (
    new RegExp(`${guardian}.{0,30}(?:لديه|لها|له|يحمل|تحمل|ذو|ذات)? ?(?:اقامه ساريه|اقامه|مقيم)`).test(q) ||
    new RegExp(`(?:اقامه ساريه|مقيم).{0,30}${guardian}`).test(q)
  ) {
    return "resident";
  }

  return "unknown";
}

function extractAge(q) {
  const match = q.match(/(?:عمره|عمرها|العمر|بعمر)\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function genericScore(query, rule) {
  const q = normalizeArabic(query);
  const queryTokens = expandedTokens(query);
  const searchable = normalizeArabic(
    [rule.category, rule.title, rule.answer, rule.sourceText, ...(rule.keywords || [])].join(" "),
  );
  const searchableTokens = new Set(tokens(searchable));
  let score = 0;

  for (const keyword of rule.keywords || []) {
    const normalizedKeyword = normalizeArabic(keyword);
    if (normalizedKeyword && q.includes(normalizedKeyword)) score += 12;
  }

  const normalizedTitle = normalizeArabic(rule.title);
  if (normalizedTitle && q.includes(normalizedTitle)) score += 18;

  for (const token of queryTokens) {
    if (searchableTokens.has(token)) score += token.length >= 5 ? 2.4 : 1.4;
    else if (searchable.includes(token) && token.length >= 4) score += 0.8;
  }

  return score;
}

function relatedRules(rules, ids) {
  return ids.map((id) => getRule(rules, id)).filter(Boolean);
}

export function analyzeQuestion(question, rules) {
  const q = normalizeArabic(question);
  if (!q) {
    return noExplicitText("اكتب تفاصيل الحالة أولًا حتى أبحث في الدليل.");
  }

  const nationality = detectNationality(q);
  const hasVisit = includesAny(q, [
    "تأشيرة زيارة",
    "تاشيره زياره",
    "هوية زيارة",
    "هويه زياره",
    "هوية زائر",
    "هويه زائر",
    "زائر",
  ]);
  const hasSaudiBirthCertificate = includesAny(q, [
    "شهادة ميلاد سعودية",
    "شهاده ميلاد سعوديه",
    "شهادة ميلاد من السعودية",
    "مولود في السعودية ولديه شهادة ميلاد",
    "مولود بالسعودية ولديه شهادة ميلاد",
  ]);
  const hasFeeDefault = includesAny(q, [
    "متعثر",
    "لم يسدد الرسوم",
    "عدم سداد الرسوم",
    "رسوم مدرسة أهلية",
    "رسوم المدرسه الاهليه",
    "نقل من أهلي",
    "نقل من اهلي",
  ]);
  const guardianStatus = detectGuardianStatus(q);

  if (nationality === "syria" && hasVisit && hasFeeDefault) {
    return ruleAnswer(getRule(rules, "private-fee-default"));
  }

  if ((nationality === "yemen" || nationality === "sudan") && hasVisit) {
    return ruleAnswer(getRule(rules, "visitor-yemen-sudan"), {
      note: "هذا مسار خاص ورد صراحة لليمنيين والسودانيين القادمين بتأشيرة زيارة.",
    });
  }

  if (hasSaudiBirthCertificate) {
    const birthRule = getRule(rules, "saudi-birth-certificate");
    if (guardianStatus === "resident") {
      return ruleAnswer(birthRule, {
        note: hasVisit
          ? "وجود تأشيرة زيارة للطالب لا يلغي هذا النص ما دام شرط إقامة ولي الأمر متحققًا."
          : "شرط إقامة ولي الأمر متحقق بحسب وصف الحالة.",
      });
    }
    if (guardianStatus === "not_resident") {
      return ruleAnswer(birthRule, {
        status: "الشرط غير متحقق",
        answer:
          "لا يثبت القبول بهذه الفقرة؛ لأنها تشترط وجود إقامة لولي الأمر، بينما وصف الحالة يذكر أن ولي الأمر زائر أو لا يحمل إقامة. ولم يرد في الدليل مسار قبول آخر لهذه الحالة لمجرد وجود شهادة ميلاد سعودية.",
        note: "الحكم هنا هو عدم انطباق النص، وليس رفضًا عامًا مستندًا إلى لائحة خارج الدليل.",
      });
    }
    return clarification(
      "هل يحمل ولي الأمر إقامة سارية؟",
      [
        { label: "نعم، لديه إقامة", append: " وولي الأمر لديه إقامة سارية" },
        { label: "لا، ولي الأمر زائر", append: " وولي الأمر بتأشيرة زيارة ولا يحمل إقامة" },
      ],
      "هذه المعلومة شرط صريح في الفقرة الثانية من الصفحة 19.",
    );
  }

  if (hasVisit && !nationality) {
    return clarification(
      "ما جنسية الطالب؟",
      [
        { label: "يمني", append: " والطالب يمني" },
        { label: "سوداني", append: " والطالب سوداني" },
        { label: "جنسية أخرى", append: " والطالب من جنسية أخرى غير يمنية أو سودانية" },
      ],
      "الدليل خصّ اليمنيين والسودانيين بنص صريح للقادمين بتأشيرة زيارة.",
    );
  }

  if (hasVisit && nationality && !["yemen", "sudan"].includes(nationality)) {
    return noExplicitText(
      "لا يوجد في الدليل نص يجيز قبول طالب من هذه الجنسية لمجرد حمله تأشيرة زيارة. النص الصريح للزائرين يخص اليمنيين والسودانيين، كما يوجد نص مستقل لمن لا يحمل إقامة ويملك شهادة ميلاد سعودية بشرط إقامة ولي الأمر.",
      relatedRules(rules, ["visitor-yemen-sudan", "saudi-birth-certificate"]),
      "إذا كانت لدى الطالب شهادة ميلاد سعودية، اذكرها مع حالة إقامة ولي الأمر لإعادة فحص الحالة.",
    );
  }

  const age = extractAge(q);
  const dropout = includesAny(q, ["انقطاع", "منقطع", "ترك الدراسة", "توقف عن الدراسة"]);
  const overThreeYears = includesAny(q, [
    "أكثر من ثلاث سنوات",
    "اكثر من ثلاث سنوات",
    "أربع سنوات",
    "اربع سنوات",
    "خمس سنوات",
    "5 سنوات",
    "4 سنوات",
  ]);
  const underThreeYears = includesAny(q, [
    "أقل من ثلاث سنوات",
    "اقل من ثلاث سنوات",
    "سنتين",
    "سنتان",
    "سنة واحدة",
    "سنه واحده",
  ]);

  if (dropout && (age !== null ? age > 21 : includesAny(q, ["فوق 21", "أكبر من 21", "اكثر من 21"]))) {
    return ruleAnswer(getRule(rules, "dropout-over-21"));
  }
  if (dropout && overThreeYears) {
    return ruleAnswer(getRule(rules, "dropout-three-plus-under-21"));
  }
  if (dropout && underThreeYears) {
    return ruleAnswer(getRule(rules, "dropout-less-three"));
  }

  const scores = rules
    .map((rule) => ({ rule, score: genericScore(question, rule) }))
    .sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (!best || best.score < 4.2) {
    return noExplicitText(
      "لم أجد في الدليل نصًا صريحًا يطابق تفاصيل الحالة. أعد صياغة السؤال مع ذكر الجنسية، نوع الهوية أو التأشيرة، حالة إقامة ولي الأمر، الوثائق المتاحة، العمر، والصف الدراسي.",
      relatedRules(rules, ["level-placement-other-cases"]),
      "الحالات غير المنصوص عليها في تحديد المستوى تُرفع إلى الجهة المختصة وفق الصفحة 12، البند 6.",
    );
  }

  const related = scores
    .slice(1)
    .filter((entry) => entry.score >= Math.max(5.5, best.score * 0.72))
    .slice(0, 2)
    .map((entry) => entry.rule);

  return ruleAnswer(best.rule, { related });
}

export function citationLabel(rule) {
  return `صفحة ${rule.page} — ${rule.paragraph}`;
}
