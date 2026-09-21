# 여행 플래너 — 독립 웹앱

Claude 아티팩트 버전(`../index.html`)을 React + Vite + Firebase로 이식한 버전입니다. 이 버전에서만 가능한 것: **지도를 클릭해서 위치를 직접 찍어 일정 항목에 등록**.

## 처음 설정하기

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 에서 새 프로젝트 생성
2. **Firestore Database** 만들기 (프로덕션 모드로 시작해도 됨 — 규칙은 이미 `firestore.rules`에 있음)
3. **Storage** 활성화 (사진 저장용)
4. **Authentication** → Sign-in method → **익명(Anonymous)** 활성화
5. 프로젝트 개요 → 웹 앱 추가(</> 아이콘) → 나오는 `firebaseConfig` 객체 값을 복사

### 2. Google Maps API 키 만들기
1. https://console.cloud.google.com 에서 위 Firebase와 같은 프로젝트 선택 (Firebase 프로젝트는 자동으로 GCP 프로젝트이기도 함)
2. **API 및 서비스** → 라이브러리에서 **Maps JavaScript API**, **Places API**, **Geocoding API** 활성화
3. **사용자 인증 정보**에서 API 키 생성
4. 키를 편집 → **애플리케이션 제한사항**을 "HTTP 리퍼러"로 설정하고 `localhost/*`, 나중에 배포할 도메인(`*.web.app/*`) 추가
5. **결제 계정 등록 필요** (매달 무료 크레딧이 넉넉해서 개인 사용은 보통 과금되지 않음)

### 3. 값 채우기
```bash
cp .env.local.example .env.local
```
`.env.local`을 열어 위에서 복사한 값들을 채워넣으세요. 이 파일은 git에 커밋되지 않습니다.

### 4. 실행
```bash
npm install
npm run dev
```

## 기존 데이터 옮기기 (1회성)

`.env.local`을 채운 뒤:
```bash
node scripts/seed.mjs
```
아티팩트에 있던 "도쿄 & 하코네", "이갱 전역 여행" 두 여행을 새 Firestore로 복사합니다. 실행 후 나오는 `?join=<id>` 안내를 따라 앱에서 한 번 열면 내 계정이 해당 여행의 멤버로 추가됩니다.

## 배포

```bash
npm install -g firebase-tools   # 최초 1회
firebase login                  # 브라우저 인증 필요 (직접 실행)
npm run build
firebase deploy
```

## 동행자 초대

여행 화면 URL 뒤에 `?join=<여행ID>`를 붙여서 보내면, 그 링크를 연 사람이 자동으로 멤버로 추가되어 같은 여행을 실시간으로 같이 보고 수정할 수 있어요.

## 아직 없는 기능 (다음 단계)

- AI 맛집 추천 — Anthropic API를 서버에서 호출해야 해서 Firebase Blaze 요금제 업그레이드 후 별도 작업 필요
- 정식 로그인/이메일 인증, 결제, 앱스토어 패키징
