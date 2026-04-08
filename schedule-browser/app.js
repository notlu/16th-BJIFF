const data = window.FESTIVAL_DATA || null;

const state = {
  selectedDate: null,
  selectedCinemaId: "all",
  selectedUnit: "all",
  searchTerm: "",
  selectedScreeningId: null,
};

const runtime = {
  screenings: [],
  screeningMap: new Map(),
  cinemaMap: new Map(),
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  if (!data) {
    document.body.innerHTML = "<main style='padding:24px;font-family:sans-serif'>未找到排片数据，请先生成 data/festival-data.js。</main>";
    return;
  }

  prepareRuntimeData();
  captureElements();
  populateControls();
  buildHeroStats();
  attachEvents();

  state.selectedDate = data.dates[0];
  state.selectedScreeningId = runtime.screenings[0]?.id || null;
  renderAll();
});

function prepareRuntimeData() {
  runtime.screenings = data.screenings.map((screening) => {
    const item = {
      ...screening,
      startAtMs: parseIsoToLocalMs(screening.startAt),
      normalizedFilmTitle: normalizeText(screening.filmTitle),
      normalizedCinemaName: normalizeText(screening.cinemaName),
      normalizedActivity: normalizeText(screening.activitySummary || ""),
    };
    runtime.screeningMap.set(item.id, item);
    return item;
  });

  data.cinemas.forEach((cinema) => runtime.cinemaMap.set(cinema.id, cinema));
}

function captureElements() {
  [
    "hero-stats",
    "filter-date",
    "filter-cinema",
    "filter-unit",
    "filter-search",
    "reset-filters",
    "day-summary-grid",
    "day-summary",
    "timeline",
    "screening-detail",
    "screening-list",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function populateControls() {
  setSelectOptions(
    elements["filter-date"],
    data.dates.map((date) => ({ value: date, label: formatDateLabel(date) })),
  );

  setSelectOptions(elements["filter-cinema"], [
    { value: "all", label: "全部影院" },
    ...data.cinemas.map((cinema) => ({
      value: cinema.id,
      label: `${cinema.name} · ${cinema.zoneLabel}`,
    })),
  ]);

  setSelectOptions(elements["filter-unit"], [
    { value: "all", label: "全部单元" },
    ...data.units.map((unit) => ({ value: unit, label: unit })),
  ]);

  elements["filter-date"].value = data.dates[0];
}

function buildHeroStats() {
  const cards = [
    { value: data.summary.screeningCount, label: "主表场次" },
    { value: data.summary.filmCount, label: "影片数" },
    { value: data.summary.cinemaCount, label: "影院数" },
    { value: data.summary.dateCount, label: "展映天数" },
  ];

  elements["hero-stats"].innerHTML = cards
    .map(
      (card) => `
        <div class="stat-card">
          <strong>${escapeHtml(String(card.value))}</strong>
          <span>${escapeHtml(card.label)}</span>
        </div>
      `,
    )
    .join("");
}

function attachEvents() {
  elements["filter-date"].addEventListener("change", (event) => {
    state.selectedDate = event.target.value;
    syncSelection();
    renderAll();
  });

  elements["filter-cinema"].addEventListener("change", (event) => {
    state.selectedCinemaId = event.target.value;
    syncSelection();
    renderAll();
  });

  elements["filter-unit"].addEventListener("change", (event) => {
    state.selectedUnit = event.target.value;
    syncSelection();
    renderAll();
  });

  elements["filter-search"].addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    syncSelection();
    renderAll();
  });

  elements["reset-filters"].addEventListener("click", () => {
    state.selectedDate = data.dates[0];
    state.selectedCinemaId = "all";
    state.selectedUnit = "all";
    state.searchTerm = "";

    elements["filter-date"].value = state.selectedDate;
    elements["filter-cinema"].value = state.selectedCinemaId;
    elements["filter-unit"].value = state.selectedUnit;
    elements["filter-search"].value = "";

    syncSelection();
    renderAll();
  });
}

function syncSelection() {
  const screenings = getFilteredScreenings();
  if (!screenings.find((item) => item.id === state.selectedScreeningId)) {
    state.selectedScreeningId = screenings[0]?.id || null;
  }
}

function getFilteredScreenings() {
  const query = normalizeText(state.searchTerm);
  return runtime.screenings.filter((screening) => {
    if (screening.date !== state.selectedDate) return false;
    if (state.selectedCinemaId !== "all" && screening.cinemaId !== state.selectedCinemaId) return false;
    if (state.selectedUnit !== "all" && screening.unit !== state.selectedUnit) return false;
    if (!query) return true;

    const haystack = [
      screening.normalizedFilmTitle,
      screening.normalizedCinemaName,
      normalizeText(screening.unit),
      screening.normalizedActivity,
    ].join(" ");
    return haystack.includes(query);
  });
}

function renderAll() {
  renderSummary();
  renderTimeline();
  renderDetail();
  renderList();
}

function renderSummary() {
  const screenings = getFilteredScreenings();
  const uniqueFilms = new Set(screenings.map((item) => item.filmTitle));
  const uniqueCinemas = new Set(screenings.map((item) => item.cinemaId));
  const activityCount = screenings.filter((item) => item.hasActivity).length;
  const earliest = screenings[0]?.startTime || "--:--";
  const latest = screenings.length ? screenings[screenings.length - 1].endTimeBase : "--:--";

  const summaryItems = [
    { value: screenings.length, label: "场次" },
    { value: uniqueFilms.size, label: "影片" },
    { value: uniqueCinemas.size, label: "影院" },
    { value: activityCount, label: "含活动" },
    { value: earliest, label: "最早开场" },
    { value: latest, label: "最晚散场" },
  ];

  elements["day-summary-grid"].innerHTML = summaryItems
    .map(
      (item) => `
        <div class="summary-item">
          <strong>${escapeHtml(String(item.value))}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `,
    )
    .join("");

  elements["day-summary"].textContent = screenings.length
    ? `${formatDateLabel(state.selectedDate)} · ${screenings.length} 场`
    : `${formatDateLabel(state.selectedDate)} · 当前没有匹配场次`;
}

function renderTimeline() {
  const screenings = getFilteredScreenings();
  if (!screenings.length) {
    elements["timeline"].innerHTML = `<div class="empty-state" style="padding:20px">当前筛选条件下没有场次。</div>`;
    return;
  }

  const grouped = groupBy(screenings, (item) => item.cinemaId);
  const cinemas = Array.from(grouped.keys())
    .map((cinemaId) => runtime.cinemaMap.get(cinemaId))
    .filter(Boolean)
    .sort((a, b) => {
      const aStart = grouped.get(a.id).reduce((min, item) => Math.min(min, item.startMinuteOfDay), 9999);
      const bStart = grouped.get(b.id).reduce((min, item) => Math.min(min, item.startMinuteOfDay), 9999);
      return aStart - bStart || a.name.localeCompare(b.name, "zh-Hans-CN");
    });

  const dayStartMin = 9 * 60;
  const dayEndMin = 24 * 60;
  const pxPerMin = 1.32;
  const laneWidth = Math.round((dayEndMin - dayStartMin) * pxPerMin);

  const hourMarks = [];
  for (let hour = 9; hour <= 24; hour += 1) {
    const left = Math.round((hour * 60 - dayStartMin) * pxPerMin);
    hourMarks.push(
      `<div class="hour-mark" style="left:${left}px"><span>${String(hour).padStart(2, "0")}:00</span></div>`,
    );
  }

  const rows = cinemas
    .map((cinema) => {
      const rowItems = grouped
        .get(cinema.id)
        .slice()
        .sort((a, b) => a.startAtMs - b.startAtMs || a.filmTitle.localeCompare(b.filmTitle, "zh-Hans-CN"));

      const layout = buildOverlapLayout(rowItems);
      const rowHeight = Math.max(112, 108 + layout.maxLevel * 26);

      const cards = layout.items
        .map(({ screening, level }) => {
          const left = Math.round((screening.startMinuteOfDay - dayStartMin) * pxPerMin);
          const width = Math.max(Math.round(screening.runtimeMin * pxPerMin), 128);
          const top = 12 + level * 24;
          const color = colorFromUnit(screening.unit);
          const classes = [
            "screening-card",
            screening.id === state.selectedScreeningId ? "selected" : "",
            screening.hasActivity ? "has-activity" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return `
            <button
              class="${classes}"
              style="left:${left}px;top:${top}px;width:${width}px;background:${color.background};border-color:${color.border};z-index:${level + 1}"
              data-screening-id="${escapeHtml(screening.id)}"
              title="${escapeHtml(screening.filmTitle)}"
            >
              <div class="screening-time">${escapeHtml(screening.startTime)} · ${escapeHtml(screening.endTimeBase)}</div>
              <div class="screening-title">${escapeHtml(screening.filmTitle)}</div>
              <div class="screening-meta">${escapeHtml(`${screening.runtimeMin} 分钟 · ${screening.hall}`)}</div>
              ${
                screening.hasActivity
                  ? `<div class="screening-activity">${escapeHtml(screening.activitySummary)}</div>`
                  : ""
              }
            </button>
          `;
        })
        .join("");

      return `
        <div class="timeline-row" style="min-height:${rowHeight}px">
          <div class="timeline-label">
            <strong>${escapeHtml(cinema.name)}</strong>
            <span>${escapeHtml(`${cinema.zoneLabel} · ${rowItems.length} 场`)}</span>
          </div>
          <div class="timeline-lane" style="width:${laneWidth}px;height:${rowHeight}px">
            ${cards}
          </div>
        </div>
      `;
    })
    .join("");

  elements["timeline"].innerHTML = `
    <div class="timeline">
      <div class="timeline-ruler">
        <div class="timeline-ruler-label">影院 / 片区</div>
        <div class="timeline-hours" style="width:${laneWidth}px">${hourMarks.join("")}</div>
      </div>
      ${rows}
    </div>
  `;

  elements["timeline"].querySelectorAll("[data-screening-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScreeningId = button.dataset.screeningId;
      renderTimeline();
      renderDetail();
      scrollSelectedListCard();
    });
  });
}

function renderDetail() {
  const screening = runtime.screeningMap.get(state.selectedScreeningId);
  if (!screening) {
    elements["screening-detail"].innerHTML = `<div class="detail-empty">从时间轴或列表里选一个场次。</div>`;
    return;
  }

  const color = colorFromUnit(screening.unit);
  elements["screening-detail"].innerHTML = `
    <article class="detail-card">
      <h3>${escapeHtml(screening.filmTitle)}</h3>
      <p class="list-meta">${escapeHtml(screening.filmTitleEn || "暂无英文名")}</p>
      <div class="detail-grid">
        <div class="detail-item">
          <strong>时间</strong>
          <span>${escapeHtml(`${formatDateLabel(screening.date)} ${screening.startTime} - ${screening.endTimeBase}`)}</span>
        </div>
        <div class="detail-item">
          <strong>影院</strong>
          <span>${escapeHtml(`${screening.cinemaName} · ${screening.hall}`)}</span>
        </div>
        <div class="detail-item">
          <strong>片长 / 票价</strong>
          <span>${escapeHtml(`${screening.runtimeMin} 分钟 · ${screening.price} 元`)}</span>
        </div>
        <div class="detail-item">
          <strong>单元</strong>
          <span class="badge" style="background:${color.badgeBg};color:${color.badgeText}">${escapeHtml(screening.unit)}</span>
        </div>
        <div class="detail-item">
          <strong>活动</strong>
          <span>${escapeHtml(screening.hasActivity ? screening.activitySummary : "无活动")}</span>
        </div>
        <div class="detail-item">
          <strong>片区</strong>
          <span>${escapeHtml(screening.cinemaZoneLabel)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderList() {
  const screenings = getFilteredScreenings();
  if (!screenings.length) {
    elements["screening-list"].innerHTML = `<div class="empty-state">当前筛选条件下没有场次。</div>`;
    return;
  }

  elements["screening-list"].innerHTML = screenings
    .slice()
    .sort((a, b) => a.startAtMs - b.startAtMs || a.cinemaName.localeCompare(b.cinemaName, "zh-Hans-CN"))
    .map((screening) => {
      const color = colorFromUnit(screening.unit);
      return `
        <article class="list-card" data-list-card="${escapeHtml(screening.id)}">
          <div class="list-top">
            <div>
              <h3>${escapeHtml(screening.filmTitle)}</h3>
              <p class="list-meta">${escapeHtml(`${screening.startTime} · ${screening.cinemaName}`)}</p>
            </div>
            <span class="badge" style="background:${color.badgeBg};color:${color.badgeText}">${escapeHtml(screening.unit)}</span>
          </div>
          <div class="list-meta">${escapeHtml(`${screening.runtimeMin} 分钟 · ${screening.price} 元 · ${screening.hall}`)}</div>
          ${
            screening.hasActivity
              ? `<div class="list-meta">${escapeHtml(screening.activitySummary)}</div>`
              : ""
          }
          <div class="list-actions">
            <button class="mini-button" data-focus-screening="${escapeHtml(screening.id)}">定位到时间轴</button>
          </div>
        </article>
      `;
    })
    .join("");

  elements["screening-list"].querySelectorAll("[data-focus-screening]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScreeningId = button.dataset.focusScreening;
      renderTimeline();
      renderDetail();
      scrollSelectedListCard();
    });
  });

  scrollSelectedListCard();
}

function scrollSelectedListCard() {
  elements["screening-list"]
    .querySelectorAll("[data-list-card]")
    .forEach((card) => (card.style.outline = "none"));

  if (!state.selectedScreeningId) return;
  const card = elements["screening-list"].querySelector(
    `[data-list-card="${state.selectedScreeningId}"]`,
  );
  if (!card) return;
  card.style.outline = "2px solid rgba(142, 52, 34, 0.22)";
}

function buildOverlapLayout(screenings) {
  const laneEndMinutes = [];
  const items = screenings.map((screening) => {
    const start = screening.startMinuteOfDay;
    const end = screening.startMinuteOfDay + screening.runtimeMin;

    let level = laneEndMinutes.findIndex((laneEnd) => laneEnd <= start);
    if (level === -1) {
      level = laneEndMinutes.length;
      laneEndMinutes.push(end);
    } else {
      laneEndMinutes[level] = end;
    }

    return { screening, level };
  });

  return {
    items,
    maxLevel: Math.max(0, laneEndMinutes.length - 1),
  };
}

function setSelectOptions(select, options) {
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function colorFromUnit(unit) {
  const hash = [...unit].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = hash % 360;
  return {
    background: `hsla(${hue}, 65%, 78%, 0.92)`,
    border: `hsla(${hue}, 60%, 42%, 0.26)`,
    badgeBg: `hsla(${hue}, 70%, 82%, 0.55)`,
    badgeText: `hsl(${hue}, 55%, 30%)`,
  };
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function normalizeText(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .replace(/[\s·•・()（）《》'"“”‘’.,，:：!！?？+＋/_-]/g, "");
}

function parseIsoToLocalMs(isoLike) {
  const [datePart, timePart] = isoLike.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function formatDateLabel(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
