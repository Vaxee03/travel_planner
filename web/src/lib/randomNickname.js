// Used as the pre-filled suggestion when a user hasn't picked a nickname yet
// (see the "set-nickname" modal) — "서술어 + 목적어" so it reads like a real
// Korean nickname (e.g. "신나는 방랑자") rather than a generic placeholder.
const ADJECTIVES = [
  "신나는", "기대되는", "일상에 지친", "설레는", "자유로운",
  "느긋한", "호기심 많은", "길 잃은", "배고픈", "낭만적인",
  "부지런한", "즉흥적인", "짐 가벼운", "여유로운", "떠돌이 같은",
];

const NOUNS = [
  "동행자", "방랑자", "여행가", "모험가", "나그네",
  "탐험가", "여행자", "방랑객", "길손", "역마살",
];

export function randomNickname() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}
