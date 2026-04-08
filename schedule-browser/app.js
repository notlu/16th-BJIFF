const data = window.FESTIVAL_DATA || null;
const ALL_DATES_VALUE = "all";
const ALL_CITIES_VALUE = "all";
const ALL_CINEMAS_VALUE = "all";
const CITY_ORDER = ["北京", "天津", "雄安"];

const state = {
  selectedDate: ALL_DATES_VALUE,
  selectedCity: ALL_CITIES_VALUE,
  selectedCinemaName: ALL_CINEMAS_VALUE,
  selectedUnit: "all",
  searchTerm: "",
  selectedScreeningId: null,
};

const runtime = {
  screenings: [],
  cinemas: [],
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
  attachEvents();

  state.selectedDate = ALL_DATES_VALUE;
  state.selectedScreeningId = runtime.screenings[0]?.id || null;
  renderAll();
});

function prepareRuntimeData() {
  const cinemaMap = new Map();
  runtime.screenings = data.screenings
    .map((screening) => {
      const item = {
        ...screening,
        city: inferCity(screening.cinemaZoneId),
        startAtMs: parseIsoToLocalMs(screening.startAt),
        normalizedFilmTitle: normalizeText(screening.filmTitle),
        normalizedCinemaName: normalizeText(screening.cinemaName),
        normalizedActivity: normalizeText(screening.activitySummary || ""),
      };
      if (!cinemaMap.has(item.cinemaName)) {
        cinemaMap.set(item.cinemaName, {
          name: item.cinemaName,
          city: item.city,
        });
      }
      return item;
    })
    .sort(compareScreenings);

  runtime.cinemas = Array.from(cinemaMap.values()).sort(compareCinemas);
}

function captureElements() {
  [
    "filter-date",
    "filter-city",
    "filter-cinema",
    "filter-unit",
    "filter-search",
    "reset-filters",
    "day-summary",
    "timeline",
    "screening-list",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function populateControls() {
  setSelectOptions(elements["filter-date"], [
    { value: ALL_DATES_VALUE, label: "全部日期" },
    ...data.dates.map((date) => ({ value: date, label: formatDateLabel(date) })),
  ]);

  setSelectOptions(elements["filter-city"], [
    { value: ALL_CITIES_VALUE, label: "全部城市" },
    ...CITY_ORDER.map((city) => ({ value: city, label: city })),
  ]);

  setSelectOptions(elements["filter-unit"], [
    { value: "all", label: "全部单元" },
    ...data.units.map((unit) => ({ value: unit, label: unit })),
  ]);

  elements["filter-date"].value = ALL_DATES_VALUE;
  elements["filter-city"].value = ALL_CITIES_VALUE;
  populateCinemaControl();
}

function attachEvents() {
  elements["filter-date"].addEventListener("change", (event) => {
    state.selectedDate = event.target.value;
    syncSelection();
    renderAll();
  });

  elements["filter-city"].addEventListener("change", (event) => {
    state.selectedCity = event.target.value;
    populateCinemaControl();
    syncSelection();
    renderAll();
  });

  elements["filter-cinema"].addEventListener("change", (event) => {
    state.selectedCinemaName = event.target.value;
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
    state.selectedDate = ALL_DATES_VALUE;
    state.selectedCity = ALL_CITIES_VALUE;
    state.selectedCinemaName = ALL_CINEMAS_VALUE;
    state.selectedUnit = "all";
    state.searchTerm = "";

    elements["filter-date"].value = state.selectedDate;
    elements["filter-city"].value = state.selectedCity;
    elements["filter-unit"].value = state.selectedUnit;
    elements["filter-search"].value = "";

    populateCinemaControl();
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
    if (state.selectedDate !== ALL_DATES_VALUE && screening.date !== state.selectedDate) return false;
    if (state.selectedCity !== ALL_CITIES_VALUE && screening.city !== state.selectedCity) return false;
    if (state.selectedCinemaName !== ALL_CINEMAS_VALUE && screening.cinemaName !== state.selectedCinemaName) return false;
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
  renderList();
}

function renderSummary() {
  const screenings = getFilteredScreenings();
  elements["day-summary"].textContent = screenings.length
    ? `${getDateSummaryLabel()} · ${getCitySummaryLabel()} · ${screenings.length} 场`
    : `${getDateSummaryLabel()} · ${getCitySummaryLabel()} · 当前没有匹配场次`;
}

function renderTimeline() {
  const screenings = getFilteredScreenings();
  if (!screenings.length) {
    elements["timeline"].innerHTML = `<div class="empty-state" style="padding:20px">当前筛选条件下没有场次。</div>`;
    return;
  }

  const grouped = groupBy(
    screenings,
    state.selectedDate === ALL_DATES_VALUE
      ? (item) => `${item.date}::${item.city}::${item.cinemaName}`
      : (item) => `${item.city}::${item.cinemaName}`,
  );
  const rows = Array.from(grouped.entries())
    .map(([rowKey, rowItems]) => {
      const firstScreening = rowItems[0];
      return {
        rowKey,
        date: firstScreening.date,
        city: firstScreening.city,
        cinemaName: firstScreening.cinemaName,
        items: rowItems.slice().sort(compareScreenings),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (state.selectedDate === ALL_DATES_VALUE && a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      const aStart = a.items.reduce((min, item) => Math.min(min, item.startMinuteOfDay), 9999);
      const bStart = b.items.reduce((min, item) => Math.min(min, item.startMinuteOfDay), 9999);
      return aStart - bStart || compareCinemas(a, b);
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

  const rowMarkup = rows
    .map(({ rowKey, date, city, cinemaName, items: rowItems }) => {
      const labelTitle = state.selectedDate === ALL_DATES_VALUE ? formatDateLabel(date) : cinemaName;
      const labelMetaParts = [];

      if (state.selectedDate === ALL_DATES_VALUE) {
        if (state.selectedCity === ALL_CITIES_VALUE) labelMetaParts.push(city);
        labelMetaParts.push(cinemaName);
      } else if (state.selectedCity === ALL_CITIES_VALUE) {
        labelMetaParts.push(city);
      }

      labelMetaParts.push(`${rowItems.length} 场`);
      const labelMeta = labelMetaParts.join(" · ");

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
        <div class="timeline-row" data-timeline-row="${escapeHtml(rowKey)}" style="min-height:${rowHeight}px">
          <div class="timeline-label">
            <strong>${escapeHtml(labelTitle)}</strong>
            <span>${escapeHtml(labelMeta)}</span>
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
        <div class="timeline-ruler-label">${escapeHtml(
          state.selectedDate === ALL_DATES_VALUE ? "日期 / 影院" : "影院",
        )}</div>
        <div class="timeline-hours" style="width:${laneWidth}px">${hourMarks.join("")}</div>
      </div>
      ${rowMarkup}
    </div>
  `;

  elements["timeline"].querySelectorAll("[data-screening-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScreeningId = button.dataset.screeningId;
      renderTimeline();
      scrollSelectedListCard();
    });
  });
}

function renderList() {
  const screenings = getFilteredScreenings();
  if (!screenings.length) {
    elements["screening-list"].innerHTML = `<div class="empty-state">当前筛选条件下没有场次。</div>`;
    return;
  }

  elements["screening-list"].innerHTML = screenings
    .slice()
    .sort(compareScreenings)
    .map((screening) => {
      const color = colorFromUnit(screening.unit);
      const listMeta = buildListMeta(screening);
      return `
        <article class="list-card" data-list-card="${escapeHtml(screening.id)}">
          <div class="list-top">
            <div>
              <h3>${escapeHtml(screening.filmTitle)}</h3>
              <p class="list-meta">${escapeHtml(listMeta)}</p>
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

function populateCinemaControl() {
  const cinemas = runtime.cinemas.filter(
    (cinema) => state.selectedCity === ALL_CITIES_VALUE || cinema.city === state.selectedCity,
  );

  setSelectOptions(elements["filter-cinema"], [
    { value: ALL_CINEMAS_VALUE, label: "全部影院" },
    ...cinemas.map((cinema) => ({
      value: cinema.name,
      label: state.selectedCity === ALL_CITIES_VALUE ? `${cinema.city} · ${cinema.name}` : cinema.name,
    })),
  ]);

  if (!cinemas.find((cinema) => cinema.name === state.selectedCinemaName)) {
    state.selectedCinemaName = ALL_CINEMAS_VALUE;
  }
  elements["filter-cinema"].value = state.selectedCinemaName;
}

function compareScreenings(a, b) {
  return (
    a.startAtMs - b.startAtMs ||
    compareCities(a.city, b.city) ||
    a.cinemaName.localeCompare(b.cinemaName, "zh-Hans-CN") ||
    a.filmTitle.localeCompare(b.filmTitle, "zh-Hans-CN")
  );
}

function compareCinemas(a, b) {
  const aName = a.name || a.cinemaName;
  const bName = b.name || b.cinemaName;
  return (
    compareCities(a.city, b.city) ||
    aName.localeCompare(bName, "zh-Hans-CN")
  );
}

function compareCities(a, b) {
  return CITY_ORDER.indexOf(a) - CITY_ORDER.indexOf(b);
}

function getDateSummaryLabel() {
  return state.selectedDate === ALL_DATES_VALUE ? "全部日期" : formatDateLabel(state.selectedDate);
}

function getCitySummaryLabel() {
  return state.selectedCity === ALL_CITIES_VALUE ? "全部城市" : state.selectedCity;
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

function inferCity(zoneId) {
  if (zoneId === "tianjin") return "天津";
  if (zoneId === "xiongan") return "雄安";
  return "北京";
}

function buildListMeta(screening) {
  const parts = [];
  if (state.selectedDate === ALL_DATES_VALUE) parts.push(formatDateLabel(screening.date));
  if (state.selectedCity === ALL_CITIES_VALUE) parts.push(screening.city);
  parts.push(screening.startTime, screening.cinemaName);
  return parts.join(" · ");
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
