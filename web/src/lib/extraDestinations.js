// Curated backup list for countries outside the Places API's 15-country
// international allowlist (see INTERNATIONAL_REGION_CODES in placeSearch.js).
// Merged into search results client-side so trips to these countries still
// get destination suggestions, just at city-list granularity rather than
// Google's full "any town it knows about" coverage.
export const EXTRA_INTERNATIONAL_DESTINATIONS = [
  { country: "인도", cities: ["뉴델리", "뭄바이", "아그라", "자이푸르"] },
  { country: "네팔", cities: ["카트만두", "포카라"] },
  { country: "스리랑카", cities: ["콜롬보", "캔디"] },
  { country: "몽골", cities: ["울란바토르"] },
  { country: "튀르키예", cities: ["이스탄불", "카파도키아", "안탈리아"] },
  { country: "아랍에미리트", cities: ["두바이", "아부다비"] },
  { country: "이집트", cities: ["카이로", "룩소르"] },
  { country: "모로코", cities: ["마라케시", "카사블랑카"] },
  { country: "몰디브", cities: ["몰디브"] },
  { country: "사이판", cities: ["사이판"] },
  { country: "뉴질랜드", cities: ["오클랜드", "퀸스타운"] },
  { country: "캐나다", cities: ["밴쿠버", "토론토", "퀘벡"] },
  { country: "영국", cities: ["런던", "에든버러"] },
  { country: "독일", cities: ["베를린", "뮌헨", "프랑크푸르트"] },
  { country: "스페인", cities: ["바르셀로나", "마드리드", "세비야"] },
  { country: "이탈리아", cities: ["로마", "밀라노", "베네치아", "피렌체"] },
  { country: "스위스", cities: ["취리히", "인터라켄", "루체른"] },
  { country: "체코", cities: ["프라하"] },
  { country: "오스트리아", cities: ["빈", "잘츠부르크"] },
  { country: "네덜란드", cities: ["암스테르담"] },
  { country: "그리스", cities: ["아테네", "산토리니"] },
  { country: "크로아티아", cities: ["자그레브", "두브로브니크"] },
  { country: "포르투갈", cities: ["리스본", "포르투"] },
  { country: "헝가리", cities: ["부다페스트"] },
];
