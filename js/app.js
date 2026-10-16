/**
 * 主應用程式邏輯 (App Controller & Map Manager)
 * 已加入：鄉鎮中心距離半徑過濾 + 正餐手搖飲黑名單過濾
 */
let selectedTags = new Set();
let currentItinerary = [];
let map = null;
let mapMarkers = [];

// 正餐黑名單 (飲料、甜點、冰品不能當正餐)
const DRINK_DESSERT_KEYWORDS = [
  "迷客夏", "可不可", "50嵐", "麻古", "清心", "茶湯會", "大苑子", "珍煮丹", 
  "龜記", "鮮茶道", "COMEBUY", "五桐號", "再睡5分鐘", "奶茶", "茶飲", "飲料", 
  "冰品", "冰淇淋", "刨冰", "豆花", "甜點", "咖啡", "CAFE", "COFFEE", "TEA", "黑糖"
];

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
    fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI);
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
      fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI);
      loadCityJsonFallback(citySelect.value);
    });
  }

  if (districtSelect) {
    districtSelect.addEventListener('change', () => {
      fetchOSMData(citySelect.value, districtSelect.value, updatePreloadUI);
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
    preloadStatusDot.className = isReady ? "w-2 h-2 rounded-full bg-emerald-300" : "w-2 h-2 rounded-full bg-amber-300 animate-pulse";
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
  const isRain = document.getElementById('toggleRain').checked;
  const isGym = document.getElementById('toggleGym').checked;
  const pace = Number(document.getElementById('paceSelect').value);
  const isMonday = (new Date().getDay() === 1);

  document.getElementById('btnIcon').className = "fa-solid fa-spinner animate-spin";
  document.getElementById('btnText').textContent = "檢索中...";
  generateBtn.disabled = true;

  let rawSpots = await fetchOSMData(city, district, updatePreloadUI);
  if (!rawSpots || rawSpots.length === 0) {
    rawSpots = await loadCityJsonFallback(city);
  }

  // 1. 強制按「鄉鎮中心經緯度」進行半徑過濾
  const center = getQueryCenter(city, district);
  let spots = rawSpots;

  if (district !== "全區") {
    // 優先限制在鄉鎮中心 7 公里以內
    let nearby = rawSpots.filter(s => calculateDistance(center[0], center[1], s.lat, s.lng) <= 7.0);
    if (nearby.length >= 5) {
      spots = nearby;
    } else {
      // 若資料不足，放寬至 12 公里
      spots = rawSpots.filter(s => calculateDistance(center[0], center[1], s.lat, s.lng) <= 12.0);
    }
  }

  const timeSlots5 = [
    { time: "09:00 - 10:30", label: "早晨探索", type: "景點", isNightSlot: false, isMeal: false },
    { time: "11:30 - 13:00", label: "午餐時間", type: "美食", isNightSlot: false, isMeal: true },
    { time: "14:00 - 16:30", label: "下午體驗", type: "景點", isNightSlot: false, isMeal: false },
    { time: "18:00 - 19:30", label: "晚餐時間", type: "美食", isNightSlot: true, isMeal: true },
    { time: "20:00 - 21:30", label: "夜間體驗", type: "景點", isNightSlot: true, isMeal: false }
  ];

  const timeSlots3 = [
    { time: "11:30 - 13:00", label: "午餐時間", type: "美食", isNightSlot: false, isMeal: true },
    { time: "14:00 - 17:00", label: "下午精彩體驗", type: "景點", isNightSlot: false, isMeal: false },
    { time: "18:30 - 20:30", label: "晚餐時間", type: "美食", isNightSlot: true, isMeal: true }
  ];

  const slots = pace === 5 ? timeSlots5 : timeSlots3;
  let rawSelectedSpots = [];
  let usedNames = new Set();

  slots.forEach((slot, index) => {
    if (currentItinerary[index] && currentItinerary[index].isLocked) {
      usedNames.add(currentItinerary[index].name);
    }
  });

  slots.forEach((slot, index) => {
    if (currentItinerary[index] && currentItinerary[index].isLocked) {
      rawSelectedSpots.push(currentItinerary[index]);
      return;
    }

    let candidates = (spots || []).filter(s => {
      if (usedNames.has(s.name)) return false;
      if (s.type !== slot.type) return false;
      if (isRain && !s.isIndoor) return false;
      if (isGym && slot.type === "景點" && !s.isGymFriendly) return false;
      if (isMonday && s.mondayOff) return false;
      if (!slot.isNightSlot && s.nightOnly) return false;

      // 2. 正餐時間 (午餐/晚餐) 強制過濾手搖飲與甜點黑名單
      if (slot.isMeal) {
        const nameUpper = s.name.toUpperCase();
        const isDrinkOrDessert = DRINK_DESSERT_KEYWORDS.some(kw => nameUpper.includes(kw));
        if (isDrinkOrDessert) return false;
      }

      return true;
    });

    let chosen = null;
    if (candidates.length > 0) {
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      chosen = {
        name: `${city}${district === "全區" ? "在地" : district}特色${slot.type}`,
        city: city,
        district: district === "全區" ? "觀光區" : district,
        category: "在地體驗",
        avgCost: slot.type === "美食" ? 220 : 150,
        lat: center[0] + (Math.random() - 0.5) * 0.01,
        lng: center[1] + (Math.random() - 0.5) * 0.01,
        desc: "在地嚴選點位，建議點擊地圖與搜尋按鈕獲取詳細營業資訊。"
      };
    }

    usedNames.add(chosen.name);
    rawSelectedSpots.push({ ...chosen, slotInfo: slot, isLocked: false });
  });

  currentItinerary = sortItineraryByDistance(rawSelectedSpots);
  
  renderTimeline();
  updateMapMarkers();

  itineraryStatus.textContent = `生成成功 (${city} ${district})`;

  document.getElementById('btnIcon').className = "fa-solid fa-dice";
  document.getElementById('btnText').textContent = "🎲 生成專屬行程";
  generateBtn.disabled = false;
}

function renderTimeline() {
  timelineContainer.innerHTML = currentItinerary.map((item, index) => {
    const queryTerm = `${item.city} ${item.district} ${item.name}`;
    const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(queryTerm + " 營業時間 門票")}`;

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
            <span class="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">${item.category || '精選'}</span>
          </div>
          <span class="text-xs text-slate-400"><i class="fa-solid fa-location-dot"></i> ${item.city} ${item.district || ''}</span>
        </div>

        <h3 class="font-bold text-slate-900 text-base mb-1">${item.name}</h3>
        <p class="text-xs text-slate-600 mb-3">${item.desc}</p>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs">
          <span class="font-medium text-slate-700">預估費用: <strong class="text-emerald-600">約 NT$ ${item.avgCost}</strong></span>
          
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
            <a href="${searchUrl}" target="_blank" class="px-2.5 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200">
              <i class="fa-solid fa-magnifying-glass"></i> 查活動
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
  const center = getQueryCenter(city, district);
  
  let usedNames = new Set();
  currentItinerary.forEach((item, i) => {
    if (i !== index && item.name) usedNames.add(item.name);
  });

  let rawSpots = window.overpassCache[`${city}_${district}`] || window.localJsonCache[city] || [];
  let spots = rawSpots;

  if (district !== "全區") {
    spots = rawSpots.filter(s => calculateDistance(center[0], center[1], s.lat, s.lng) <= 8.0);
  }

  let candidates = spots.filter(s => {
    if (usedNames.has(s.name)) return false;
    if (s.type !== slot.type) return false;
    if (slot.isMeal) {
      const nameUpper = s.name.toUpperCase();
      if (DRINK_DESSERT_KEYWORDS.some(kw => nameUpper.includes(kw))) return false;
    }
    return true;
  });

  let newItem;
  if (candidates.length > 0) {
    newItem = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    newItem = {
      name: `${city}${district === "全區" ? "" : district}在地${slot.type}`, 
      city: city, 
      district: district, 
      category: "精選", 
      avgCost: 150, 
      lat: center[0], 
      lng: center[1], 
      desc: "在地點位"
    };
  }

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

      const marker = L.marker([spot.lat, spot.lng], {
