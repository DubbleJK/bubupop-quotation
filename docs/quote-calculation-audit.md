# 부부피오피 견적 계산 감사

작성 기준: 저장소 소스와, 그 소스가 export한 계산 함수를 **코드 기본값**으로 호출한 결과.

이번 문서만 추가했다. 계산 코드, 관리자 설정, 판매가격, 데이터베이스는 변경하지 않았다. 배포 환경의 Vercel KV와 브라우저 localStorage는 열지 않았다. 로그인 PIN, API 키, 환경변수 비밀값은 적지 않는다.

금액 표의 "실행"은 해당 함수를 기본 설정으로 호출해 받은 값이다. "대입"은 그 함수와 같은 식을 다른 수량에 넣어 계산한 값이며, 같은 프로세스 출력에는 없다. "추정"은 현장 공정이나 운영 저장값을 확인하지 못한 해석이다.

---

## 1. 현재 프로젝트 기술 스택

확인 위치: `package.json`, `src/app`, `src/lib/config`.

| 항목 | 확인된 내용 |
|---|---|
| 앱 | Next.js App Router, `next` ^16.2.3 |
| UI | React ^19.2.5, Tailwind CSS ^3.4.14 |
| 언어 | TypeScript ^5 |
| 계산 위치 | 브라우저. 견적 페이지와 폼은 `"use client"` |
| 설정 저장 | 브라우저 `localStorage` + 선택적 Vercel KV (`@vercel/kv` ^1.0.1, 키 `quotation_admin_config`) |
| 관계형 DB / ORM | 소스에 없음 |
| 견적 이력 API | 소스에 없음 |
| 자동 테스트 | `*.test.ts` / `*.spec.ts` 없음. UV 모듈 안에 기대 최종가 상수만 있음 |
| 배포 단서 | `.vercel/project.json`의 프로젝트 이름 `quotation-app`. Git remote `DubbleJK/bubupop-quotation` |

화면 흐름은 확인된 라우트 기준이다.

1. `/` 에서 품목을 고르면 `/quote?product=` 로 이동한다.
2. 견적 화면은 로그인 없이 계산한다.
3. `/admin` 은 브라우저에 세션 표시가 있을 때만 연다.

포털 주소는 `src/lib/portalUrl.ts` 가 만든다. 환경변수 `NEXT_PUBLIC_PORTAL_URL` 이 있으면 그 값, 개발 모드는 `http://localhost:3001`, 그 외는 `https://bubupop-portal.vercel.app` 이다.

---

## 2. 8개 품목의 계산 함수 위치와 핵심 코드

품목 목록의 원본은 `src/config/products.ts` 이다. 견적 화면 `src/app/quote/page.tsx` 가 `productId` 로 폼을 고르고, 각 폼이 아래 함수를 호출한다.

대표 금액도 품목마다 다르다. UV만 부가세와 수량 정책까지 넣은 `finalPrice` 를 큰 숫자로 쓴다. 나머지는 공급가(부가세 전)를 큰 숫자로 쓴다.

### 2.1 POP

| 항목 | 내용 |
|---|---|
| 함수 | `calcPop` |
| 파일 | `src/lib/calc/pop.ts` |
| 폼 | `src/components/forms/PopForm.tsx` |
| 입력 | 폭 mm, 높이 mm, 수량. 간격 입력 없음 |
| 기본값 | 롤 폭 610, 4-cut 63,452원/m, 2-cut 55,046원/m, 부가세율 0.1 |
| 설정 적용 | `settings.popRollWidthMm`, `popSellPerM4`, `popSellPerM2`, `vatRate`. 관리자 화면에서 이 네 값을 수정할 수 있다 |
| 최소금액 / 수량할인 | 없음 |
| 재료비·인건비·작업비 | 판매 미터 단가만 사용. 원단 매입비, 분당 인건비, 작업비 항목 없음 |

공식:

1. 폭과 높이가 모두 롤 폭보다 크면 금액 0과 에러 문자열을 반환한다.
2. 한 장 소비 길이(mm)는 롤에 들어가는 방향의 반대 변이다. 양쪽 다 롤 폭 이하이면 더 짧은 변이다.
3. 사용 길이(m) = 한 장 길이 / 1000 × 수량.
4. 4-cut 공급가 = 사용 길이 × `popSellPerM4`, 10원 반올림.
5. 2-cut 공급가 = 사용 길이 × `popSellPerM2`, 10원 반올림.
6. 부가세·총액은 `calcVatAndTotal`.

롤 폭 방향으로 몇 장 들어가는지는 세지 않는다. 조각 사이 간격도 없다.

실행 (`calcPop`, 기본 설정):

| 입력 | 결과 |
|---|---|
| 200×200mm, 10장 | 길이 2.00m, 4-cut 공급가 126,900원, 부가세 12,690원, 총액 139,590원. 2-cut 공급가 110,090원 |
| 100×700mm, 4장 | 길이 2.80m, 4-cut 공급가 177,670원. 짧은 변이 롤에 들어가므로 긴 변을 진행 길이로 쓴다 |
| 50×50mm, 10장 | 길이 0.50m |
| 700×800mm, 1장 | 에러 `폭 초과(610mm) - 사이즈 확인`, 공급가 0 |

같은 롤 폭으로 "폭 방향에 여러 장"을 넣는 비교 배치를 따로 계산하면 200×200mm 10장은 3열×4행 = 0.80m, 50×50mm 10장은 0.05m이다. 이 비교 배치는 앱 함수가 아니다. 현장 POP이 한 줄 재단인지 네스팅인지는 이 소스로 확정할 수 없다. 확정된 사실은 앱이 폭 방향 개수를 곱하지 않는다는 점이다.

에러 문구의 `610mm` 는 소스에 글자로 박혀 있다. 비교에 쓰는 값은 `popRollWidthMm` 이다. 관리자가 롤 폭을 바꾸면 판정과 문구가 어긋난다. 이 불일치는 소스로 확인했고, 롤 폭을 바꾼 실행은 하지 않았다.

### 2.2 스티커 시트

| 항목 | 내용 |
|---|---|
| 함수 | `calcStickerSheet` |
| 파일 | `src/lib/calc/stickerSheet.ts` |
| 폼 | `src/components/forms/StickerSheetForm.tsx` |
| 입력 | 재질, 가로 mm, 세로 mm, 수량, 간격 mm |
| 화면 기본 간격 | `settings.defaultGapMm` = 5 |
| 설정 적용 | 재단 여백, 작업비, 최소 공급가, 장당 컷팅 초, 부가세율, 재질별 A4/A3 단가, 용지 크기. 관리자는 재질 단가·작업비·최소 공급가·기본 간격을 수정한다. 용지 mm와 재단 여백·컷팅 초의 입력칸은 관리자 화면에 없다 |
| 최소금액 | `minStickerSupply` 20,000원. 작업비 + 장수×단가와 비교해 더 큰 값 |
| 수량할인 | 없음 |

재질 기본 단가 (`src/config/rates.ts`):

| 재질 키 | 화면 이름 | A4 | A3 |
|---|---|---:|---:|
| Art | 아트지 | 500 | 980 |
| Modjo | 모조지 | 500 | 980 |
| Yupo | 유포지 | 950 | 2,100 |
| TransparentDeadlong | 투명데드롱 | 950 | 사용 안 함 (`a3` 0, `a3Available` false) |

용지 기본 크기: A4 210×297mm, A3 297×420mm. 사방 재단 `trimMarginMm` 5mm를 빼면 배치 영역은 A4 200×287mm, A3 287×410mm이다.

공식:

1. 한 칸은 `스티커 변 + 간격`이다. 마지막 칸 뒤의 간격도 포함한다.
2. 가로 배치와 세로 배치 중 장당 개수가 많은 쪽을 쓴다. 0이어도 최소 1로 올린다.
3. 장수 = 수량 / 장당 개수, 올림.
4. 분 = 장수 × 30초 / 60, 올림. 금액에 넣지 않는다.
5. 공급가 = max(작업비 15,000 + 장수 × 장당 단가, 20,000), 10원 반올림.
6. A4와 A3를 각각 계산한다. 투명데드롱 A3는 계산하지 않고 공급가 0, `disabled` 이다.
7. 화면의 큰 숫자는 A4 공급가이다.

실행:

| 입력 | A4 | A3 |
|---|---|---|
| 아트지 50×50mm, 50매, 간격 5mm | 장당 15개, 4장, 2분, 공급가 20,000원 (작업비 15,000 + 4×500 = 17,000 이 최소금액 미만), 부가세 2,000, 총액 22,000 | 장당 35개, 2장, 공급가 20,000 |
| 같은 입력, 간격 7mm | 장당 개수가 같아 공급가 20,000 | 공급가 20,000 |
| 아트지 20×20mm, 1매, 간격 5mm | 장당 88개, 1장, 공급가 20,000 | 공급가 20,000 |
| 아트지 300×300mm, 2매, 간격 5mm | 장당 1개로 강제, 2장, 공급가 20,000 | 장당 1개로 강제, 공급가 20,000 |
| 투명데드롱 50×50mm, 50매 | 공급가 20,000 | disabled, 공급가 0 |

300mm는 A4 유효 폭 200mm, A3 유효 폭 287mm보다 크다. 함수는 에러 없이 20,000원을 반환했다. 1매짜리 작은 스티커와 공급가가 같다. 최소 공급가가 배치 실패를 금액으로 구분하지 못한다.

`README.md` 체크리스트는 50×50mm, 50매, 아트지, 간격 7mm의 A4 공급가를 약 22,000원으로 적는다. 이번 실행의 공급가는 20,000원이고, 부가세 포함 총액이 22,000원이다.

### 2.3 솔벤트 스티커

| 항목 | 내용 |
|---|---|
| 함수 | `calcStickerSolvent` |
| 파일 | `src/lib/calc/stickerSolvent.ts` |
| 폼 | `src/components/forms/StickerSolventForm.tsx` |
| 입력 | 가로 mm, 세로 mm, 수량, 간격 mm. 화면 기본 간격 5 |
| 기본값 | 롤 폭 620, 작업비 15,000. 미터 단가는 솔벤트 전용 필드가 없고 `popSellPerM4` 63,452원/m |
| 설정 적용 | 관리자의 솔벤트 칸은 롤 폭과 작업비뿐이다. 4-cut 단가를 바꾸면 POP 4-cut과 솔벤트 공급가가 함께 바뀐다 |
| 최소금액 / 수량할인 | 없음 |
| 재료비·인건비 | 작업비는 정액이다. 길이에 비례하지 않는다. 원단 매입비 항목 없음 |

공식:

1. 가로를 롤 폭에 두는 경우와 세로를 롤 폭에 두는 경우를 모두 계산한다.
2. 폭 방향 개수 = 롤 폭 / (그 변 + 간격), 버림. 0이면 1로 올린다.
3. 줄 수 = 수량 / 폭 방향 개수, 올림.
4. 길이(mm) = 줄 수 × (진행 방향 변 + 간격). 마지막 줄 뒤 간격도 포함된다.
5. 더 짧은 길이를 고르고 1000으로 나눠 m로 만든다.
6. 공급가 = 작업비 + 길이 × POP 4-cut 단가, 10원 반올림.

실행:

| 입력 | 결과 |
|---|---|
| 50×50mm, 100장, 간격 5mm | 길이 0.55m, 공급가 49,900원, 부가세 4,990원, 총액 54,890원 |
| 700×800mm, 2장, 간격 5mm | 에러 없음. 길이 1.41m, 공급가 104,470원, 부가세 10,450원, 총액 114,920원 |

700mm와 800mm는 롤 폭 620mm보다 크다. 폭 방향 개수가 0이 된 뒤 1로 올라가, 들어가지 않는 규격도 금액이 나온다.

### 2.4 UV아크릴키링

| 항목 | 내용 |
|---|---|
| 함수 | `calculateQuote` (`getArea`, `getUnitSupplyPrice`, `getVat`, `getAdjustmentRate`) |
| 파일 | `src/lib/calc/uvAcrylicKeyring.ts` |
| 폼 | `src/components/forms/UvAcrylicKeyringForm.tsx` |
| 입력 | 가로 mm, 세로 mm, 수량(1 이상의 정수) |
| 설정 적용 | `AppConfig` 와 관리자 화면을 사용하지 않는다. 단가, 부가세 10%, 수량 배율이 파일 상수다 |
| 최소금액 | 별도 최소 공급가 없음. 수량 1개는 면적과 거의 무관한 고정가 |
| 수량 정책 | 개당 단가 구간과, 부가세 포함가에 곱하는 배율이 따로 있다 |

공식:

1. 면적(㎠) = 가로 × 세로 / 100.
2. 수량 1: 면적 8.4㎠ 이하면 5,800원, 초과면 6,000원.
3. 수량 2 이상: `Math.round(기본금 + 면적 × 면적계수)`.
4. 공급가 합계 = 개당 단가 × 수량. 여기서는 다시 반올림하지 않는다.
5. 부가세 = `Math.round(공급가 합계 × 0.1)`. 10원 단위가 아니다. `settings.vatRate` 를 읽지 않는다.
6. 부가세 포함가 = 공급가 합계 + 부가세.
7. 최종가 = `Math.round(부가세 포함가 × 수량 배율)`.

개당 단가 구간:

| 수량 | 기본금 | 면적계수 |
|---|---:|---:|
| 2~10 | 1,700 | 13.7 |
| 11~50 | 1,195 | 14.8 |
| 51~100 | 1,145 | 14.1 |
| 101~200 | 1,069 | 14.0 |
| 201~300 | 1,053 | 13.6 |
| 301~400 | 1,040 | 13.5 |
| 401~500 | 1,030 | 13.56 |
| 501 이상 | 1,013 | 13.61 |

부가세 포함가에 곱하는 배율:

| 수량 | 배율 |
|---|---:|
| 1~10 | 1.10 |
| 11~49 | 1.07 |
| 50~200 | 1.05 |
| 201~299 | 1.02 |
| 300 이상 | 0.99 |

재료비, 출력비, 컷팅비, 작업시간 항목은 없다. 가로 또는 세로가 1,000mm를 넘거나 수량이 100,000을 넘으면 폼이 경고 문구를 띄우고, 계산은 그대로 한다.

실행한 `calculateQuote` 는 파일에 적힌 검증 상수와 일치했다.

| 입력 | 최종가 |
|---|---:|
| 45×30mm, 1개 | 7,260 |
| 45×30mm, 100개 | 154,193 |
| 47×47mm, 200개 | 318,318 |
| 50×50mm, 500개 | 745,421 |
| 47×47mm, 1,000개 | 1,430,946 |

45×30mm (면적 13.5㎠)를 수량만 바꿔 실행한 값:

| 수량 | 개당 공급가 | 공급가 합계 | 부가세 | 배율 | 최종가 |
|---:|---:|---:|---:|---:|---:|
| 1 | 6,000 | 6,000 | 600 | 1.10 | 7,260 |
| 10 | 1,885 | 18,850 | 1,885 | 1.10 | 22,809 |
| 11 | 1,395 | 15,345 | 1,535 | 1.07 | 18,062 |
| 49 | 1,395 | 68,355 | 6,836 | 1.07 | 80,454 |
| 50 | 1,395 | 69,750 | 6,975 | 1.05 | 80,561 |
| 200 | 1,258 | 251,600 | 25,160 | 1.05 | 290,598 |
| 201 | 1,237 | 248,637 | 24,864 | 1.02 | 278,971 |
| 299 | 1,237 | 369,863 | 36,986 | 1.02 | 414,986 |
| 300 | 1,237 | 371,100 | 37,110 | 0.99 | 404,128 |

수량 1개의 개당 가격은 면적이 8.4㎠를 넘는 순간부터 크기와 관계없이 6,000원이다. 45×30mm와 그보다 큰 100×100mm(면적 100㎠)의 1개 단가가 같은 분기이다. 100×100mm 1개의 최종가를 별도로 출력하지는 않았고, `getUnitSupplyPrice` 의 수량 1 분기가 그렇게 작성되어 있다.

### 2.5 DTF

| 항목 | 내용 |
|---|---|
| 함수 | `calcDtf`, 내부 `layout` |
| 파일 | `src/lib/calc/dtf.ts` |
| 폼 | `src/components/forms/DtfForm.tsx` |
| 입력 | 디자인별 가로 mm, 세로 mm, 수량. 줄 추가 가능 |
| 기본값 | 롤 폭 850, 간격 7, 판매 13,900원/m, 참고 원가 1,350원/m, 1m당 5분 |
| 설정 적용 | 관리자 DTF 칸의 판매 단가, 참고 원가, 분/m, 롤 폭, 간격 |
| 최소금액 / 수량할인 | 없음 |

한 디자인:

1. 가로를 롤 폭에 두는 배치와 세로를 롤 폭에 두는 배치 중 길이가 짧은 쪽을 고른다.
2. 그 방향 크기가 롤 폭보다 크면 그 방향의 길이는 `Infinity` 이다.
3. 한 줄 개수 = (롤 폭 + 간격) / (조각 폭 + 간격), 버림, 최소 1. 간격은 조각 사이에만 둔다.
4. 길이(mm) = 줄 수 × 진행 방향 크기 + (줄 수 - 1) × 간격.
5. 공급가 = 길이(m) × 판매 단가, 10원 반올림.
6. 참고 원가 = 길이 × `dtfCostPerM`, 10원 반올림. 공급가에 더하지 않는다.
7. 예상 분 = 길이 × 5, 올림. 공급가에 더하지 않는다.

여러 디자인이면 폼이 각 공급가를 더한 뒤 `calcVatAndTotal` 을 한 번 호출한다. 길이, 참고 원가, 분은 각 줄을 더한다.

실행:

| 입력 | 결과 |
|---|---|
| 100×100mm, 10장 | 한 줄 8개, 2줄, 0.207m, 회전 없음, 공급가 2,880원, 부가세 290원, 총액 3,170원, 참고 원가 280원, 2분 |
| 800×200mm, 5장 | 한 줄 1개, 1.028m, 공급가 14,290원, 참고 원가 1,390원 |
| 900×900mm, 1장 | 두 방향 모두 롤 폭 850mm 초과. `lengthM`, 공급가, 부가세, 참고 원가, 예상 분이 `Infinity` |
| 100×80mm 3장과 200×150mm 2장을 각각 계산 | 공급가 1,110원과 2,090원 |

기본값에서 100×100mm 10장의 판매 공급가 2,880원은 참고 원가 280원보다 크다. 판매 단가가 원가 단가보다 낮아도 막는 코드는 없다. 그 역전 상황을 기본값으로 실행하지는 않았다.

`DtfForm` 은 `Infinity` 를 에러로 바꾸지 않는다. `lengthM.toFixed(2)` 와 금액 표시로 넘어간다.

### 2.6 티셔츠

| 항목 | 내용 |
|---|---|
| 함수 | `calcTshirt`, 내부 `getDiscountRate` |
| 파일 | `src/lib/calc/tshirt.ts` |
| 폼 | `src/components/forms/TshirtForm.tsx` |
| 입력 | 종류, 총 수량, 그중 2XL 이상 수량. 2XL 수량은 0 이상이고 총 수량 이하여야 결과가 나온다 |
| 기본 단가 | 반팔 18,000, 긴팔 20,000, 후드 25,000, 윈드브레이커 35,000. 2XL 이상 1장당 3,000원 |
| 설정 적용 | 값은 `AppConfig` 에 들어 있어 저장 JSON에는 포함된다. 관리자 화면에는 티셔츠 입력칸이 없다 |
| 최소금액 | 없음 |

할인은 배열 앞에서부터 처음 맞는 구간이다. 파일 순서는 100장 25%, 50장 20%, 10장 10%이다. 이 순서이면 큰 수량이 먼저 걸린다. 배열이 10장 구간부터 시작하면 50장·100장 할인은 쓰이지 않는다. 관리자 화면은 이 배열을 편집하지 않는다.

공식:

1. 기본금액 = 단가 × 총 수량.
2. 사이즈 추가 = 2XL 이상 수량 × 3,000.
3. 공급가 = (기본금액 + 사이즈 추가) × (1 - 할인율), 10원 반올림.
4. 부가세는 그 공급가에 한 번.

실행:

| 입력 | 할인율 | 공급가 | 부가세 | 총액 |
|---|---:|---:|---:|---:|
| 반팔 9장, 2XL 0 | 0% | 162,000 | 16,200 | 178,200 |
| 반팔 10장, 2XL 0 | 10% | 162,000 | 16,200 | 178,200 |
| 반팔 10장, 그중 2XL 2장 | 10% | 167,400 | 16,740 | 184,140 |
| 후드 100장, 그중 2XL 10장 | 25% | 1,897,500 | 189,750 | 2,087,250 |

10장 중 2XL 2장의 식은 (180,000 + 6,000) × 0.9 = 167,400 이다. 할인율은 한 번이다. 그 한 번이 사이즈 추가금까지 포함한 합계에 곱해진다. 추가금 6,000원만 할인에서 빼면 168,000원이다. 이 168,000원은 앱이 반환한 값이 아니라 비교용 대입이다.

같은 식에 반팔, 2XL 0을 대입하면 49장은 할인 10%로 793,800원, 50장은 할인 20%로 720,000원이다. 수량이 늘면 공급가가 내려간다. 이 49·50장 숫자는 프로세스 출력에 없고, 실행한 `calcTshirt` 와 같은 식이다.

종류를 찾지 못하면 단가는 0이고 공급가도 0이다. 폼은 목록의 첫 종류를 기본 선택한다.

### 2.7 명함

| 항목 | 내용 |
|---|---|
| 함수 | `calcBusinessCard` |
| 파일 | `src/lib/calc/businessCard.ts` |
| 폼 | `src/components/forms/BusinessCardForm.tsx` |
| 입력 | 용지 옵션 id, 디자인 등급 id, 매수. 가로·세로 없음 |
| 설정 적용 | 관리자에서 옵션 이름, 등록된 매수의 금액, 디자인 수수료를 수정한다. 매수 칸을 새로 만드는 UI는 없다 |

기본 인쇄비:

| 용지 | 매수 | 금액 |
|---|---:|---:|
| 수입 당일제 | 100 | 20,000 |
| 수입 당일제 | 200 | 25,000 |
| 아트지 | 500 | 15,000 |

기본 디자인 수수료: 출력만 0, 베이직 8,000, 스탠다드 20,000, 프리미엄 30,000.

공급가 = 인쇄비 + 디자인 수수료, 10원 반올림. 부가세는 합계에 한 번. 표에 없는 매수는 인쇄비 0이다. `pcs` 가 0이거나 없으면 인쇄비 0이다.

실행:

| 입력 | 인쇄비 | 디자인비 | 공급가 | 총액 |
|---|---:|---:|---:|---:|
| 수입 당일제 100매, 베이직 | 20,000 | 8,000 | 28,000 | 30,800 |
| 수입 당일제 300매, 베이직 | 0 | 8,000 | 8,000 | 8,800 |

폼은 매수 선택지를 `prices` 의 키로만 만든다. 수입 당일제는 100·200, 아트지는 키가 하나라 매수 선택 자체가 숨겨지고 500매가 된다. 용지를 바꾸면 매수를 그 용지의 첫 키로 다시 넣는다. 따라서 현재 폼 조작만으로는 300매를 보낼 수 없다. 300매 0원 인쇄비는 함수를 직접 호출했을 때 재현된다.

### 2.8 배너

| 항목 | 내용 |
|---|---|
| 함수 | `calcBanner` |
| 파일 | `src/lib/calc/banner.ts` |
| 폼 | `src/components/forms/BannerForm.tsx` |
| 입력 | 출력 장수, 실내 거치대 수량, 실외 거치대 수량. 폭·높이 입력 없음 |
| 기본값 | 출력 1장 22,000, 실내 거치대 15,000, 실외 거치대 28,000 |
| 설정 적용 | 관리자 배너 칸 세 개 단가 |
| 최소금액 / 수량할인 | 없음 |
| 재료비·인건비 | 항목 없음. 크기에 비례하는 출력비도 없다 |

공급가 = 출력 장수 × 장당가 + 실내 수량 × 실내 단가 + 실외 수량 × 실외 단가, 10원 반올림.

실행:

| 입력 | 공급가 | 부가세 | 총액 |
|---|---:|---:|---:|
| 출력 1, 거치대 0 | 22,000 | 2,200 | 24,200 |
| 출력 2, 실내 1, 실외 1 | 87,000 | 8,700 | 95,700 |

출력·거치대가 모두 0이면 폼이 계산을 호출하지 않는다. 계산 함수 자체는 0을 받아 공급가 0을 만들 수 있다. 0 호출은 이번 실행에 넣지 않았다.

---

## 3. 가격 및 관리자 설정 데이터 구조

### 3.1 코드 기본값의 모양

`AppConfig` (`src/lib/config/types.ts`) 한 덩어리다.

- `settings`: 부가세율, 간격, 재단 여백, 스티커 최소 공급가, 시트 작업비, 솔벤트 작업비, POP 단가 두 개, POP 롤 폭, 솔벤트 롤 폭, DTF 판매·원가·분·롤·간격, 시트 컷팅 초, 로그인 PIN, 배너 단가 세 개
- `products`: id와 표시 이름
- `stickerRates`, `stickerSheetSizes`
- `tshirtTypes`, `tshirtSizeUpPer2XL`, `tshirtDiscountTiers`
- `businessCardOptions`, `businessCardDesignTiers`

UV 단가와 배율은 이 타입 밖에 있다.

기본 숫자의 원본은 `src/config/settings.ts`, `src/config/rates.ts` 이다. PIN 값은 이 문서에 적지 않는다.

### 3.2 저장 위치

| 저장소 | 키 | 내용 |
|---|---|---|
| 브라우저 localStorage | `quotation_admin_config` | 관리자가 저장한 `AppConfig` JSON |
| 브라우저 localStorage | `quotation_admin_default_config` | "현재 설정을 기본값으로 저장" 스냅샷. 이 브라우저에만 있음 |
| 브라우저 localStorage | `quotation_admin_session` | 로그인 표시. 값 존재 여부만 검사 |
| Vercel KV | `quotation_admin_config` | JSON 문자열 하나. `src/app/api/config/route.ts` |

KV 클라이언트를 만들지 못하면 GET은 404, POST는 503이다. 환경변수가 실제로 붙어 있는지는 이번 분석에서 확인하지 않았다.

### 3.3 우선순위

`src/lib/config/localProvider.ts` 기준이다.

`getInitialConfig()` (첫 화면 동기 값):

1. 이미 메모리에 올린 설정
2. 이 브라우저의 `quotation_admin_config`
3. 코드 기본값

`getAllConfig()`:

1. 이 브라우저에 저장본이 있으면 그 값을 즉시 반환한다. 이어서 `/api/config` 를 8초 제한으로 호출하고, 성공하면 메모리와 localStorage를 서버 값으로 덮어쓴다. 이미 화면에 넘긴 React 상태를 다시 그리는 코드는 없다.
2. 저장본이 없으면 `/api/config` 를 2초 제한으로 기다린다. 성공하면 그 값을 쓰고 localStorage에도 넣는다.
3. 실패하면 메모리 값, 그다음 코드 기본값.

따라서 같은 브라우저에 예전 저장본이 있으면, 그 페이지의 첫 계산은 서버보다 저장본을 쓴다. 서버 반영은 다음 진입 이후에 보일 수 있다. 이 순서는 소스로 확인했다. 브라우저에서 새로고침 실험을 하지는 않았다.

품목 목록은 `mergeProductCatalog` 가 코드의 8개 id를 항상 채운다. 구버전 JSON에 UV가 없어도 화면 목록에는 붙는다. 라벨은 저장값이 있으면 저장값을 쓴다. UV 가격 상수는 이 병합과 무관하다.

### 3.4 저장과 복원

관리자 저장 (`src/app/admin/page.tsx` `handleSave`):

1. 화면의 PIN 필드 값과 편집 중인 설정 전체를 POST 한다.
2. KV에 기존 설정이 있으면, 그 설정의 PIN과 POST의 PIN이 같을 때만 저장한다.
3. KV가 503이면 예외로 처리하지 않고, localStorage에 저장한 뒤 "저장됨"을 띄운다.
4. 401이면 저장을 중단한다.

PIN 필드를 수정한 값은 곧 서버로 보내는 PIN이다. KV에 설정이 이미 있으면, 필드를 바꾼 뒤의 PIN은 저장된 PIN과 달라 401이 된다. 이 경로는 소스로 확인했다. 운영 KV에 대해 재현하지는 않았다.

"기본값 복원"은 localStorage의 현재 설정 키만 바꾼다. KV POST는 하지 않는다. 다음 `getAllConfig` 에서 서버 값이 저장본을 다시 덮을 수 있다. 이것도 코드 경로이며, 운영 KV 재현은 하지 않았다.

### 3.5 가격을 바꾸면 영향받는 품목

| 관리자에서 바꾸는 값 | 영향 |
|---|---|
| `popSellPerM4` | POP 4-cut, 솔벤트 공급가 |
| `popSellPerM2` | POP 2-cut |
| `vatRate` | UV를 제외한 7개 품목의 부가세 |
| 스티커 재질 단가, 시트 작업비, 최소 공급가 | 스티커 시트 |
| 솔벤트 롤 폭, 솔벤트 작업비 | 솔벤트 |
| DTF 판매 단가 | DTF 공급가 |
| DTF 참고 원가 | 화면의 참고 원가. 공급가 공식에는 없음 |
| 명함 표, 디자인 수수료 | 명함 |
| 배너 세 단가 | 배너 |
| 티셔츠 단가·할인 | 데이터에는 있으나 관리자 입력칸 없음 |
| UV 구간·배율 | 설정 데이터에 없음 |

### 3.6 하드코딩과 중복

확인된 하드코딩:

- UV의 부가세율, 1개 가격, 구간표, 배율 (`uvAcrylicKeyring.ts`)
- POP 에러 문구의 `610mm` (`pop.ts`)
- 스티커 재질 한글 이름 (`StickerSheetForm.tsx` 의 `MATERIAL_LABELS`)
- 시트 장당 개수가 0일 때 1, 솔벤트 폭 방향 개수가 0일 때 1, DTF 한 줄 개수 최소 1

확인된 중복:

- 솔벤트 미터 단가와 POP 4-cut 단가가 같은 필드다.
- 부가세 10%가 `settings.vatRate` 와 UV 상수 `VAT_RATE` 두 곳에 있다.
- 롤 간격 처리가 세 가지다. POP은 간격 없음. 스티커 시트와 솔벤트는 칸마다 간격을 붙여 마지막 뒤에도 간격이 있다. DTF는 조각 사이에만 간격이 있다.
- 티셔츠 할인 구간과 UV 수량 구간은 둘 다 수량 정책이지만 공통 모듈이 없다.

### 3.7 견적 당시 가격이 저장되는가

저장되지 않는다. 견적 입력, 공급가, 적용 단가를 기록하는 API·테이블·localStorage 키는 `src` 검색에서 없었다. 관리자 설정을 나중에 바꾸면, 과거에 불러 준 금액과 비교할 기록이 코드상 없다.

---

## 4. 공통으로 사용되는 계산 함수

`src/lib/calc/common.ts`

- `roundToNearest10(value) = Math.round(value / 10) * 10`
- `calcVatAndTotal(supply, vatRate)`: 부가세와 총액을 각각 10원 반올림

사용처: POP, 스티커 시트, 솔벤트, DTF, 티셔츠, 명함, 배너. DTF 복수 디자인의 합산 부가세도 폼에서 이 함수를 다시 호출한다.

UV는 이 파일을 import하지 않는다. 1원 `Math.round` 를 쓰고, 배율은 부가세 포함가에 적용한다.

설정 접근의 공통 지점은 `src/lib/config/index.ts` 의 `configProvider` 이다. 지금 구현은 `localProvider` 하나다. 계산 함수는 provider를 직접 부르지 않고, 폼이 골라 준 설정 조각을 인자로 받는다. UV 폼은 설정 인자가 없다.

공유 원가 함수, 공임 함수, 네스팅 함수는 없다. 품목 파일이 각각 배치와 금액을 계산한다.

---

## 5. 실제 확인된 계산 오류

아래 판정은 이번 소스와 기본값 실행 기준이다.

### 5.1 UV아크릴키링: 수량이 늘면 최종가가 줄어든다

재현됨. `calculateQuote` 를 수량 1부터 800까지 연속 호출했다.

45×30mm에서 최종가가 바로 전 수량보다 낮아진 지점:

| 수량 변화 | 최종가 변화 | 원인 |
|---|---|---|
| 1 → 2 | 7,260 → 4,562 (−2,698) | 1개 고정 6,000원에서 2~10개 구간 1,885원으로 하락. 배율은 둘 다 1.10 |
| 10 → 11 | 22,809 → 18,062 (−4,747) | 단가 구간과 배율 1.10 → 1.07이 동시에 바뀜 |
| 50 → 51 | 80,561 → 78,639 (−1,922) | 단가 구간만 변경. 배율은 1.05 유지 |
| 100 → 101 | 154,193 → 146,752 (−7,441) | 단가 구간 |
| 200 → 201 | 290,598 → 278,971 (−11,627) | 단가 구간과 배율 1.05 → 1.02 |
| 299 → 300 | 414,986 → 404,128 (−10,858) | 배율 1.02 → 0.99. 개당 단가는 1,237원으로 동일 |
| 300 → 301 | 404,128 → 400,558 (−3,570) | 단가 구간 |
| 400 → 401 | 532,303 → 529,703 (−2,600) | 단가 구간 |
| 500 → 501 | 660,479 → 653,070 (−7,409) | 단가 구간 |

47×47mm, 50×50mm도 같은 경계에서 감소했다. 100×100mm는 1→2에서는 감소 목록에 없었고, 10→11부터의 구간 경계에서는 감소했다. 수량 1 고정가가 2개 구간의 총액보다 비싼 크기에서 1→2 역전이 난다.

검증 상수 5개는 그 수량에서의 최종가와 일치했다. 상수는 구간을 한 칸 넘었을 때의 감소를 검사하지 않는다.

### 5.2 DTF 판매단가와 원가

판매 공식과 원가 표시는 분리되어 있다. `supplyPrice` 는 `dtfSellPerM` 만 쓰고, `costReference` 는 `dtfCostPerM` 로 따로 계산해 화면에 "참고 원가"로 둔다. 기본값 100×100mm 10장은 공급가 2,880원, 참고 원가 280원으로, 판매가가 원가 표시보다 작지 않다.

확인된 빈틈은 다음이다.

- 판매 미터 단가가 원가 미터 단가보다 낮아도 견적을 막지 않는다.
- 참고 원가는 이익률 계산에 쓰이지 않는다.
- 가로·세로가 모두 롤 폭을 넘으면 공급가가 `Infinity` 가 된다. 900×900mm 1장 실행에서 확인했다. 폼은 이 값을 에러 문구로 바꾸지 않는다.

### 5.3 POP 사용 길이

함수는 일관되게 "한 장당 진행 길이 × 수량"이다. 폭 방향 매수는 없다.

실행으로 확인한 길이:

- 200×200mm 10장 → 2.00m, 4-cut 126,900원
- 50×50mm 10장 → 0.50m
- 100×700mm 4장 → 2.80m

비교용으로, 같은 610mm 롤에 폭 방향으로 최대한 넣는 배치를 계산하면 각각 0.80m, 0.05m, 0.70m이다. 이 비교식은 앱에 없다. 현장 장비가 한 줄만 재단한다면 현재 식이 맞고, 여러 장을 폭에 넣는다면 견적 길이가 재료 길이보다 길다. 어느 공정인지는 추정이다.

양쪽 모두 롤 폭을 넘는 입력은 0원과 에러로 처리된다. 700×800mm 1장에서 확인했다. 한 변만 넘는 입력은 에러 없이 긴 변 × 수량이다.

### 5.4 스티커 시트의 배치 불가 규격

재현됨. 300×300mm는 유효 용지에 들어가지 않는데 `perSheetCapacity` 가 1을 반환하고, 2매 공급가가 A4·A3 모두 20,000원이었다. 배치 가능한 20×20mm 1매도 최소 공급가 때문에 20,000원이다. 화면 금액만 보면 두 주문이 같다.

### 5.5 솔벤트가 POP 단가를 참조

재현됨. `calcStickerSolvent` 의 단가 인자는 `popSellPerM4` 이다. 50×50mm 100장의 공급가 49,900원은 작업비 15,000 + 0.55m × 63,452원을 10원 반올림한 값과 같다.

롤에 들어가지 않는 700×800mm 2장도 에러 없이 104,470원이 나왔다.

### 5.6 티셔츠 할인과 사이즈 추가금

할인율이 두 번 곱해지지는 않는다. 실행한 10장·2XL 2장의 공급가 167,400원은 (단가 합계 + 사이즈 추가) × 0.9 한 번이다.

그 구조 때문에 추가금도 같은 비율로 줄어든다. 후드 100장·2XL 10장 실행값은 1,897,500원이고, 식은 (2,500,000 + 30,000) × 0.75 이다.

수량이 늘어도 공급가가 내려가거나 같은 지점이 있다.

- 실행: 반팔 9장 162,000원 = 반팔 10장 162,000원
- 대입: 반팔 49장 793,800원, 50장 720,000원

### 5.7 명함 미등록 수량

함수는 재현됨. 수입 당일제 300매 + 베이직은 인쇄비 0, 공급가 8,000원이다.

현재 폼은 등록된 매수만 고르게 되어 있어, 화면 클릭만으로 이 입력이 나가지 않는다. 가격표 JSON이 비거나 키가 어긋나면 같은 0원 분기를 탈 수 있다. 그런 저장본은 이번 분석에서 열지 않았다.

### 5.8 배너 크기

재현됨. `BannerInput` 과 폼에 폭·높이가 없다. 출력 1장의 공급가는 크기와 무관하게 22,000원이다.

### 5.9 부가세·반올림 기준

재현됨.

| 구분 | UV | 나머지 7개 품목 |
|---|---|---|
| 반올림 | 개당 단가, 부가세, 최종가가 각각 1원 `Math.round` | 공급가, 부가세, 총액이 각각 10원 |
| 부가세 기준 금액 | 개당 단가 × 수량 | 10원 반올림이 끝난 공급가 |
| 수량 정책 적용 시점 | 부가세를 더한 뒤에 배율 | 티셔츠만 공급가 계산 중에 할인. 다른 품목은 수량 정책 없음 |
| 화면의 큰 숫자 | 최종 판매가 (부가세·배율 포함) | 공급가 (부가세 별도) |
| 부가세율 출처 | 파일 상수 0.1 | `settings.vatRate` |

DTF 여러 줄은 줄 공급가를 10원 반올림한 뒤 더하고, 그 합에 부가세를 한 번 매긴다. 실행한 1,110원 + 2,090원 쌍은 줄별 부가세 합도 320원, 합산 후 부가세도 320원으로 같았다.

같은 `roundToNearest10` 은 줄별 합과 합산 후 한 번 계산이 항상 같지는 않다. 1,040원의 10%는 104원이고 10원 반올림하면 100원이다. 1,040원 두 줄의 부가세를 따로 더하면 200원, 2,080원에 한 번 매기면 210원이다. 이 1,040원 쌍이 DTF 입력에서 나오는지는 확인하지 않았다. 반올림 함수의 성질과, DTF 폼이 합산 후 한 번 매긴다는 코드 경로는 확인했다.

---

## 6. 향후 발생 가능한 구조적 문제

코드로 보이는 위험이다. 운영 데이터에서 이미 발생했는지는 확인하지 않았다.

1. 견적 스냅샷이 없어, 단가 수정 이후에는 예전에 안내한 금액을 재현할 수 없다.
2. 브라우저 저장본과 KV가 어긋나면 같은 URL에서도 기기마다 금액이 다를 수 있다. 첫 화면은 저장본을 먼저 쓴다.
3. 관리자 저장이 설정 전체를 한 JSON으로 덮어쓴다. 구버전 JSON에 없는 필드는 화면 편집 객체를 저장하는 과정에서 빠지거나, 반대로 화면에 없는 티셔츠 값이 그대로 다시 저장된다.
4. 티셔츠 할인 배열 순서가 바뀌면 높은 할인 구간이 무시된다. 지금은 편집 UI가 없어 화면에서 순서를 바꾸지는 못한다.
5. UV를 코드에 추가해도 관리자 가격 화면에는 나타나지 않는다. 이미 한 번 그렇게 추가된 상태다.
6. `popSellPerM4` 이름과 달리 솔벤트 판매가의 기준 단가이다. 이름만 보고 POP만 바꾼다고 생각하면 솔벤트까지 바뀐다.
7. 최소 공급가, 작업비, 판매 미터 단가가 한 필드로 섞여 있어 원가와 목표 이익을 나중에 분리하기 어렵다.
8. 배치 실패가 0원, `Infinity`, 정상처럼 보이는 최소금액 중 하나로 갈린다. 품목마다 실패 표현이 다르다.
9. 로그인 판별은 브라우저 저장값이고, 견적 API는 PIN 없이 설정을 읽는다. 내부용으로 둔 구조이며, 금액 계산의 정확도와는 별개다.
10. 자동 테스트가 없어 구간 경계의 총액 감소가 배포 전에 잡히지 않는다. UV 상수 5개는 각 구간의 한 점만 본다.

---

## 7. 재사용할 수 있는 코드

통합 계산으로 바꿀 때 그대로 둘 수 있는 부분이다. 이번 작업에서 리팩터링하지는 않았다.

| 유지하기 좋은 것 | 이유 |
|---|---|
| 품목 선택 UI, `/quote`, 폼 레이아웃, `StickySummary` | 입력과 결과 표시는 계산 함수 바깥에 있다 |
| `ConfigProvider` 인터페이스 | 폼이 provider 구현을 직접 알지 않는다 |
| `AppConfig` 를 한 번에 읽고 저장하는 `/api/config` | 필드를 늘리는 방식으로 설정을 확장할 수 있다. 스키마 이주는 저장본 호환이 필요하다 |
| `mergeProductCatalog` 같은 정규화 | 구버전 JSON에 새 필드를 채우는 자리가 이미 있다 |
| 순수 함수로 나뉜 `src/lib/calc/*` | 화면과 분리되어 있어 함수 단위로 교체할 수 있다 |
| `roundToNearest10`, `calcVatAndTotal` | 7개 품목의 돈 처리가 한 곳이다. UV를 여기로 합치면 반올림 규칙을 한 정책으로 만들 수 있다 |
| 명함·배너·티셔츠의 "표 또는 단가 × 수량" 구조 | 고정 가격표 정책으로 옮기기 쉽다 |
| DTF `layout` 의 간격 처리 | 조각 사이에만 간격을 두는 롤 배치의 출발점으로 쓸 수 있다. `Infinity` 반환은 에러 값으로 바꾸는 편이 낫다 |

다시 짜야 하는 부분:

| 대상 | 이유 |
|---|---|
| UV 상수 블록 | 관리자 설정과 부가세 정책 밖에 있다 |
| POP 길이 식 | 폭 방향 매수가 없다. 공정이 확정되기 전에는 식을 바꾸면 판매가가 크게 달라진다 |
| 스티커 `Math.max(..., 1)`, 솔벤트 `Math.max(across, 1)` | 불가능 규격을 1개 배치로 둔다 |
| 솔벤트의 `popSellPerM4` 의존 | 품목 단가가 묶여 있다 |
| 티셔츠 할인 적용 범위 | 추가금 포함 여부는 정책 결정이 필요하다 |
| 품목별 폼 안의 합산 (DTF) | 줄 합산과 부가세 시점이 공통 정책으로 올라가야 한다 |
| 관리자 입력칸 | 티셔츠가 없고 UV가 없다. 배너 크기, 시트 용지 mm, 재단 여백도 없다 |

---

## 8. 통합 계산 시스템 개선 제안

기존 화면과 KV의 `AppConfig` JSON을 유지한 채 단계를 나눌 수 있다. 아래는 제안이며, 적용하지 않았다.

### 8.1 공통 원가

지금 숫자로 대응되는 것:

- 원자재·매입비: DTF 참고 원가 한 항목뿐. 판매가에 연결되지 않음
- 장비 출력 원가: 없음. POP·솔벤트·DTF·배너는 판매 단가만 있음
- 작업시간·인건비: 스티커 분, DTF 분이 표시용. 시급을 곱하지 않음. 시트 작업비 15,000원과 솔벤트 작업비 15,000원은 정액
- 후가공: 티셔츠 2XL 추가금만 별도. 컷팅은 스티커 시간으로만 표시
- 세팅비·로스·포장비: 필드 없음

제안하는 공통 원가 레코드는 품목 판매가와 다른 층으로 둔다.

- 자재: id, 단위(m, 장, 개), 매입 단가, 롤 폭 또는 용지 크기
- 장비: id, 단위당 변동 원가, 분당 속도
- 공정: 컷팅, 코팅, 열프레스, 거치대. 정액 또는 단위당
- 로스율, 세팅비, 포장비

현재 JSON에 이 층을 추가하고, 비어 있으면 지금 판매 공식만 쓰게 하면 기존 저장본과 공존할 수 있다.

### 8.2 공통 판매 정책

품목이 고르는 정책 타입으로 나누면 지금 구조를 흡수할 수 있다.

| 정책 | 현재 해당 품목 |
|---|---|
| 고정 가격표 | 명함, 배너, 티셔츠 기본 단가, UV 수량 1개 |
| 원가 × (1 + 목표 이익률) | 해당 없음. DTF 참고 원가는 씨앗만 있음 |
| 공정 합산 (자재 길이 × 단가 + 정액 작업비 + 후가공) | 스티커 시트, 솔벤트, DTF 판매 길이, POP |
| 최소 판매금액 | 스티커 시트 20,000원 |
| 수량 할인 | 티셔츠 비율 할인, UV 배율 |
| 부가세·반올림 | 한 세트로 모은다. 적용 순서를 "공급가 확정 → 10원 반올림 → 부가세 → 총액"으로 고정할지는 정책 결정 |

UV의 "부가세 포함가 × 배율"은 이 순서와 다르다. 순서를 통일하면 최종가가 바뀐다. 통일 전에 5.1의 표를 기준선으로 남겨야 한다.

수량 할인은 "단가에만", "추가금 제외", "합계에 한 번" 중 하나를 정책 필드로 둔다. 지금은 티셔츠가 합계에 한 번, UV가 부가세 포함가에 한 번이다.

구간 단가는 다음 구간이 이전 수량 총액보다 낮아지지 않는지 검사하는 규칙을 둔다. 5.1은 그 검사가 없음을 보여 준다.

### 8.3 품목별 설정

각 품목은 다음만 지정한다.

- 사용할 자재 id (롤, 용지, 원단, 아크릴)
- 공정 목록 (출력, 컷팅, 프레스, 거치대)
- 계산 방식: 네스팅 롤 / 시트 배치 / 고정표 / 면적 구간
- 옵션과 수량 정책 id

POP과 솔벤트는 같은 롤 네스팅 방식을 쓸 수 있으나 자재 id와 판매 단가 id는 분리한다. 배치는 DTF의 "사이에만 간격"을 기본 후보로 두고, 시트는 재단 여백을 뺀 영역에 같은 배치를 쓴다. 들어가지 않으면 금액 대신 에러를 반환한다.

배너에 크기를 반영하려면 입력 필드와 자재 소모 공식이 새로 필요하다. 지금 단가는 크기 없는 고정표로 남길 수 있다. 둘 중 무엇을 판매 규칙으로 할지는 코드만으로 정할 수 없다.

### 8.4 기존 UI·저장소를 유지하는 방법

- 라우트 `/`, `/quote`, `/admin` 과 품목 버튼은 유지한다.
- KV는 계속 `quotation_admin_config` 한 키에 JSON을 넣는다. 읽는 쪽에서 없는 필드를 기본값으로 채운다. `mergeProductCatalog` 와 같은 방식이다.
- 계산 함수 시그니처를 한 번에 지우지 않고, 새 엔진 결과를 기존 결과 타입으로 맞춘 뒤 폼을 옮긴다.
- 견적 이력은 새 키가 필요하다. 기존 설정 키와 섞지 않는다. 이번 소스에는 그 저장소가 없다.

---

## 9. 수정 대상 파일 목록

아래는 이후 구현 때 손댈 후보이다. 이번 분석에서 수정한 애플리케이션 파일은 없다. 이번 변경은 이 문서뿐이다.

| 파일 | 이후 손댈 이유 |
|---|---|
| `src/lib/calc/common.ts` | 반올림·부가세 순서의 단일 정책 |
| `src/lib/calc/pop.ts` | 배치 방식, 에러 문구의 고정 610 |
| `src/lib/calc/stickerSheet.ts` | 배치 불가 시 1장 처리, 최소금액과의 구분 |
| `src/lib/calc/stickerSolvent.ts` | POP 단가 분리, 폭 초과 처리 |
| `src/lib/calc/dtf.ts` | `Infinity` 대신 명시적 실패, 원가와 판매가의 관계 |
| `src/lib/calc/tshirt.ts` | 할인 적용 범위, 구간 순서 의존 |
| `src/lib/calc/businessCard.ts` | 미등록 매수의 0원 |
| `src/lib/calc/banner.ts` | 크기 미반영. 정책을 유지한다면 문서화만으로 충분 |
| `src/lib/calc/uvAcrylicKeyring.ts` | 상수 제거, 구간 역전, 부가세 순서 |
| `src/config/settings.ts`, `src/config/rates.ts`, `src/lib/config/types.ts` | 자재·공정·정책 필드 |
| `src/lib/config/localProvider.ts` | 구버전 JSON 채우기, 서버 설정이 화면까지 반영되는 경로 |
| `src/app/api/config/route.ts` | 설정 저장 검증. 견적 스냅샷을 넣더라도 이 키와 분리 |
| `src/app/admin/page.tsx` | 티셔츠·UV 편집, POP 단가가 솔벤트에 묶인 사실의 표시 |
| `src/components/forms/*.tsx` | 새 결과 필드, 배치 실패 메시지 |
| `src/app/quote/page.tsx` | 품목과 계산기 연결 |
| `README.md` | 공급가 22,000원 체크리스트가 현재 실행(공급가 20,000, 총액 22,000)과 다름 |

새 파일이 필요해지는 지점: 공통 네스팅, 가격 정책 모듈, 견적 스냅샷 저장, 구간 역전 테스트. 경로는 구현 시에 정한다.

---

## 10. 단계별 개발 계획

가격을 한 번에 갈아엎지 않는 순서이다. 각 단계 전에 11절의 기존 금액을 고정한다.

1. 기준선 테스트만 추가한다. 기대값은 이 문서의 실행 결과로 두고, 제품 코드의 숫자는 바꾸지 않는다.
2. 돈 처리 순서를 문서로 확정한다. UV를 7개 품목과 같게 할지, UV만 예외로 둘지 결정한다. 결정 전에는 코드를 합치지 않는다.
3. 설정 타입에 자재·공정·정책 필드를 추가하고, 없을 때 현재 공식으로 계산하게 한다. 기존 KV JSON이 그대로 읽혀야 한다.
4. 솔벤트 미터 단가 필드를 새로 두고, 비어 있으면 `popSellPerM4` 를 읽게 한다. 기본 판매가는 이 단계에서 변하지 않는다.
5. 배치 실패를 금액 대신 에러로 바꾼다. 대상은 시트 초과 크기, 솔벤트 롤 초과, DTF 양쪽 초과이다. 이 단계는 일부 주문의 금액이 사라지므로 기준선과 diff를 남긴다.
6. UV 구간표와 배율을 설정으로 옮긴다. 숫자는 지금 상수와 같게 시드한다. 관리자 칸을 추가한다.
7. 티셔츠 관리자 칸을 추가한다. 할인 배열은 저장 시 `minQty` 내림차순으로 정규화한다.
8. 수량 구간 저장 시 "다음 수량 총액이 이전보다 낮은가"를 경고한다. UV 5.1 표를 회귀 샘플로 둔다. 경고를 막을지, 단가를 자동으로 올릴지는 별도 결정이다.
9. 티셔츠 추가금을 할인 밖에 둘지 결정하고, 9장=10장, 49장>50장 케이스를 새 기대값으로 교체한다.
10. POP 네스팅 적용 여부는 현장 확인 후에만 바꾼다. 바꾸면 2.1의 길이가 크게 줄어 판매가가 내려간다.
11. 배너에 크기를 넣을지는 판매 정책 결정 후 입력 필드를 추가한다. 결정 전에는 고정표를 유지한다.
12. 견적 스냅샷 저장을 설정 JSON과 다른 키로 추가한다. 고객 견적 번호 체계는 현재 소스에 없다.

---

## 11. 기존 견적가격과 새 가격을 비교할 테스트 계획

운영 KV 단가가 코드 기본값과 다를 수 있다. 비교 테스트는 두 층을 둔다.

1. 코드 기본값 고정 테스트. 이 문서의 실행 결과가 기대값이다. 리팩터링만 한 커밋에서는 diff가 0이어야 한다.
2. 정책 변경 커밋에서는 같은 입력의 이전 출력과 새 출력을 표로 남긴다. 자동으로 같아야 한다고 단정하지 않는다.

코드 기본값으로 이미 실행해 고정할 샘플:

| ID | 품목 | 입력 | 현재 핵심 결과 |
|---|---|---|---|
| POP-200 | POP | 200×200mm, 10장 | 길이 2.00m, 4-cut 공급가 126,900, 부가세 12,690, 총액 139,590. 2-cut 공급가 110,090 |
| POP-50 | POP | 50×50mm, 10장 | 길이 0.50m |
| POP-OVER | POP | 700×800mm, 1장 | 에러, 공급가 0 |
| STK-MIN | 스티커 시트 | 아트지 50×50mm, 50매, 간격 5mm | A4 장당 15, 4장, 공급가 20,000, 부가세 2,000, 총액 22,000. A3 공급가 20,000 |
| STK-BIG | 스티커 시트 | 아트지 300×300mm, 2매, 간격 5mm | A4·A3 모두 장당 1로 강제, 공급가 20,000. 이후 "에러로 바꿀" 단계의 대조군 |
| STK-A3OFF | 스티커 시트 | 투명데드롱 50×50mm, 50매 | A3 disabled, 공급가 0 |
| SOL-50 | 솔벤트 | 50×50mm, 100장, 간격 5mm | 0.55m, 공급가 49,900, 부가세 4,990, 총액 54,890 |
| SOL-OVER | 솔벤트 | 700×800mm, 2장, 간격 5mm | 1.41m, 공급가 104,470. 에러 없음 |
| UV-REF | UV | 파일의 검증 상수 5개 | 최종가 7,260 / 154,193 / 318,318 / 745,421 / 1,430,946 |
| UV-DROP | UV | 45×30mm, 수량 1, 2, 10, 11, 299, 300 | 최종가 7,260, 4,562, 22,809, 18,062, 414,986, 404,128 |
| DTF-100 | DTF | 100×100mm, 10장 | 0.207m, 공급가 2,880, 부가세 290, 총액 3,170, 참고 원가 280 |
| DTF-SUM | DTF | 100×80mm×3 과 200×150mm×2 | 줄 공급가 1,110과 2,090. 합산 부가세 320 |
| DTF-INF | DTF | 900×900mm, 1장 | 유한한 공급가가 아님 (`Infinity`) |
| TSH-9-10 | 티셔츠 | 반팔 9장, 반팔 10장 | 둘 다 공급가 162,000 |
| TSH-XL | 티셔츠 | 반팔 10장, 2XL 2장 | 공급가 167,400 |
| TSH-100 | 티셔츠 | 후드 100장, 2XL 10장 | 공급가 1,897,500, 할인율 0.25 |
| CARD-100 | 명함 | 수입 당일제 100, 베이직 | 공급가 28,000, 총액 30,800 |
| CARD-300 | 명함 | 수입 당일제 300, 베이직 | 인쇄비 0, 공급가 8,000. 폼 경로는 별도 테스트 |
| BNR-1 | 배너 | 출력 1 | 공급가 22,000 |
| BNR-MIX | 배너 | 출력 2, 실내 1, 실외 1 | 공급가 87,000 |

추가로 둘 테스트:

- 관리자 저장본이 있는 상태에서 같은 입력을 계산하면 코드 기본값과 달라질 수 있다. 테스트는 설정을 인자로 주입하고, 브라우저 저장소에 의존하지 않는다.
- `vatRate` 를 0.1이 아닌 값으로 넣었을 때 UV만 0.1로 남는 현재 동작을, 정책을 통일한 뒤에는 UV도 따라가는지 본다.
- 스티커 최소 공급가 케이스는 공급가 20,000과 총액 22,000을 둘 다 기대값에 적는다. README의 "공급가 약 22,000" 문구와 섞지 않는다.

새 가격을 도입하는 커밋의 합격 조건은 "전 품목 금액 동일"이 아니다. 바뀌기로 한 ID만 diff가 있고, 나머지 ID는 이전 출력과 같아야 한다.

---

## 부록. 계산 함수 원본

아래 코드는 감사 시점의 원본이다. `@/` 타입 import는 타입 전용이며 런타임 가격 데이터가 아니다. 가격 숫자의 기본값은 `src/config/settings.ts`, `src/config/rates.ts` 에 있고, UV 숫자는 해당 파일 상수에 있다. 설정 파일의 로그인 PIN 줄은 부록에 포함하지 않았다.

부록 파일:

- `src/lib/calc/common.ts`
- `src/lib/calc/pop.ts`
- `src/lib/calc/stickerSheet.ts`
- `src/lib/calc/stickerSolvent.ts`
- `src/lib/calc/dtf.ts`
- `src/lib/calc/tshirt.ts`
- `src/lib/calc/businessCard.ts`
- `src/lib/calc/banner.ts`
- `src/lib/calc/uvAcrylicKeyring.ts`
- `src/config/rates.ts`
- `src/config/settings.ts` (PIN 필드 제외)

원문은 이 문서 생성 시 저장소 파일을 그대로 붙였다.

### `src/lib/calc/common.ts`

```ts
/**
 * 공통: 반올림(10원 단위), VAT·총액 계산
 */
export function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

export interface VatAndTotal {
  vat: number;
  total: number;
}

export function calcVatAndTotal(
  supplyPrice: number,
  vatRate: number
): VatAndTotal {
  const vat = roundToNearest10(supplyPrice * vatRate);
  const total = roundToNearest10(supplyPrice + vat);
  return { vat, total };
}
```

### `src/lib/calc/pop.ts`

```ts
/**
 * POP: 소비 길이 계산 및 4-cut/2-cut 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface PopInput {
  widthMm: number;
  heightMm: number;
  qty: number;
}

export interface PopResultItem {
  supplyPrice: number;
  vat: number;
  total: number;
}

export interface PopResult {
  error?: string;
  lengthMm: number;
  lengthM: number;
  supply4Cut: number;
  supply2Cut: number;
  vatAndTotal4: VatAndTotal;
  vatAndTotal2: VatAndTotal;
}

export function calcPop(
  input: PopInput,
  s: Pick<Settings, "popRollWidthMm" | "popSellPerM4" | "popSellPerM2" | "vatRate">
): PopResult {
  const { widthMm: w, heightMm: h, qty } = input;
  const rollWidth = s.popRollWidthMm;

  if (w > rollWidth && h > rollWidth) {
    return {
      error: "폭 초과(610mm) - 사이즈 확인",
      lengthMm: 0,
      lengthM: 0,
      supply4Cut: 0,
      supply2Cut: 0,
      vatAndTotal4: { vat: 0, total: 0 },
      vatAndTotal2: { vat: 0, total: 0 },
    };
  }

  let lengthMm: number;
  if (w <= rollWidth && h <= rollWidth) {
    lengthMm = Math.min(w, h);
  } else if (w <= rollWidth) {
    lengthMm = h;
  } else {
    lengthMm = w;
  }

  const lengthM = (lengthMm / 1000) * qty;
  const supply4Cut = roundToNearest10(lengthM * s.popSellPerM4);
  const supply2Cut = roundToNearest10(lengthM * s.popSellPerM2);

  return {
    lengthMm,
    lengthM,
    supply4Cut,
    supply2Cut,
    vatAndTotal4: calcVatAndTotal(supply4Cut, s.vatRate),
    vatAndTotal2: calcVatAndTotal(supply2Cut, s.vatRate),
  };
}
```

### `src/lib/calc/stickerSheet.ts`

```ts
/**
 * 스티커 시트형 (A4/A3): 장당 수량, 매수, 시간, 공급가 (최소 20,000원)
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { SheetSize, StickerRateItem } from "@/lib/config/types";

export interface StickerSheetInput {
  materialKey: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  gapMm: number;
}

export interface StickerSheetSheetResult {
  perSheet: number;
  sheets: number;
  minutes: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
  disabled?: boolean;
  disabledReason?: string;
}

export interface StickerSheetResult {
  a4: StickerSheetSheetResult;
  a3: StickerSheetSheetResult;
}

function usableSize(sheet: SheetSize, trimMargin: number): { w: number; h: number } {
  return {
    w: sheet.width - trimMargin * 2,
    h: sheet.height - trimMargin * 2,
  };
}

function perSheetCapacity(
  sheetW: number,
  sheetH: number,
  stickerW: number,
  stickerH: number,
  gap: number
): number {
  const perA = Math.floor(sheetW / (stickerW + gap)) * Math.floor(sheetH / (stickerH + gap));
  const perB = Math.floor(sheetW / (stickerH + gap)) * Math.floor(sheetH / (stickerW + gap));
  return Math.max(perA, perB, 1);
}

export function calcStickerSheet(
  input: StickerSheetInput,
  s: Pick<
    Settings,
    "trimMarginMm" | "workFeeStickerSheet" | "minStickerSupply" | "stickerCutSecondsPerSheet" | "vatRate"
  >,
  sheetSizes: { a4: SheetSize; a3: SheetSize },
  rate: StickerRateItem
): StickerSheetResult {
  const { widthMm: w, heightMm: h, qty, gapMm: gap } = input;
  const trim = s.trimMarginMm;
  const workFee = s.workFeeStickerSheet;
  const minSupply = s.minStickerSupply;
  const secPerSheet = s.stickerCutSecondsPerSheet;

  const a4Usable = usableSize(sheetSizes.a4, trim);
  const a3Usable = usableSize(sheetSizes.a3, trim);

  const calcOne = (
    sheetW: number,
    sheetH: number,
    sellPerSheet: number,
    available: boolean,
    disabledReason?: string
  ): StickerSheetSheetResult => {
    if (!available) {
      return {
        perSheet: 0,
        sheets: 0,
        minutes: 0,
        supplyPrice: 0,
        vatAndTotal: { vat: 0, total: 0 },
        disabled: true,
        disabledReason: disabledReason ?? "A3 불가",
      };
    }
    const perSheet = perSheetCapacity(sheetW, sheetH, w, h, gap);
    const sheets = Math.ceil(qty / perSheet);
    const minutes = Math.ceil((sheets * secPerSheet) / 60);
    const supplyPrice = roundToNearest10(
      Math.max(workFee + sheets * sellPerSheet, minSupply)
    );
    return {
      perSheet,
      sheets,
      minutes,
      supplyPrice,
      vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
    };
  };

  return {
    a4: calcOne(a4Usable.w, a4Usable.h, rate.a4, true),
    a3: calcOne(
      a3Usable.w,
      a3Usable.h,
      rate.a3,
      rate.a3Available,
      "A3 불가"
    ),
  };
}
```

### `src/lib/calc/stickerSolvent.ts`

```ts
/**
 * 스티커 솔벤트 롤: 네스팅 길이, 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface StickerSolventInput {
  widthMm: number;
  heightMm: number;
  qty: number;
  gapMm: number;
}

export interface StickerSolventResult {
  lengthM: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcStickerSolvent(
  input: StickerSolventInput,
  s: Pick<Settings, "solventRollWidthMm" | "workFeeSolvent" | "popSellPerM4" | "vatRate">
): StickerSolventResult {
  const { widthMm: w, heightMm: h, qty, gapMm: g } = input;
  const rollW = s.solventRollWidthMm;

  const acrossA = Math.floor(rollW / (w + g));
  const rowsA = Math.ceil(qty / Math.max(acrossA, 1));
  const lenA = rowsA * (h + g);

  const acrossB = Math.floor(rollW / (h + g));
  const rowsB = Math.ceil(qty / Math.max(acrossB, 1));
  const lenB = rowsB * (w + g);

  const lengthM = Math.min(lenA, lenB) / 1000;
  const supplyPrice = roundToNearest10(s.workFeeSolvent + lengthM * s.popSellPerM4);

  return {
    lengthM,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
```

### `src/lib/calc/dtf.ts`

```ts
/**
 * DTF: 가로·세로·수량 입력 → 7mm 간격, 85cm 폭 기준으로 사용 길이(m) 산출 후 견적
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface DtfInput {
  widthMm: number;
  heightMm: number;
  qty: number;
}

export interface DtfResult {
  /** 85cm 폭 안에 한 행에 들어가는 개수 */
  itemsPerRow: number;
  /** 필요한 행 수 */
  rows: number;
  /** 산출된 사용 길이 (m) */
  lengthM: number;
  /** true: 눕혀서(가로×세로 → 세로×가로) 배치가 더 유리해 선택됨 */
  rotated: boolean;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
  costReference: number;
  estimatedMinutes: number;
}

/** 롤 폭 방향 크기 w, 진행 방향 크기 h 일 때 레이아웃 결과. w가 롤 폭을 넘으면 사용 불가(Infinity 반환). */
function layout(
  rollWidthMm: number,
  gapMm: number,
  w: number,
  h: number,
  qty: number
): { itemsPerRow: number; rows: number; lengthM: number } {
  if (w > rollWidthMm) {
    return { itemsPerRow: 0, rows: 0, lengthM: Infinity };
  }
  const itemsPerRow = Math.max(1, Math.floor((rollWidthMm + gapMm) / (w + gapMm)));
  const rows = Math.ceil(qty / itemsPerRow);
  const totalLengthMm = rows * h + (rows - 1) * gapMm;
  return { itemsPerRow, rows, lengthM: totalLengthMm / 1000 };
}

export function calcDtf(
  input: DtfInput,
  s: Pick<
    Settings,
    "dtfSellPerM" | "dtfCostPerM" | "dtfMinutesPerM" | "dtfRollWidthMm" | "dtfGapMm" | "vatRate"
  >
): DtfResult {
  const { widthMm, heightMm, qty } = input;
  const rollWidthMm = s.dtfRollWidthMm ?? 850;
  const gapMm = s.dtfGapMm ?? 7;

  // 직배치(가로×세로) vs 눕힌 배치(세로×가로) 중 사용 길이가 짧은 쪽 선택
  const straight = layout(rollWidthMm, gapMm, widthMm, heightMm, qty);
  const rotated = layout(rollWidthMm, gapMm, heightMm, widthMm, qty);

  const useRotated = rotated.lengthM < straight.lengthM;
  const chosen = useRotated ? rotated : straight;

  const lengthM = chosen.lengthM;
  const supplyPrice = roundToNearest10(lengthM * s.dtfSellPerM);
  const costReference = roundToNearest10(lengthM * s.dtfCostPerM);
  const estimatedMinutes = Math.ceil(lengthM * s.dtfMinutesPerM);

  return {
    itemsPerRow: chosen.itemsPerRow,
    rows: chosen.rows,
    lengthM,
    rotated: useRotated,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
    costReference,
    estimatedMinutes,
  };
}
```

### `src/lib/calc/tshirt.ts`

```ts
/**
 * 티셔츠: 타입별 단가, 2XL+ 추가금, 수량 할인
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { TshirtTypeItem, TshirtDiscountTier } from "@/lib/config/types";

export interface TshirtInput {
  typeId: string;
  qty: number;
  numberOf2XLPlus: number;
}

export interface TshirtResult {
  unitPrice: number;
  discountRate: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

function getDiscountRate(qty: number, tiers: TshirtDiscountTier[]): number {
  for (const t of tiers) {
    if (qty >= t.minQty) return t.rate;
  }
  return 0;
}

export function calcTshirt(
  input: TshirtInput,
  s: Pick<Settings, "vatRate">,
  typeItem: TshirtTypeItem | undefined,
  sizeUpPer2XL: number,
  discountTiers: TshirtDiscountTier[]
): TshirtResult {
  const unitPrice = typeItem?.unitPrice ?? 0;
  const base = unitPrice * input.qty;
  const sizeUp = input.numberOf2XLPlus * sizeUpPer2XL;
  const subtotal = base + sizeUp;
  const discountRate = getDiscountRate(input.qty, discountTiers);
  const supplyPrice = roundToNearest10(subtotal * (1 - discountRate));

  return {
    unitPrice,
    discountRate,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
```

### `src/lib/calc/businessCard.ts`

```ts
/**
 * 명함: 용지 옵션 + 디자인 등급에 따른 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { BusinessCardOption, BusinessCardDesignTier } from "@/lib/config/types";

export interface BusinessCardInput {
  paperOptionId: string;
  designTierId: string;
  /** 선택한 용지의 pcs (100, 200, 500 등) */
  pcs?: number;
}

export interface BusinessCardResult {
  printPrice: number;
  designFee: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcBusinessCard(
  input: BusinessCardInput,
  s: Pick<Settings, "vatRate">,
  options: BusinessCardOption[],
  designTiers: BusinessCardDesignTier[]
): BusinessCardResult {
  const opt = options.find((o) => o.id === input.paperOptionId);
  const tier = designTiers.find((t) => t.id === input.designTierId);
  const printPrice = opt && input.pcs ? (opt.prices[input.pcs] ?? 0) : 0;
  const designFee = tier?.fee ?? 0;
  const supplyPrice = roundToNearest10(printPrice + designFee);

  return {
    printPrice,
    designFee,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
```

### `src/lib/calc/banner.ts`

```ts
/**
 * 배너: 출력물 수량 × 기본가 + 실내 거치대 수량 × 단가 + 실외 거치대 수량 × 단가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface BannerInput {
  /** 출력물 수량 (1장당 bannerBasePrice) */
  outputQty: number;
  /** 실내 거치대 수량 */
  indoorStandQty: number;
  /** 실외 거치대 수량 */
  outdoorStandQty: number;
}

export interface BannerResult {
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcBanner(
  input: BannerInput,
  s: Pick<Settings, "bannerBasePrice" | "bannerStandIndoor" | "bannerStandOutdoor" | "vatRate">
): BannerResult {
  const { outputQty, indoorStandQty, outdoorStandQty } = input;
  const supplyPrice = roundToNearest10(
    outputQty * s.bannerBasePrice +
      indoorStandQty * s.bannerStandIndoor +
      outdoorStandQty * s.bannerStandOutdoor
  );

  return {
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
```

### `src/lib/calc/uvAcrylicKeyring.ts`

```ts
/**
 * UV 아크릴 키링 견적 계산 모듈
 * - 추후 다른 상품군 확장을 위해 규칙/구간을 상수화
 */
export interface UvAcrylicKeyringInput {
  width: number;
  height: number;
  qty: number;
}

export interface UvAcrylicKeyringQuote {
  width: number;
  height: number;
  qty: number;
  area: number;
  quantityBracket: string;
  unitSupplyPrice: number;
  supplyTotal: number;
  vat: number;
  baseTotal: number;
  adjustmentRate: number;
  adjustmentLabel: string;
  finalPrice: number;
}

const VAT_RATE = 0.1;
const SINGLE_QTY_AREA_THRESHOLD = 8.4;
const SINGLE_QTY_SMALL_AREA_PRICE = 5800;
const SINGLE_QTY_LARGE_AREA_PRICE = 6000;

interface UnitPriceTier {
  minQty: number;
  maxQty: number;
  base: number;
  areaMultiplier: number;
  bracketLabel: string;
}

const UNIT_PRICE_TIERS: UnitPriceTier[] = [
  { minQty: 2, maxQty: 10, base: 1700, areaMultiplier: 13.7, bracketLabel: "2~10개" },
  { minQty: 11, maxQty: 50, base: 1195, areaMultiplier: 14.8, bracketLabel: "11~50개" },
  { minQty: 51, maxQty: 100, base: 1145, areaMultiplier: 14.1, bracketLabel: "51~100개" },
  { minQty: 101, maxQty: 200, base: 1069, areaMultiplier: 14.0, bracketLabel: "101~200개" },
  { minQty: 201, maxQty: 300, base: 1053, areaMultiplier: 13.6, bracketLabel: "201~300개" },
  { minQty: 301, maxQty: 400, base: 1040, areaMultiplier: 13.5, bracketLabel: "301~400개" },
  { minQty: 401, maxQty: 500, base: 1030, areaMultiplier: 13.56, bracketLabel: "401~500개" },
  { minQty: 501, maxQty: Number.POSITIVE_INFINITY, base: 1013, areaMultiplier: 13.61, bracketLabel: "501개 이상" },
];

interface AdjustmentPolicy {
  minQty: number;
  maxQty: number;
  rate: number;
  label: string;
}

const ADJUSTMENT_POLICIES: AdjustmentPolicy[] = [
  { minQty: 1, maxQty: 10, rate: 1.1, label: "+10%" },
  { minQty: 11, maxQty: 49, rate: 1.07, label: "+7%" },
  { minQty: 50, maxQty: 200, rate: 1.05, label: "+5%" },
  { minQty: 201, maxQty: 299, rate: 1.02, label: "+2%" },
  { minQty: 300, maxQty: Number.POSITIVE_INFINITY, rate: 0.99, label: "-1%" },
];

export function getArea(width: number, height: number): number {
  return (width * height) / 100;
}

export function getUnitSupplyPrice(area: number, qty: number): number {
  if (qty === 1) {
    return area <= SINGLE_QTY_AREA_THRESHOLD
      ? SINGLE_QTY_SMALL_AREA_PRICE
      : SINGLE_QTY_LARGE_AREA_PRICE;
  }

  const tier = UNIT_PRICE_TIERS.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!tier) {
    throw new Error("수량 구간을 찾을 수 없습니다.");
  }

  return Math.round(tier.base + area * tier.areaMultiplier);
}

function getQuantityBracketLabel(qty: number): string {
  if (qty === 1) {
    return "1개";
  }
  const tier = UNIT_PRICE_TIERS.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!tier) return "구간 없음";
  return tier.bracketLabel;
}

export function getVat(supplyTotal: number): number {
  return Math.round(supplyTotal * VAT_RATE);
}

export function getBaseTotal(supplyTotal: number, vat: number): number {
  return supplyTotal + vat;
}

export function getAdjustmentRate(qty: number): number {
  const policy = ADJUSTMENT_POLICIES.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!policy) {
    throw new Error("가격 정책 구간을 찾을 수 없습니다.");
  }
  return policy.rate;
}

function getAdjustmentLabel(qty: number): string {
  const policy = ADJUSTMENT_POLICIES.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!policy) return "미적용";
  return policy.label;
}

export function getAdjustedFinalPrice(baseTotal: number, qty: number): number {
  return Math.round(baseTotal * getAdjustmentRate(qty));
}

export function calculateQuote(input: UvAcrylicKeyringInput): UvAcrylicKeyringQuote {
  const area = getArea(input.width, input.height);
  const unitSupplyPrice = getUnitSupplyPrice(area, input.qty);
  const supplyTotal = unitSupplyPrice * input.qty;
  const vat = getVat(supplyTotal);
  const baseTotal = getBaseTotal(supplyTotal, vat);
  const adjustmentRate = getAdjustmentRate(input.qty);
  const finalPrice = getAdjustedFinalPrice(baseTotal, input.qty);

  return {
    width: input.width,
    height: input.height,
    qty: input.qty,
    area,
    quantityBracket: getQuantityBracketLabel(input.qty),
    unitSupplyPrice,
    supplyTotal,
    vat,
    baseTotal,
    adjustmentRate,
    adjustmentLabel: getAdjustmentLabel(input.qty),
    finalPrice,
  };
}

/**
 * 검증용 레퍼런스 데이터
 * 요구된 5개 케이스를 상수로 남겨 수동 검증 시 즉시 비교 가능
 */
export const UV_ACRYLIC_KEYRING_TEST_CASES = [
  { width: 45, height: 30, qty: 1, expectedFinalPrice: 7260 },
  { width: 45, height: 30, qty: 100, expectedFinalPrice: 154193 },
  { width: 47, height: 47, qty: 200, expectedFinalPrice: 318318 },
  { width: 50, height: 50, qty: 500, expectedFinalPrice: 745421 },
  { width: 47, height: 47, qty: 1000, expectedFinalPrice: 1430946 },
] as const;
```

### `src/config/rates.ts`

```ts
/**
 * V1: 스티커 시트·티셔츠·명함·배너 등 단가/옵션 (config provider 통해 사용)
 */
export const stickerRates = {
  Art: { a4: 500, a3: 980, a3Available: true },
  Modjo: { a4: 500, a3: 980, a3Available: true },
  Yupo: { a4: 950, a3: 2100, a3Available: true },
  TransparentDeadlong: { a4: 950, a3: 0, a3Available: false },
} as const;

export const stickerSheetSizes = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
} as const;

export const tshirtTypes = [
  { id: "short", label: "반팔", unitPrice: 18000 },
  { id: "long", label: "긴팔", unitPrice: 20000 },
  { id: "hoodie", label: "후드", unitPrice: 25000 },
  { id: "windbreaker", label: "윈드브레이커", unitPrice: 35000 },
] as const;

export const tshirtSizeUpPer2XL = 3000;

export const tshirtDiscountTiers = [
  { minQty: 100, rate: 0.25 },
  { minQty: 50, rate: 0.2 },
  { minQty: 10, rate: 0.1 },
] as const;

export const businessCardOptions = [
  { id: "imported-same-day", label: "수입 당일제", prices: { 100: 20000, 200: 25000 } },
  { id: "art-paper", label: "아트지", prices: { 500: 15000 }, note: "500매(2~3일)" },
] as const;

export const businessCardDesignTiers = [
  { id: "output-only", label: "출력만", fee: 0 },
  { id: "basic", label: "베이직", fee: 8000 },
  { id: "standard", label: "스탠다드", fee: 20000 },
  { id: "premium", label: "프리미엄", fee: 30000 },
] as const;
```

### `src/config/settings.ts`

로그인 PIN 필드는 제외했다.

```ts
/**
 * V1: 모든 가격·기본값·상수 (UI에서 직접 사용하지 말고 config provider 통해 사용)
 */
export const settings = {
  vatRate: 0.1,
  defaultGapMm: 5,
  trimMarginMm: 5,
  minStickerSupply: 20000,
  workFeeStickerSheet: 15000,
  workFeeSolvent: 15000,
  popSellPerM4: 63452,
  popSellPerM2: 55046,
  popRollWidthMm: 610,
  solventRollWidthMm: 620,
  dtfSellPerM: 13900,
  dtfCostPerM: 1350,
  dtfMinutesPerM: 5,
  dtfRollWidthMm: 850,
  dtfGapMm: 7,
  stickerCutSecondsPerSheet: 30,
  bannerBasePrice: 22000,
  bannerStandIndoor: 15000,
  bannerStandOutdoor: 28000,
} as const;
```

