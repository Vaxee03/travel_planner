// Manual check of link previews on the emulators:
//   npx firebase-tools@14 emulators:exec --only hosting,functions,firestore "node scripts/og-preview-check.mjs"
const FS = "http://127.0.0.1:8080/v1/projects/travel-planner-bb32d/databases/travelplanner/documents";
const H = { Authorization: "Bearer owner", "content-type": "application/json" };
const s = (v) => ({ stringValue: v });
const put = (path, fields) => fetch(`${FS}/${path}`, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
await put("users/ogowner", { nickname: s("김방장") });
await put("trips/ogtrip1234567", {
  ownerId: s("ogowner"), memberIds: { arrayValue: { values: [s("ogowner")] } },
  title: s("오사카 <먹방> 여행"), destination: s("오사카시, 일본 오사카부"), startDate: s("2026-12-01"), endDate: s("2026-12-04"),
  publicShareId: s("0123456789abcdef0123456789abcdef"),
  days: { arrayValue: { values: [{ mapValue: { fields: { date: s("2026-12-01") } } }, { mapValue: { fields: { date: s("2026-12-02") } } }] } },
});
const tags = (html) => ({
  title: html.match(/<title>(.*?)<\/title>/)?.[1],
  ogTitle: html.match(/property="og:title" content="(.*?)"/)?.[1],
  ogDesc: html.match(/property="og:description" content="(.*?)"/)?.[1],
  ogImage: html.match(/property="og:image" content="(.*?)"/)?.[1],
  appScript: /<script type="module"[^>]+src="\/assets\//.test(html),
});
for (const p of ["/join/ogtrip1234567", "/share/0123456789abcdef0123456789abcdef", "/join/doesnotexist123", "/trip/ogtrip1234567/itinerary"]) {
  const res = await fetch(`http://127.0.0.1:5000${p}`, { headers: { "x-forwarded-host": "tripplanner.kr" } });
  console.log(p, res.status, JSON.stringify(tags(await res.text())));
}
process.exit(0);
