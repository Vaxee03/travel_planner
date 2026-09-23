import { useState } from "react";
import { uploadReviewPhoto, deleteReviewPhoto, saveTrip } from "../lib/tripsApi";
import { useNicknames } from "../lib/useNicknames";
import { DEFAULT_NICKNAME } from "../lib/users";

export default function Review({ trip, uid, canReview, openModal, requestDelete }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const nicknames = useNicknames((trip.reviews || []).map((r) => r.authorId));

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

  const posts = trip.reviews || [];
  const myPost = posts.find((r) => r.authorId === uid);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url, path } = await uploadReviewPhoto(trip.id, file);
      const t = structuredClone(trip);
      t.reviews = t.reviews || [];
      const idx = t.reviews.findIndex((r) => r.authorId === uid);
      if (idx >= 0) t.reviews[idx].photos = [...(t.reviews[idx].photos || []), { url, path }];
      else t.reviews.push({ authorId: uid, text: "", photos: [{ url, path }], updatedAt: Date.now() });
      await saveTrip(t);
    } catch (err) {
      setError("사진 업로드에 실패했어요: " + (err?.message || "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(photo) {
    const t = structuredClone(trip);
    const idx = t.reviews.findIndex((r) => r.authorId === uid);
    if (idx < 0) return;
    t.reviews[idx].photos = t.reviews[idx].photos.filter((p) => p.path !== photo.path);
    await saveTrip(t);
    deleteReviewPhoto(photo.path);
  }

  return (
    <>
      {(trip.review?.text || trip.review?.photos?.length > 0) && (
        <section>
          <div className="section-head"><h2>이전 공용 후기</h2></div>
          <div className="card">
            {trip.review.text && <div className="review-text">{trip.review.text}</div>}
            {trip.review.photos?.length > 0 && (
              <div className="photo-grid" style={{ marginTop: trip.review.text ? 12 : 0 }}>
                {trip.review.photos.map((p) => (
                  <div className="photo-thumb" key={p.path}>
                    <img src={p.url} alt="여행 사진" loading="lazy" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>여행 후기</h2>
          <button className="btn btn-sm" onClick={() => openModal({ type: "edit-review", uid })}>{myPost ? "내 후기 수정" : "후기 작성"}</button>
        </div>
        {posts.length === 0 ? (
          <div className="empty">아직 등록된 후기가 없어요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {posts.map((post) => {
              const mine = post.authorId === uid;
              return (
                <div className="card" key={post.authorId}>
                  <div className="section-head" style={{ marginBottom: post.text ? 8 : 0 }}>
                    <b>{nicknames[post.authorId] || DEFAULT_NICKNAME}</b>
                    {mine && (
                      <button
                        className="btn-ghost btn-sm btn-danger"
                        onClick={() => requestDelete("delete-review", "내 후기를 삭제할까요?", { authorId: post.authorId })}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  {post.text && <div className="review-text">{post.text}</div>}
                  {(post.photos || []).length > 0 && (
                    <div className="photo-grid" style={{ marginTop: 12 }}>
                      {post.photos.map((p) => (
                        <div className="photo-thumb" key={p.path}>
                          <img src={p.url} alt="여행 사진" loading="lazy" />
                          {mine && <button className="photo-del" onClick={() => handleDeletePhoto(p)}>✕</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  {mine && (
                    <label className="btn btn-sm" style={{ cursor: "pointer", marginTop: 12, display: "inline-block" }}>
                      {uploading ? "업로드 중…" : "+ 사진 추가"}
                      <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={handleFile} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {error && <div className="note"><span className="dot" /><span>{error}</span></div>}
      </section>
    </>
  );
}
