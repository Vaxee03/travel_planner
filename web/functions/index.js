const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

const MODEL = "gemini-3.6-flash";

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no JSON array found in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

exports.recommendRestaurants = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  }
  const destination = String(request.data?.destination || "").trim().slice(0, 100);
  const preferences = String(request.data?.preferences || "").trim().slice(0, 200);
  const tripType = request.data?.tripType === "domestic" ? "domestic" : "international";
  if (!destination) {
    throw new HttpsError("invalid-argument", "여행지 정보가 필요해요.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `당신은 여행 맛집 추천 전문가입니다. "${destination}"을(를) 여행하는 사람에게 현지 맛집 5곳을 추천해주세요.
반드시 구글 검색으로 실제 존재를 확인한, 지금도 영업 중인 곳만 추천하세요. 지어내지 마세요.
${tripType === "domestic" ? "이 여행은 대한민국 국내 여행입니다. 반드시 대한민국 국내에 위치한 곳만 추천하세요. 해외 지점, 해외 위치는 절대 포함하지 마세요." : ""}
${preferences ? `사용자가 원하는 조건: "${preferences}". 이 조건에 맞는 곳 위주로 추천하세요.` : ""}
아래 JSON 배열 형식으로만 응답하세요. 다른 설명, 인사말, 코드블록 표시 없이 순수 JSON 배열만 출력하세요.
[
  { "name": "가게 이름", "category": "음식 종류", "reason": "한두 문장의 추천 이유", "address": "대략적인 주소나 지역" }
]`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
  } catch (err) {
    console.error("Gemini call failed", err);
    throw new HttpsError("internal", "맛집 추천을 가져오지 못했어요.");
  }

  const text = response.text || "";
  try {
    const items = extractJson(text);
    if (!Array.isArray(items) || items.length === 0) throw new Error("empty list");
    return { destination, preferences, tripType, items, generatedAt: Date.now() };
  } catch (err) {
    console.error("Failed to parse Gemini response", err, text);
    throw new HttpsError("internal", "추천 결과를 처리하지 못했어요. 다시 시도해주세요.");
  }
});
