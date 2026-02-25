# 내부 견적 앱 (V1)

직원용 견적 계산 웹 앱. Next.js(App Router) + TypeScript + TailwindCSS, 클라이언트 전용 계산(V1).

## 로컬에서 실행하기

1. **의존성 설치**
   ```bash
   cd quotation-app
   npm install
   ```

2. **개발 서버 실행**
   ```bash
   npm run dev
   ```
   브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

3. **로그인**
   - 기본 PIN: `1234` (변경은 `src/config/settings.ts`의 `loginPin` 수정)
   - 로그인 상태는 브라우저 localStorage에 저장되어 재방문 시 자동 로그인됩니다.

## 가격·제품 변경 (설정 파일)

- **공통 설정**  
  `src/config/settings.ts`  
  VAT율, 기본 간격, 최소 공급가, 작업비, POP/DTF/배너 단가, 로그인 PIN 등.

- **제품 목록**  
  `src/config/products.ts`  
  드롭다운에 나올 제품 id와 라벨. 제품 추가/삭제 시 여기 수정.

- **단가·옵션**  
  `src/config/rates.ts`  
  스티커 재질별 A4/A3 단가, 티셔츠 종류·할인 구간, 명함 용지/디자인 등급, 배너 스탠드 등.

UI/계산 로직은 이 설정을 **config provider**를 통해서만 사용하므로, 가격 변경은 config 파일만 수정하면 됩니다.

## 배포 (Vercel) 및 V2 업그레이드

- **배포**
  1. [Vercel](https://vercel.com)에 가입 후 프로젝트를 GitHub 등에 올린 뒤 연결.
  2. 루트 디렉터리를 `quotation-app`으로 지정하거나, 저장소를 `quotation-app`으로 두고 배포.
  3. `npm run build`가 성공하면 자동 배포. 배포된 URL로 어디서나 접속 가능.

- **V2 업그레이드 (관리자 페이지 + DB/API)**
  1. **Config provider 교체**  
     `src/lib/config/index.ts`에서 `localProvider` 대신 `apiProvider`를 사용하도록 변경.  
     `apiProvider`는 API에서 `AppConfig`와 동일한 형태로 설정을 가져와 반환하도록 구현.
  2. **UI/calc 유지**  
     페이지와 `src/lib/calc/*`는 이미 provider 인터페이스만 사용하므로, provider만 바꾸면 DB/API 기반으로 전환 가능.
  3. **관리자 페이지**  
     별도 라우트(예: `/admin`)에서 가격·제품·옵션을 수정하고, API를 통해 DB에 반영.  
     V1의 `settings.ts` / `products.ts` / `rates.ts` 내용을 API 응답으로 내려주면 됨.

## 수동 테스트 체크리스트

- **스티커 시트**
  - 50×50mm, 50매, 아트지, 간격 7mm → A4 공급가 **약 22,000원**인지 확인.
  - 소량 입력 시 최소 공급가 **20,000원** 적용되는지 확인.
- **POP**
  - 폭·높이 둘 다 610mm 초과 입력 시 **"폭 초과(610mm) - 사이즈 확인"** 에러가 표시되는지 확인.
  - **4-cut**과 **2-cut** 공급가가 둘 다 표시되는지 확인.
- **로그인**
  - PIN **1234**로 로그인 후 새로고침해도 로그인 유지되는지 확인.
