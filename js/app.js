/**
 * 主應用程式邏輯 (App Controller & Map Manager)
 * 實施：寧缺勿濫機制，若無符合屬性地點則顯示「查無合適地點」卡片，絕不拿廢料湊數
 */
let selectedTags = new Set();
let currentItinerary = [];
let map = null;
let mapMarkers = [];

// 硬性黑名單
const RELIGION_TEMPLE_KEYWORDS = ["宮", "廟", "堂", "寺", "壇", "教會", "基督", "長老", "清真寺", "聖堂", "觀音", "佛祖", "神君", "保靈宮", "奉天宮", "保安堂", "慈航", "精舍", "庵", "講堂"];
const CHAIN_BREAKFAST_KEYWORDS = ["麥味登", "美芝城", "弘爺", "拉亞", "晨間廚房", "賈村", "巨林", "呷尚寶", "奇米", "美而美", "早安", "豆漿"];
const DRINK_DESSERT_KEYWORDS = ["迷客夏", "可不可", "50嵐", "麻古", "清心", "茶湯會", "大苑子", "珍煮丹", "龜記", "鮮茶道", "COMEBUY", "五桐號", "再睡5分鐘", "奶茶", "茶飲", "飲料", "冰品", "冰淇淋", "刨冰", "豆花", "甜點", "黑糖", "萬波", "得正", "一芳"];
const EXCLUDE_FACILITY_KEYWORDS = ["診所", "藥局", "辦公", "加油站", "車業", "通訊", "大樓", "社區", "工程", "公司", "幼兒園", "國小", "國中", "學生餐廳", "學食", "宿舍", "六宿", "活動中心", "福利社", "食堂"];

let citySelect, districtSelect, budgetSlider, budgetValue, generateBtn, timelineContainer, itineraryStatus, preloadStatusDot, preloadStatusText;

document.addEventListener('DOMContentLoaded', () => {
  citySelect = document.getElementById('citySelect');
  districtSelect = document.getElementById('districtSelect');
  budgetSlider = document.getElementById('budgetSlider');
  budgetValue = document.getElementById('budgetValue');
  generateBtn = document.getElementById('generateBtn');
  timelineContainer = document.getElementById('timelineContainer');
  itineraryStatus = document.getElementById('itineraryStatus');
  preloadStatusDot = document.getElementById('preloadStatusDot');
  preloadStatusText = document.getElementById('preloadStatusText');

  initCitySelect();
  initMap();
  bindEvents();

  if (citySelect && citySelect.value) {
    loadCityJsonFallback(citySelect.value);
  }
});

function initCitySelect() {
  const geoMap = window.districtGeoMap;
  if (!geoMap) return;
  citySelect.innerHTML = Object.keys(geoMap).map(city => `<option value="${city}">${city}</option>`).join('');
  updateDistricts();
}

function updateDistricts() {
  const geoMap = window.districtGeoMap;
  if (!geoMap || !citySelect) return;
  const city = citySelect.value;
  const cityData = geoMap[city];
  const districts = (cityData && cityData.districts) ? ["全區", ...Object.keys(cityData.districts)] : ["全區"];
  districtSelect.innerHTML = districts.map(d => `<option value="${d}">${d}</option>`).join('');
}

function initMap() {
  if (typeof L === 'undefined') return;
  map = L.map('map').setView([25.0330, 121.5654], 12);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS',
    maxZoom: 18
  }).addTo(map);
}

function bindEvents() {
  if (citySelect) {
    citySelect.addEventListener('change', () => {
      updateDistricts();
      loadCityJsonFallback(citySelect.value);
    });
  }

  if (budgetSlider && budgetValue) {
    budgetSlider.addEventListener('input', (e) => {
      budgetValue.textContent = `NT$ ${Number(e.target.value).toLocaleString()}`;
    });
  }

  const tagContainer = document.getElementById('tagContainer');
  if (tagContainer) {
    tagContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-btn')) {
        const tag = e.target.dataset.tag;
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
          e.target.classList.remove('bg-emerald-600', 'text-white');
          e.target.classList.add('bg-slate-50');
        } else {
          selectedTags.add(tag);
          e.target.classList.add('bg-emerald-600', 'text-white');
          e.target.classList.remove('bg-slate-50');
        }
      }
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }
}

function updatePreloadUI(isReady, text) {
  if (preloadStatusText && preloadStatusDot) {
    preloadStatusText.textContent = text;
    preloadStatusDot.className = isReady ? "w-2 h-2 rounded-full bg-emerald-400" : "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * 嚴格卡控：不符合條件的類別一律回傳 false
 */
function filterSlotCandidatesStrict(spots, slot, selectedDistrict, center, usedNames) {
  if (!spots || !Array.isArray(spots)) return [];

  return spots.filter(s => {
    const name = s.name || "";
    if (usedNames.has(name)) return false;

    // 1. 硬黑名單：宮廟、設施、學校宿舍食堂
    if (RELIGION_TEMPLE_KEYWORDS.some(kw => name.includes(kw))) return false;
    if (EXCLUDE_FACILITY_KEYWORDS.some(kw => name.includes(kw))) return false;

    // 2. 距離與分區鎖定 (4.0 公里半徑)
    if (selectedDistrict !== "全區") {
      const matchText = (s.district && s.district.includes(selectedDistrict)) || name.includes(selectedDistrict);
      const dist = calculateDistance(center[0], center[1], s.lat, s.lng);
      if (!matchText && dist > 4.0) return false;
    }

    // 3. 正餐時段 (午餐/晚餐)：100% 必須是餐廳，剔除飲料甜點與早餐店
    if (slot.isMeal) {
      if (s.type !== "美食" && s.amenity !== "restaurant" && s.amenity !== "fast_food") return false;
      if (DRINK_DESSERT_KEYWORDS.some(kw => name.includes(kw))) return false;
      if (CHAIN_BREAKFAST_KEYWORDS.some(kw => name.includes(kw))) return false;
      return true;
    }

    // 4. 下午體驗 (14:00)：100% 拒絕便當小吃與大餐，只許咖啡館/甜點/景點
    if (slot.time && slot.time.includes("14:00")) {
      if (CHAIN_BREAKFAST_KEYWORDS.some(kw => name.includes(kw))) return false;
      if (s.type === "美食" && s.amenity !== "cafe") return false; // 封殺如妙廚老爹等便當小吃
      return true;
    }

    // 5. 夜間體驗 (20:00)：100% 拒絕早餐店與便當店
    if (slot.time && slot.time.includes("20:00")) {
      if (CHAIN_BREAKFAST_KEYWORDS.some(kw => name.includes(kw))) return false;
      if (s.type === "美食" && s.amenity !== "pub" && s.amenity !== "bar" && s.amenity !== "cafe") return false;
      return true;
    }

    return true;
  });
}

async function handleGenerate() {
  const city = citySelect.value;
  const district = districtSelect.value;
  const pace = Number(document.getElementById('paceSelect').value);
  const center = getQueryCenter(city, district);

  generateBtn.disabled = true;

  const timeSlots5 = [
    { time: "09:00 - 10:30", label: "早晨探索", type: "景點", isMeal: false },
    { time: "11:30 - 13:00", label: "午餐時間", type: "美食", isMeal: true },
    { time: "14:00 - 16:30", label: "下午體驗", type: "景點", isMeal: false },
    { time: "18:00 - 19:30", label: "晚餐時間", type: "美食", isMeal: true },
    { time: "20:00 - 21:30", label: "夜間體驗", type: "景點", isMeal: false }
  ];

  const timeSlots3 = [
    { time: "11:30 - 13:00", label: "午餐時間", type: "美食", isMeal: true },
    { time: "14:00 - 17:00", label: "下午精彩體驗", type: "景點", isMeal: false },
    { time: "18:30 - 20:30", label: "晚餐時間", type: "美食", isMeal: true }
  ];

  const slots = pace === 5 ? timeSlots5 : timeSlots3;

  currentItinerary = slots.map((slot, i) => (currentItinerary[i] && currentItinerary[i].isLocked) ? currentItinerary[i] : null);
  
  let usedNames = new Set();
  currentItinerary.forEach(item => { if (item && item.name) usedNames.add(item.name); });

  const backupSpots = await loadCityJsonFallback(city);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];

    if (currentItinerary[i] && currentItinerary[i].isLocked) {
      continue;
    }

    updatePreloadUI(false, `實時檢索：${slot.label} (${i + 1}/${slots.length})...`);
    document.getElementById('btnIcon').className = "fa-solid fa-spinner animate-spin";
    document.getElementById('btnText').textContent = `搜尋中 (${i + 1}/${slots.length})...`;

    // 1. 實時連線發射
    let liveSpots = await fetchSlotDataLive(city, district, slot, 10000);
    let validCandidates = filterSlotCandidatesStrict(liveSpots, slot, district, center, usedNames);

    let chosen = null;

    if (validCandidates.length > 0) {
      chosen = validCandidates[Math.floor(Math.random() * validCandidates.length)];
      chosen.isLive = true;
    } else {
      // 2. 離線備援庫嚴格比對
      let validBackup = filterSlotCandidatesStrict(backupSpots, slot, district, center, usedNames);
      if (validBackup.length > 0) {
        chosen = validBackup[Math.floor(Math.random() * validBackup.length)];
        chosen.isLive = false;
      } else {
        // 3. 🔥 寧缺勿濫：完全無符合地點時，直接設為空標籤，絕不安插廢料餐廳
        chosen = {
          isEmpty: true,
          slotInfo: slot,
          name: "尚無符合條件之地點",
          city: city,
          district: district
        };
      }
    }

    if (chosen) {
      if (chosen.name && !chosen.isEmpty) usedNames.add(chosen.name);
      currentItinerary[i] = { ...chosen, slotInfo: slot, isLocked: false };

      renderTimeline();
      updateMapMarkers();
    }
  }

  updatePreloadUI(true, `✅ 探索完成 (${city} ${district})`);
  if (itineraryStatus) itineraryStatus.textContent = `探索完成 (${city} ${district})`;
  
  document.getElementById('btnIcon').className = "fa-solid fa-compass";
  document.getElementById('btnText').textContent = "🎲 實時探索新行程";
  generateBtn.disabled = false;
}

function renderTimeline() {
  timelineContainer.innerHTML = currentItinerary.map((item, index) => {
    if (!item) {
      return `
        <div class="border border-slate-200 rounded-lg p-4 bg-slate-100/50 animate-pulse flex items-center justify-between mb-3">
          <span class="text-xs text-slate-400"><i class="fa-solid fa-spinner animate-spin"></i> 實時檢索該時段地點...</span>
        </div>
      `;
    }

    // 🚫 寧缺勿濫「查無符合地點」警示卡片
    if (item.isEmpty) {
      return `
        <div class="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50 relative mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-slate-400 text-white font-bold text-xs flex items-center justify-center">${index + 1}</span>
              <span class="text-xs font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">${item.slotInfo.time} · ${item.slotInfo.label}</span>
              <span class="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">⚠️ 查無區域店家</span>
            </div>
          </div>
          <p class="text-xs text-slate-500 my-2">該區域在此時段尚無符合條件之特色地點，已為你濾除不相干之連鎖店與正餐。</p>
          <div class="flex items-center gap-2 pt-1">
            <button onclick="rerollSingle(${index})" class="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-100">
              <i class="fa-solid fa-rotate"></i> 重抽此格
            </button>
          </div>
        </div>
      `;
    }

    const displayDistrict = item.district || (districtSelect.value === "全區" ? "熱門區域" : districtSelect.value);
    const queryTerm = `${item.city} ${displayDistrict} ${item.name}`;
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`;

    const sourceBadge = item.isLive !== false 
      ? `<span class="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-wifi"></i> 📡 實時線上發現</span>`
      : `<span class="text-[10px] bg-slate-300 text-slate-700 px-2 py-0.5 rounded-full"><i class="fa-solid fa-database"></i> 💾 經典庫存</span>`;

    const hasValidDesc = item.desc && item.desc.trim().length > 0 && 
      !item.desc.includes("實時線上發現") && 
      !item.desc.includes("在地精選") && 
      !item.desc.includes("在地真實地點");

    const descHtml = hasValidDesc ? `<p class="text-xs text-slate-600 mb-3">${item.desc}</p>` : '';

    return `
      <div class="border border-slate-200 rounded-lg p-4 bg-slate-50/50 hover:bg-white hover:shadow-md transition relative mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">${index + 1}</span>
            <span class="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">${item.slotInfo.time} · ${item.slotInfo.label}</span>
            ${sourceBadge}
          </div>
          <span class="text-xs text-slate-500 font-medium"><i class="fa-solid fa-location-dot text-emerald-600"></i> ${item.city} ${displayDistrict}</span>
        </div>

        <h3 class="font-bold text-slate-900 text-base mb-1">${item.name}</h3>
        ${descHtml}

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs">
          <span class="font-medium text-slate-700">預估費用: <strong class="text-emerald-600">約 NT$ ${item.avgCost || 150}</strong></span>
          
          <div class="flex items-center gap-2">
            <button onclick="toggleLock(${index})" class="px-2.5 py-1 rounded border text-xs font-medium transition ${item.isLocked ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}">
              ${item.isLocked ? '<i class="fa-solid fa-lock"></i> 已鎖定' : '<i class="fa-solid fa-lock-open"></i> 鎖定'}
            </button>
            <button onclick="rerollSingle(${index})" class="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-100">
              <i class="fa-solid fa-rotate"></i> 重抽
            </button>
            <a href="${googleMapUrl}" target="_blank" class="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-medium hover:bg-blue-100">
              <i class="fa-solid fa-map-pin"></i> Google 地圖
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleLock = function(index) {
  if (currentItinerary[index]) {
    currentItinerary[index].isLocked = !currentItinerary[index].isLocked;
    renderTimeline();
  }
};

window.rerollSingle = async function(index) {
  if (currentItinerary[index] && currentItinerary[index].isLocked) return;
  const city = citySelect.value;
  const district = districtSelect.value;
  const slot = currentItinerary[index] ? currentItinerary[index].slotInfo : { isMeal: false, time: "14:00" };
  const center = getQueryCenter(city, district);

  let usedNames = new Set();
  currentItinerary.forEach((item, i) => { if (i !== index && item && item.name) usedNames.add(item.name); });

  let liveSpots = await fetchSlotDataLive(city, district, slot, 8000);
  let validCandidates = filterSlotCandidatesStrict(liveSpots, slot, district, center, usedNames);

  let newItem = null;
  if (validCandidates.length > 0) {
    newItem = validCandidates[Math.floor(Math.random() * validCandidates.length)];
    newItem.isLive = true;
  } else {
    let backupSpots = await loadCityJsonFallback(city);
    let validBackup = filterSlotCandidatesStrict(backupSpots, slot, district, center, usedNames);
    if (validBackup.length > 0) {
      newItem = validBackup[Math.floor(Math.random() * validBackup.length)];
      newItem.isLive = false;
    } else {
      newItem = { isEmpty: true, slotInfo: slot, name: "尚無符合條件之地點", city, district };
    }
  }

  currentItinerary[index] = { ...newItem, slotInfo: slot, isLocked: false };
  renderTimeline();
  updateMapMarkers();
};

function updateMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  let bounds = [];

  currentItinerary.forEach((spot, idx) => {
    if (spot && spot.lat && spot.lng && !spot.isEmpty) {
      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="custom-marker">${idx + 1}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const displayDistrict = spot.district || (districtSelect.value === "全區" ? "" : districtSelect.value);

      const marker = L.marker([spot.lat, spot.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(`<b>${idx + 1}. ${spot.name}</b><br>${spot.city} ${displayDistrict}`);
      
      mapMarkers.push(marker);
      bounds.push([spot.lat, spot.lng]);
    }
  });

  if (bounds.length > 0) {
    map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 1.2 });
  }
}
