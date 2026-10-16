/**
 * 主應用程式邏輯 (方案 B：Google Maps 探索橋樑版)
 * 特色：全時段連鎖黑名單 + 無效字串封殺 + 缺點位時渲染 Google 地圖自動搜尋橋樑
 */
let selectedTags = new Set();
let currentItinerary = [];
let map = null;
let mapMarkers = [];

// 1. 宮廟宗教硬黑名單
const RELIGION_TEMPLE_KEYWORDS = [
  "宮", "廟", "堂", "寺", "壇", "教會", "基督", "長老", "清真寺", "聖堂", 
  "觀音", "佛祖", "神君", "保靈宮", "奉天宮", "保安堂", "慈航", "精舍", "庵", "講堂"
];

// 2. 連鎖早午餐硬黑名單
const CHAIN_BREAKFAST_KEYWORDS = [
  "麥味登", "美芝城", "弘爺", "拉亞", "晨間廚房", "賈村", "巨林", "呷尚寶", "奇米", "美而美", "早安", "豆漿"
];

// 3. 連鎖咖啡品牌黑名單 (剔除大型連鎖，保留獨立咖啡館)
const CHAIN_CAFE_KEYWORDS = [
  "多那之", "路易莎", "星巴克", "cama", "85度C", "85℃", "彼得好", "金礦", "丹堤", "怡客"
];

// 4. 手搖飲全時段黑名單 (禁止作為獨立景點/正餐)
const DRINK_DESSERT_KEYWORDS = [
  "迷客夏", "可不可", "50嵐", "麻古", "清心", "茶湯會", "大苑子", "珍煮丹", 
  "龜記", "鮮茶道", "COMEBUY", "五桐號", "再睡5分鐘", "奶茶", "茶飲", "飲料", 
  "萬波", "得正", "一芳"
];

// 5. 非旅遊設施、學校食堂與無效泛稱黑名單
const EXCLUDE_FACILITY_KEYWORDS = [
  "診所", "藥局", "辦公", "加油站", "車業", "通訊", "大樓", "社區", "工程", "公司", 
  "幼兒園", "國小", "國中", "學生餐廳", "學食", "宿舍", "六宿", "活動中心", "福利社", "食堂"
];

// 6. 完全無效的泛用名稱
const INVALID_EXACT_NAMES = ["公園", "美食", "小吃", "餐廳", "無名", "商圈"];

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

function filterSlotCandidatesStrict(spots, slot, selectedDistrict, center, usedNames) {
  if (!spots || !Array.isArray(spots)) return [];

  return spots.filter(s => {
    const name = (s.name || "").trim();
    if (usedNames.has(name)) return false;

    // 1. 無效單字與黑名單完全剔除
    if (INVALID_EXACT_NAMES.includes(name) || name.startsWith("無名")) return false;
    if (RELIGION_TEMPLE_KEYWORDS.some(kw => name.includes(kw))) return false;
    if (EXCLUDE_FACILITY_KEYWORDS.some(kw => name.includes(kw))) return false;
    if (DRINK_DESSERT_KEYWORDS.some(kw => name.includes(kw))) return false; // 全時段封鎖連鎖手搖飲

    // 2. 距離半徑約束 (4.0 公里)
    if (selectedDistrict !== "全區") {
      const matchText = (s.district && s.district.includes(selectedDistrict)) || name.includes(selectedDistrict);
      const dist = calculateDistance(center[0], center[1], s.lat, s.lng);
      if (!matchText && dist > 4.0) return false;
    }

    // 3. 正餐時段 (11:30 / 18:00)：剔除連鎖早餐
    if (slot.isMeal) {
      if (s.type !== "美食" && s.amenity !== "restaurant" && s.amenity !== "fast_food") return false;
      if (CHAIN_BREAKFAST_KEYWORDS.some(kw => name.includes(kw))) return false;
      return true;
    }

    // 4. 下午體驗 (14:00)：封殺連鎖咖啡與重頓正餐便當，只保留獨立咖啡館/甜點/景點
    if (slot.time && slot.time.includes("14:00")) {
      if (CHAIN_BREAKFAST_KEYWORDS.some(kw => name.includes(kw))) return false;
      if (CHAIN_CAFE_KEYWORDS.some(kw => name.includes(kw))) return false; // 封殺多那之、路易莎、星巴克
      if (s.type === "美食" && s.amenity !== "cafe") return false;
      return true;
    }

    // 5. 夜間體驗 (20:00)：封殺早餐店與便當店
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
    let liveSpots = await fetchSlotDataLive(city, district, slot, 8000);
    let validCandidates = filterSlotCandidatesStrict(liveSpots, slot, district, center, usedNames);

    let chosen = null;

    if (validCandidates.length > 0) {
      chosen = validCandidates[Math.floor(Math.random() * validCandidates.length)];
      chosen.isLive = true;
    } else {
      // 2. 備援庫搜尋
      let validBackup = filterSlotCandidatesStrict(backupSpots, slot, district, center, usedNames);
      if (validBackup.length > 0) {
        chosen = validBackup[Math.floor(Math.random() * validBackup.length)];
        chosen.isLive = false;
      } else {
        // 3. 觸發 Google 地圖動態探索橋樑 (不硬塞廢料)
        chosen = {
          isEmpty: true,
          slotInfo: slot,
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

    // 🌐 方案 B：Google 地圖動態探索橋樑卡片
    if (item.isEmpty) {
      let searchKeyword = "隱藏景點 特色體驗";
      if (item.slotInfo.time.includes("14:00")) {
        searchKeyword = "獨立咖啡廳 風格甜點";
      } else if (item.slotInfo.time.includes("20:00")) {
        searchKeyword = "酒吧 夜景 深夜咖啡館";
      } else if (item.slotInfo.isMeal) {
        searchKeyword = "特色餐廳 在地美食";
      }

      const queryTerm = `${item.city} ${item.district === "全區" ? "" : item.district} ${searchKeyword}`;
      const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`;

      return `
        <div class="border border-slate-200 rounded-lg p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 relative mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">${index + 1}</span>
              <span class="text-xs font-semibold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">${item.slotInfo.time} · ${item.slotInfo.label}</span>
              <span class="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-map-location-dot"></i> Google 地圖動態探索</span>
            </div>
          </div>
          <h3 class="font-bold text-slate-800 text-sm mb-1">${item.city} ${item.district} ${searchKeyword}</h3>
          <p class="text-xs text-slate-600 mb-3">該區域以嚴格標準為你過濾了連鎖加盟與普通便當店。點擊下方一鍵前往 Google 地圖探索更多真實評分 4.0 以上特色小店。</p>
          <div class="flex items-center gap-2">
            <a href="${googleMapUrl}" target="_blank" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition">
              <i class="fa-solid fa-compass"></i> 開啟 Google 地圖直達搜尋
            </a>
            <button onclick="rerollSingle(${index})" class="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-100">
              <i class="fa-solid fa-rotate"></i> 重抽
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
      newItem = { isEmpty: true, slotInfo: slot, city, district };
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
