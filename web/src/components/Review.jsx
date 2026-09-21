import { useState } from "react";
import { uploadReviewPhoto, deleteReviewPhoto, saveTrip } from "../lib/tripsApi";

export default function Review({ trip, canReview, openModal }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!canReview) {
    return (
      <section>
        <div className="review-locked">
          <span>🔒</span>
          <span>여행 종료일({trip.endDate}) 이후에 후기와 사진을 등록할 수 있어요.</span>
        </div>
      </section>
    );
  }

  const review = trip.review || { text: "", photos: [] };
  const photos = review.photos || [];

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url, path } = await uploadReviewPhoto(trip.id, file);
      const next = { ...trip, review: { ...review, photos: [...photos, { url, path }] } };
      await saveTrip(next);
    } catch (err) {
      setError("사진 업로드에 실패했어요: " + (err?.message || "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(photo) {
    const next = { ...trip, review: { ...review, photos: photos.filter((p) => p.path !== photo.path) } };
    await saveTrip(next);
    deleteReviewPhoto(photo.path);
  }

  return (
    <>
      <section>
        <div className="section-head">
          <h2>여행 후기</h2>
          <button className="btn btn-sm" onClick={() => openModal({ type: "edit-review" })}>{review.text ? "후기 수정" : "후기 작성"}</button>
        </div>
        <div className="card">
          {review.text
            ? <div className="review-text">{review.text}</div>
            : <div style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>아직 후기가 없어요.</div>}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>사진</h2>
          <label className="btn btn-sm" style={{ cursor: "pointer" }}>
            {uploading ? "업로드 중…" : "+ 사진 추가"}
            <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={handleFile} />
          </label>
        </div>
        {photos.length === 0 ? (
          <div className="empty">등록된 사진이 없어요.</div>
        ) : (
          <div className="photo-grid">
            {photos.map((p) => (
              <div className="photo-thumb" key={p.path}>
                <img src={p.url} alt="여행 사진" loading="lazy" />
                <button className="photo-del" onClick={() => handleDeletePhoto(p)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {error && <div className="note"><span className="dot" /><span>{error}</span></div>}
      </section>
    </>
  );
}
