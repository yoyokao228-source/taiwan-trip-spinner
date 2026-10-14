/**
 * 全台灣 22 縣市同縣市嚴格隔離真實名店與景點備援庫
 */
const REAL_VENUES_DB = [
  // 臺北市
  { city: "臺北市", district: "信義區", type: "美食", name: "一蘭拉麵 (台北本店)", category: "美食放鬆", avgCost: 320, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.0345, lng: 121.5670, desc: "經典豚骨湯頭與獨立座位用餐體驗。" },
  { city: "臺北市", district: "信義區", type: "美食", name: "少點鹽健康餐盒", category: "美食放鬆", avgCost: 160, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.0380, lng: 121.5500, desc: "少油低GI嫩煎高蛋白原型餐盒。" },
  { city: "臺北市", district: "信義區", type: "景點", name: "象山親山步道", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.0273, lng: 121.5707, desc: "俯瞰台北101與城市夕陽絕佳自然步道。" },
  { city: "臺北市", district: "中正區", type: "景點", name: "華山1914文創園區", category: "文青靜態", avgCost: 250, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 25.0441, lng: 121.5294, desc: "歷史舊酒廠建築、當期特展與質感風格店家。" },
  { city: "臺北市", district: "大安區", type: "美食", name: "鼎泰豐 (信義本店)", category: "美食放鬆", avgCost: 450, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.0334, lng: 121.5298, desc: "黃金十八摺國際級小籠包與精緻麵點。" },
  { city: "臺北市", district: "中山區", type: "景點", name: "臺北市立美術館", category: "文青靜態", avgCost: 30, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 25.0722, lng: 121.5248, desc: "現代藝術地標，靜態展覽與光影建築美學。" },

  // 新北市
  { city: "新北市", district: "淡水區", type: "景點", name: "淡水紅毛城", category: "文青靜態", avgCost: 80, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 25.1755, lng: 121.4328, desc: "國定古蹟建築群，俯瞰淡水河口落日餘暉。" },
  { city: "新北市", district: "瑞芳區", type: "景點", name: "九份老街", category: "戶外自然", avgCost: 150, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.1089, lng: 121.8060, desc: "山城燈火景色與特色芋圓茶樓巡禮。" },
  { city: "新北市", district: "板橋區", type: "美食", name: "小蒙牛頂級麻辣養生鍋", category: "美食放鬆", avgCost: 699, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 25.0117, lng: 121.4658, desc: "養生麻辣鴛鴦湯頭與豐富溫體肉品。" },

  // 基隆市
  { city: "基隆市", district: "仁愛區", type: "美食", name: "基隆廟口夜市 (營養三明治)", category: "美食放鬆", avgCost: 150, isIndoor: false, isGymFriendly: false, nightOnly: true, mondayOff: false, lat: 25.1283, lng: 121.7419, desc: "全台知名夜市，匯聚鼎邊趖、泡泡冰與一口吃香腸。" },
  { city: "基隆市", district: "中正區", type: "景點", name: "正濱漁港彩色屋", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 25.1500, lng: 121.7600, desc: "台版威尼斯繽紛彩色建築港灣打卡地標。" },

  // 桃園市
  { city: "桃園市", district: "大溪區", type: "景點", name: "大溪老街", category: "文青靜態", avgCost: 100, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.8806, lng: 121.2869, desc: "巴洛克風格立面街屋與古早味黑豆干。" },
  { city: "桃園市", district: "中壢區", type: "美食", name: "張豐盛商行", category: "美食放鬆", avgCost: 90, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.9656, lng: 121.2250, desc: "百年花生堅果老店，人氣濃郁雙色花生芝麻霜淇淋。" },

  // 新竹市 / 新竹縣
  { city: "新竹市", district: "東區", type: "景點", name: "新竹市立動物園", category: "戶外自然", avgCost: 50, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: true, lat: 24.7980, lng: 120.9810, desc: "無籠子親近自然的跨時代老字號動物園。" },
  { city: "新竹縣", district: "北埔鄉", type: "景點", name: "北埔老街", category: "文青靜態", avgCost: 120, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.7011, lng: 121.0581, desc: "客家擂茶DIY體驗與經典柿餅老街。" },

  // 苗栗縣
  { city: "苗栗縣", district: "三義鄉", type: "景點", name: "龍騰斷橋 (魚藤坪斷橋)", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 24.3820, lng: 120.7600, desc: "紅磚拱橋遺跡與鐵道自行車動態體驗。" },

  // 臺中市
  { city: "臺中市", district: "西屯區", type: "美食", name: "茶六燒肉堂 (朝富店)", category: "美食放鬆", avgCost: 900, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 24.1645, lng: 120.6380, desc: "台中代表性精緻肉品碳火燒肉。" },
  { city: "臺中市", district: "西屯區", type: "景點", name: "臺中國家歌劇院", category: "文青靜態", avgCost: 100, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 24.1627, lng: 120.6405, desc: "曲牆建築美學，結合空中花園與藝文展演。" },
  { city: "臺中市", district: "西區", type: "景點", name: "審計新村", category: "文青靜態", avgCost: 0, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.1458, lng: 120.6625, desc: "舊宿舍改建文創市集，手作甜點與風格攤位。" },

  // 彰化縣
  { city: "彰化縣", district: "鹿港鎮", type: "景點", name: "鹿港天后宮 / 鹿港老街", category: "文青靜態", avgCost: 100, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.0569, lng: 120.4358, desc: "國定古蹟廟宇、摸乳巷與在地蚵仔煎小吃。" },

  // 南投縣
  { city: "南投縣", district: "魚池鄉", type: "景點", name: "日月潭水社碼頭", category: "戶外自然", avgCost: 300, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.8967, lng: 120.9358, desc: "環湖單車道慢行與遊湖船票巡禮。" },

  // 雲林縣 / 嘉義市 / 嘉義縣
  { city: "雲林縣", district: "虎尾鎮", type: "景點", name: "雲林布袋戲館", category: "文青靜態", avgCost: 0, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 23.7081, lng: 120.4314, desc: "日治郡役所歷史建築，展示掌中戲文化偶戲。" },
  { city: "嘉義市", district: "東區", type: "美食", name: "林聰明沙鍋魚頭", category: "美食放鬆", avgCost: 250, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.4800, lng: 120.4600, desc: "濃郁高湯濃郁沙茶與炸魚頭在地排隊名店。" },
  { city: "嘉義縣", district: "太保市", type: "景點", name: "故宮南院", category: "文青靜態", avgCost: 150, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 23.4589, lng: 120.2931, desc: "亞洲藝術文化博物館與水岸景觀園區。" },

  // 臺南市
  { city: "臺南市", district: "永康區", type: "美食", name: "鴻品牛肉湯", category: "美食放鬆", avgCost: 220, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.0312, lng: 120.2510, desc: "新鮮溫體牛肉現沖高湯，精質蛋白質補充首選。" },
  { city: "臺南市", district: "永康區", type: "美食", name: "聯盈發港式點心", category: "美食放鬆", avgCost: 280, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.0245, lng: 120.2562, desc: "在地熱門港式點心，爆漿流沙包與鮮蝦腐皮卷。" },
  { city: "臺南市", district: "永康區", type: "景點", name: "原岩攀岩館 (台南館)", category: "運動休閒", avgCost: 450, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.0280, lng: 120.2450, desc: "專業室內抱石與攀岩教練指導場域。" },
  { city: "臺南市", district: "永康區", type: "景點", name: "永康探索教育公園", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.0210, lng: 120.2580, desc: "大片綠地與戶外探索體驗設施的大型公園。" },
  { city: "臺南市", district: "中西區", type: "美食", name: "文章牛肉湯", category: "美食放鬆", avgCost: 180, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 22.9996, lng: 120.1906, desc: "熱門溫體牛肉湯配牛肉燥飯。" },
  { city: "臺南市", district: "中西區", type: "景點", name: "林百貨", category: "文青靜態", avgCost: 100, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 22.9916, lng: 120.2026, desc: "昭和風情古蹟百貨與原創文創選物。" },
  { city: "臺南市", district: "仁德區", type: "景點", name: "奇美博物館", category: "文青靜態", avgCost: 200, isIndoor: true, isGymFriendly: false, nightOnly: false, mondayOff: true, lat: 22.9347, lng: 120.2260, desc: "宏偉西洋藝術與名琴珍藏展覽殿堂。" },

  // 高雄市
  { city: "高雄市", district: "鼓山區", type: "景點", name: "駁二藝術特區", category: "文青靜態", avgCost: 150, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 22.6200, lng: 120.2810, desc: "港區舊倉庫群改建，戶外裝置藝術與風格展覽。" },
  { city: "高雄市", district: "左營區", type: "美食", name: "劉家酸白菜火鍋", category: "美食放鬆", avgCost: 450, isIndoor: true, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 22.6882, lng: 120.2943, desc: "眷村老字號傳統炭燒銅鍋酸菜白肉鍋與捲餅。" },

  // 屏東縣 / 宜蘭縣 / 花蓮縣 / 臺東縣 / 離島
  { city: "屏東縣", district: "恆春鎮", type: "景點", name: "墾丁白沙灣", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 21.9340, lng: 120.7170, desc: "細白沙灘與蔚藍海岸，水上動態活動體驗。" },
  { city: "宜蘭縣", district: "礁溪鄉", type: "景點", name: "湯圍溝溫泉公園", category: "戶外自然", avgCost: 80, isIndoor: false, isGymFriendly: false, nightOnly: false, mondayOff: false, lat: 24.8280, lng: 121.7720, desc: "天然溫泉泡腳池與溫泉魚體驗。" },
  { city: "花蓮縣", district: "新城鄉", type: "景點", name: "七星潭風景區", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 24.0300, lng: 121.6300, desc: "月牙灣礫石海灘，聆聽海浪與觀星聖地。" },
  { city: "臺東縣", district: "池上鄉", type: "景點", name: "伯朗大道", category: "戶外自然", avgCost: 100, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.1220, lng: 121.2180, desc: "翠綠稻田金黃稻浪與金城武樹單車騎行。" },
  { city: "澎湖縣", district: "馬公市", type: "景點", name: "澎湖跨海大橋", category: "戶外自然", avgCost: 0, isIndoor: false, isGymFriendly: true, nightOnly: false, mondayOff: false, lat: 23.6480, lng: 119.5580, desc: "連接白沙與西嶼地標大橋，絕美海天一色景色。" }
];
