/**
 * 實時 API 與動態 JSON 備援服務 (API & Local JSON Fallback Service)
 */
window.overpassCache = {};
window.localJsonCache = {};

/**
 * 取得鄉鎮區經緯度中心
 */
window.getQueryCenter = function(city, district) {
  const geoMap = window.districtGeoMap;
  if (!geoMap) return [25.0330, 121.5654];
  const cityInfo = geoMap[city];
  if (!cityInfo) return [25.0330, 121.5654];
  if (district !== "全區" && cityInfo.districts && cityInfo.districts[district]) {
    return cityInfo.districts[district];
  }
  return cityInfo.center;
};

/**
 * 動態載入該縣市之獨立 JSON 備援資料庫 (自動相容根目錄與 data/ 資料夾)
 */
window.loadCityJsonFallback = async function(cityName) {
  if (window.localJsonCache[cityName]) {
    return window.localJsonCache[cityName];
  }

  const encodedCity = encodeURIComponent(cityName);
  const possiblePaths = [
    `data/${encodedCity}.json`,
    `${encodedCity}.json`
  ];

  for (const path of possiblePaths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          window.localJsonCache[cityName] = data;
          console.log(`✅ 成功讀取 [${cityName}] 獨立備援庫，共 ${data.length} 筆資料`);
          return data;
        }
      }
    } catch (e) {
      // 嘗試下一個路徑
    }
  }

  console.warn(`⚠️ 未能載入 [${cityName}] 之獨立 JSON 檔`);
  return [];
};

/**
 * 獲取地點 (實時 API 優先，逾時/失敗則秒切該縣市獨立 JSON)
 */
window.fetchOSMData = async function(city, district, onStatusUpdate) {
  const cacheKey = `${city}_${district}`;
  if (window.overpassCache[cacheKey]) {
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 已自快取獲取 ${window.overpassCache[cacheKey].length} 筆地點`);
    return window.overpassCache[cacheKey];
  }

  const center = window.getQueryCenter(city, district);
  const searchRadius = district === "全區" ? 5000 : 3500;

  if (onStatusUpdate) onStatusUpdate(false, `正在讀取 [${city} ${district}] 最新地點...`);

  const query = `
    [out:json][timeout:6];
    (
      node["tourism"~"museum|attraction|gallery|viewpoint|theme_park"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["leisure"~"park|sports_centre|bowling_alley"]["name"](around:${searchRadius},${center[0]},${center[1]});
      node["amenity"~"restaurant|cafe|fast_food|cinema|place_of_worship|marketplace"]["name"](around:${searchRadius},${center[0]},${center[1]});
    );
    out body 40;
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒熔斷

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("API Network Error");
    const data = await res.json();
    const parsed = parseOverpassElements(data.elements, city, district);

    if (parsed.length > 0) {
      window.overpassCache[cacheKey] = parsed;
      if (onStatusUpdate) onStatusUpdate(true, `✅ [${city} ${district}] 獲取 ${parsed.length} 筆實時地點`);
      return parsed;
    } else {
      throw new Error("API 回傳 0 筆資料");
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[${city} ${district}] API 響應逾時或失敗，動態載入 [${city}] 獨立 JSON 備援`);
    const fallbackList = await window.loadCityJsonFallback(city);
    if (onStatusUpdate) onStatusUpdate(true, `✅ [${city}] 已使用在地備援庫 (${fallbackList.length} 筆)`);
    return fallbackList;
  }
};

function parseOverpassElements(elements, city, district) {
  if (!elements || !Array.isArray(elements)) return [];
  const results = [];
  const seenNames = new Set();

  elements.forEach(el => {
    const tags = el.tags || {};
    const name = tags['name:zh-Hant'] || tags['name:zh'] || tags['name'];
    if (!name || name.length < 2 || seenNames.has(name)) return;
    seenNames.add(name);

    let category = "文青靜態";
    let type = "景點";
    let isIndoor = true;
    let isGym = false;
    let nightOnly = false;
    let mondayOff = false;

    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food') {
      type = "美食";
      category = "美食放鬆";
      isGym = true;
    } else if (tags.leisure === 'park' || tags.tourism === 'viewpoint') {
      type = "景點";
      category = "戶外自然";
      isIndoor = false;
      isGym = true;
      if (name.includes("夜市") || name.includes("夜景")) nightOnly = true;
    } else if (tags.leisure === 'sports_centre' || tags.leisure === 'bowling_alley') {
      type = "景點";
      category = "運動休閒";
      isGym = true;
    } else if (tags.tourism === 'museum' || name.includes("博物館") || name.includes("美術館")) {
      type = "景點";
      category = "文青靜態";
      mondayOff = true;
    }

    results.push({
      id: el.id,
      name: name,
      city: city,
      district: district === "全區" ? "觀光區域" : district,
      type: type,
      category: category,
      isIndoor: isIndoor,
      isGymFriendly: isGym,
      nightOnly: nightOnly,
      mondayOff: mondayOff,
      avgCost: type === "美食" ? 220 : 150,
      lat: el.lat,
      lng: el.lon,
      desc: `實時核實地點 (${category})`
    });
  });

  return results;
}
