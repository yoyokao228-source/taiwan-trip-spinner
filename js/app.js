/**
 * 主應用程式邏輯 (App Controller & Map Manager)
 * 具備：切換縣市無限預載 + 生成 10 秒 12 通道發射 + 逐格獨立實時檢索/逐項降級備援
 */
let selectedTags = new Set();
let currentItinerary = [];
let map = null;
let mapMarkers = [];

const EXCLUDE_ATTRACTION_KEYWORDS = ["教會", "基督", "長老", "清真寺", "聖堂", "診所", "藥局", "辦公", "加油站", "車業", "通訊", "大樓", "社區"];
const DRINK_DESSERT_KEYWORDS = ["迷客夏", "可不可", "50嵐", "麻古", "清心", "茶湯會", "大苑子", "珍煮丹", "龜記", "鮮茶道", "COMEBUY", "五桐號", "再睡5分鐘", "奶茶", "茶飲", "飲料", "冰品", "冰淇淋", "刨冰", "豆花", "甜點", "黑糖"];

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
    // 預載模式 (isPreload = true)，無時間上限慢慢查
    fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI, true);
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
      // 預載模式，不限制逾時時間
      fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI, true);
      loadCityJsonFallback(citySelect.value);
    });
  }

  if (districtSelect) {
    districtSelect.addEventListener('change', () => {
      fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI, true);
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

function enrichSpotMetadata(spot) {
  const name = spot.name || "";
  let category = spot.category || "文青靜態";
  let type = spot.type || "景點";

  const isBlacklistedAttraction = EXCLUDE_ATTRACTION_KEYWORDS.some(kw => name.includes(kw));
  const isDrinkOrDessert = DRINK_DESSERT_KEYWORDS.some(kw => name.includes(kw));

  if (name.includes("步道") || name.includes("公園") || name.includes("山") || name.includes("瀑布") || name.includes("海灘") || name.includes("農場")) {
    category = "戶外自然";
    type = "景點";
  } else if (name.includes("美術館") || name.includes("博物館") || name.includes("文創") || name.includes("古蹟") || name.includes("藝文")) {
    category = "文青靜態";
    type = "景點";
  } else if (name.includes("保齡球") || name.includes("健身") || name.includes("運動") || name.includes("攀岩")) {
    category = "運動休閒";
    type = "景點";
  } else if (name.includes("密室") || name.includes("影城") || name.includes("電影") || name.includes("桌遊")) {
    category = "娛樂解謎";
    type = "景點";
  } else if (spot.type === "美食" || spot.amenity === "restaurant" || spot.amenity === "fast_food") {
    category = "美食放鬆";
    type = "美食";
  }

  return {
    ...spot,
    type,
    category,
    isDrinkOrDessert,
    isBlacklistedAttraction
  };
}

function sortItineraryByDistance(items) {
  if (items.length <= 1) return items;
  let result = [];
  let unvisited = [...items];
  let current = unvisited.shift();
  result.push(current);

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      let dist = calculateDistance(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
      if (dist < minDist) {
        minDist = dist;
        nearestIndex = i;
      }
    }
    current = unvisited.splice(nearestIndex, 1)[0];
    result.push(current);
  }

  return result.map((item, index) => ({
    ...item,
    slotInfo: items[index].slotInfo
  }));
}

async function handleGenerate() {
  const city = citySelect.value;
  const district = districtSelect.value;
  const pace = Number(document.getElementById('paceSelect').value);

  document.getElementById('btnIcon').className = "fa-solid fa-wifi animate-spin";
  document.getElementById('btnText').textContent = "12通道實時搜尋中...";
  generateBtn.disabled = true;

  // 1. 搜尋發射：10 秒極限連線，12 通道平行抓取
  let liveSpots = await fetchOSMData(city, district, updatePreloadUI, false);
  
  // 2. 隨時準備該縣市的靜態 JSON 以備單項降級
  let backupSpots = await loadCityJsonFallback(city);

  const center = getQueryCenter(city, district);

  let liveEnriched = (liveSpots || []).map(s => enrichSpotMetadata({ ...s, isLive: true }));
  let backupEnriched = (backupSpots || []).map(s => enrichSpotMetadata({ ...s, isLive: false }));

  // 分區邊界過濾
  if (district !== "全區") {
    liveEnriched = liveEnriched.filter(s => {
      const matchText = (s.district && s.district.includes(district)) || (s.name && s.name.includes(district));
      return matchText || calculateDistance(center[0], center[1], s.lat, s.lng) <= 5.0;
    });

    backupEnriched = backupEnriched.filter(s => {
      const matchText = (s.district && s.district.includes(district)) || (s.name && s.name.includes(district));
      return matchText || calculateDistance(center[0], center[1], s.lat, s.lng) <= 5.0;
    });
  }

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
  let rawSelectedSpots = [];
  let usedNames = new Set();

  slots.forEach((slot, index) => {
    if (currentItinerary[index] && currentItinerary[index].isLocked) {
      usedNames.add(currentItinerary[index].name);
    }
  });

  // 3. 逐格 (Slot-by-Slot) 獨立核對與補牌
  slots.forEach((slot, index) => {
    if (currentItinerary[index] && currentItinerary[index].isLocked) {
      rawSelectedSpots.push(currentItinerary[index]);
      return;
    }

    // A. 優先嘗試從「實時線上點位」尋找該格符合的項目
    let liveCandidates = liveEnriched.filter(s => {
      if (usedNames.has(s.name)) return false;
      if (s.type !== slot.type) return false;
      if (slot.type === "景點" && s.isBlacklistedAttraction) return false;
      if (slot.isMeal && s.isDrinkOrDessert) return false;
      if (selectedTags.size > 0 && slot.type === "景點") {
        if (!selectedTags.has(s.category)) return false;
      }
      return true;
    });

    let chosen = null;

    if (liveCandidates.length > 0) {
      // ✅ 該格成功獲得「實時線上發現」地點
      chosen = liveCandidates[Math.floor(Math.random() * liveCandidates.length)];
    } else {
      // B. 若實時連線該項目缺牌，僅該格獨立降級至「離線備援庫」尋找
      let backupCandidates = backupEnriched.filter(s => {
        if (usedNames.has(s.name)) return false;
        if (s.type !== slot.type) return false;
        if (slot.type === "景點" && s.isBlacklistedAttraction) return false;
        if (slot.isMeal && s.isDrinkOrDessert) return false;
        return true;
      });

      if (backupCandidates.length > 0) {
        chosen = backupCandidates[Math.floor(Math.random() * backupCandidates.length)];
      } else {
        // C. 雙庫極限重複抽牌保護
        let emergencyPool = liveEnriched.length > 0 ? liveEnriched : backupEnriched;
        let validEmergency = emergencyPool.filter(s => s.type === slot.type);
        chosen = validEmergency.length > 0 
          ? validEmergency[Math.floor(Math.random() * validEmergency.length)]
          : (emergencyPool[0] || { name: `${city}${district}經典地點`, type: slot.type, isLive: false });
      }
    }

    usedNames.add(chosen.name);
    rawSelectedSpots.push({ ...chosen, slotInfo: slot, isLocked: false });
  });

  currentItinerary = sortItineraryByDistance(rawSelectedSpots);
  
  renderTimeline();
  updateMapMarkers();

  itineraryStatus.textContent = `生成成功 (${city} ${district})`;

  document.getElementById('btnIcon').className = "fa-solid fa-compass";
  document.getElementById('btnText').textContent = "🎲 實時探索新行程";
  generateBtn.disabled = false;
}

function renderTimeline() {
  timelineContainer.innerHTML = currentItinerary.map((item, index) => {
    const displayDistrict = item.district || (districtSelect.value === "全區" ? "熱門區域" : districtSelect.value);
    const queryTerm = `${item.city} ${displayDistrict} ${item.name}`;
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`;

    // 精準顯示單格資料來源：綠色 (實時線上發現) vs 灰色 (經典庫存)
    const sourceBadge = item.isLive !== false 
      ? `<span class="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-wifi"></i> 📡 實時線上發現</span>`
      : `<span class="text-[10px] bg-slate-300 text-slate-700 px-2 py-0.5 rounded-full"><i class="fa-solid fa-database"></i> 💾 經典庫存</span>`;

    return `
      <div class="border border-slate-200 rounded-lg p-4 bg-slate-50/50 hover:bg-white hover:shadow-md transition relative">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              ${index + 1}
            </span>
            <span class="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              ${item.slotInfo.time} · ${item.slotInfo.label}
            </span>
            ${sourceBadge}
          </div>
          <span class="text-xs text-slate-500 font-medium"><i class="fa-solid fa-location-dot text-emerald-600"></i> ${item.city} ${displayDistrict}</span>
        </div>

        <h3 class="font-bold text-slate-900 text-base mb-1">${item.name}</h3>
        <p class="text-xs text-slate-600 mb-3">${item.desc || '在地真實地點。'}</p>

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
  currentItinerary[index].isLocked = !currentItinerary[index].isLocked;
  renderTimeline();
};

window.rerollSingle = async function(index) {
  if (currentItinerary[index].isLocked) return;
  const city = citySelect.value;
  const district = districtSelect.value;
  const slot = currentItinerary[index].slotInfo;

  let rawSpots = window.overpassCache[`${city}_${district}`] || window.localJsonCache[city] || [];
  let allEnriched = rawSpots.map(s => enrichSpotMetadata(s));

  let candidates = allEnriched.filter(s => s.type === slot.type && (!slot.isMeal || !s.isDrinkOrDessert));
  let newItem = candidates[Math.floor(Math.random() * candidates.length)];

  currentItinerary[index] = {
    ...newItem,
    slotInfo: slot,
    isLocked: false
  };

  renderTimeline();
  updateMapMarkers();
};

function updateMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  let bounds = [];

  currentItinerary.forEach((spot, idx) => {
    if (spot.lat && spot.lng) {
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
