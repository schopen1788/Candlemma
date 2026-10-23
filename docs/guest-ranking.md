# 비회원 랭킹 구현·운영 가이드

## 기존 프로젝트 분석

- npm workspace: `apps/web`은 React 19 + TypeScript + Vite + Lightweight Charts 5, `apps/api`는 Hono.
- `apps/web/functions/api/[[path]].ts`가 `/api/*`를 Hono에 연결한다. Pages Functions를 그대로 사용할 수 있어 별도 서버가 필요 없다.
- 기존 게임은 **무제한 연습 모드**다. 필터 → 과거 120봉/마지막 40봉 리플레이 → 근거 태그 1~3개 + 상승·보합·하락 → 미래 차트·해설 → 다음 문제 흐름이다.
- `grade.ts`의 기존 채점(방향 정답 100점 + 핵심 근거 하나 이상 일치 20점)을 공유한다. 방향이 틀려도 근거가 맞으면 20점이다.
- D1에 공개 문제(`puzzles_public`)와 비공개 정답(`puzzles_answer`)이 이미 분리돼 있다. 기존 문제 열람 토큰도 서버에서 발급하고 한 번만 사용한다. 정답/미래 캔들을 프론트 번들에 넣지 않는다.
- 기존 localStorage의 기기 ID는 연습 통계용이다. 복기 노트·최근 문제·필터·테마 역시 브라우저에 보관한다. 랭킹 소유권에는 이 ID를 사용하지 않는다.
- Pages 프로젝트와 D1 이름은 `candlemma`, 바인딩은 `DB`. 기존 `apps/web/wrangler.toml`의 DB ID와 배포 설정을 유지했다.
- 기존 명령: `npm test`, `npm run build`, `npm run dev`, `npm run deploy`. Python 테스트는 `cd pipeline; uv run pytest -q tests`.

## 추가된 게임 흐름과 규칙

홈의 **10문제 도전** → 기존 차트/태그/결과 화면 → 10번째 결과의 **최종 결과 보기** → 점수·정답 수·정답률 → 선택적으로 닉네임 등록 → 전체 랭킹.

기존 연습·필터·해설·복기·테마는 유지한다. 등록 건너뛰기는 공개 데이터를 생성하지 않는다. 최종 결과는 같은 브라우저에서 다시 열 수 있다. 새 도전을 시작하면 브라우저의 최근 게임 포인터는 새 게임으로 바뀐다.

## 추가·수정 파일 전체 목록

| 파일 | 변경 |
|---|---|
| `apps/api/migrations/0002_guest_ranking.sql` | 추가: 방문자·시즌·게임·답안·대표 기록·요청 제한과 제약조건 |
| `apps/api/src/ranking.ts` | 추가: 쿠키 식별, 서버 게임/랭킹 API, 검증·제한 |
| `apps/api/src/puzzle-result.ts` | 추가: 연습/도전 공용 결과·선택 통계 |
| `apps/api/src/ranking.test.ts` | 추가: 실제 로컬 D1 통합 테스트 |
| `apps/api/src/app.ts` | 수정: API 라우트 연결, 본문/출처/캐시 제어, 결과 로직 공유 |
| `apps/api/package.json` | 수정: 타입 검사, 테스트 의존성·보안 업데이트 |
| `apps/api/tsconfig.json` | 수정: Node 테스트 타입 |
| `apps/web/src/App.tsx` | 수정: 도전/랭킹 경로·네비게이션 |
| `apps/web/src/pages/Home.tsx` | 수정: 10문제 도전 진입점 |
| `apps/web/src/pages/Practice.tsx` | 수정: 같은 게임 UI에 도전·복구·타이머 연결 |
| `apps/web/src/pages/Ranking.tsx` | 추가: 상위 100명·내 순위·상태 처리 |
| `apps/web/src/pages/Notes.tsx` | 수정: 시간 초과 시 선택 표시 |
| `apps/web/src/components/GameSummary.tsx` | 추가: 최종 결과·닉네임 등록·건너뛰기 |
| `apps/web/src/components/ResultPanel.tsx` | 수정: 시간 초과·최종 결과 버튼 |
| `apps/web/src/lib/api.ts` | 수정: API 타입·요청·HTTP 오류 |
| `apps/web/src/lib/storage.ts` | 수정: 최근 도전 복구 포인터·시간 초과 노트 |
| `apps/web/src/styles.css` | 수정: 기존 디자인 변수 기반 반응형 랭킹 |
| `apps/web/public/_routes.json` | 추가: Functions는 API 경로만 호출 |
| `pipeline/11_upload.py` | 수정: 참조 중인 기존 문제를 삭제하지 않는 적재 |
| `pipeline/tests/test_upload.py` | 추가: 재적재 후 원본/기록/FK 보존 회귀 테스트 |
| `scripts/cleanup-ranking.sql` | 추가: 선택적 보관 기한 정리 |
| `docs/guest-ranking.md` | 추가: 본 가이드 |
| `README.md` | 수정: 구현 범위·명령·운영 가이드 링크 |
| `package.json` | 수정: 프로덕션 빌드에 API 타입 검사 포함 |
| `package-lock.json` | 수정: 개발 의존성 잠금 |
| `.gitignore` | 수정: 운영 백업과 로컬 검증 아티팩트 제외 |

| 항목 | 전체 랭킹 v1 |
|---|---|
| 시즌 / 규칙 버전 | `all-v1` / `direction100-tag20-v1` |
| 문제 수 | 중복 없는 10개, 서버에서 무작위 선택 |
| 출제 조건 | 활성 문제 중 T+3, 정답 데이터가 존재하는 문제 |
| 제한 시간 | 문제당 120초. 서버 발급부터 리플레이·네트워크 시간을 포함한다. |
| 시간 초과 | 해당 문제 0점. 서버에서 강제한다. 이후 문제는 계속 풀 수 있다. |
| 전체 세션 유효기간 | 시작 후 24시간. 결과·해설을 보는 동안 다음 문제 시간은 시작하지 않는다. |
| 점수 / 만점 | 정답 100 + 근거 일치 20 / 총 1,200점 |
| 대표 기록 | 방문자·시즌당 공개 등록한 최고 기록 1개 |
| 순위 | 점수 내림차순 → 정답 수 내림차순 → 대표 기록 등록 시각 오름차순 → 서버 방문자 ID 오름차순 |
| 같은 방문자의 동점 | 점수와 정답 수가 모두 같으면 먼저 등록한 기록 유지(닉네임도 유지) |

기록을 갱신한 시점이 새 대표 기록의 등록 시각이다. 시작 시각이나 플레이 속도로 순위를 가르지 않는다. 문제 난이도를 완전히 동일하게 맞추는 방식은 아니며 같은 출제 풀·채점·문제 수·시간 규칙으로 비교한다.

`ranking_seasons`와 모든 게임/대표 기록의 `season_id`로 일간·주간 확장 기반을 마련했다. 현재 API는 전체 시즌 하나만 제공한다. 향후 채점/시간/출제 조건을 변경할 때는 기존 시즌 ID를 재사용하지 말고 새 시즌·규칙 버전을 추가하고 서버 상수와 UI를 함께 변경한다.

## 익명 식별과 보안

- 서버가 256비트 난수 쿠키를 발급한다. 운영 쿠키는 `__Host-candlemma`, `Secure; HttpOnly; SameSite=Lax; Path=/`, 유효기간 365일이다. Domain을 지정하지 않는다.
- DB에는 쿠키 원문 대신 SHA-256 해시만 저장한다. 이메일·비밀번호·로그인·외부 인증은 없다. 닉네임은 식별자가 아니므로 중복 이름을 허용한다.
- HTTP localhost에서만 `candlemma_dev`라는 개발용 HttpOnly 쿠키를 사용한다. 운영 쿠키의 Secure 속성을 완화하지 않는다. 쿠키를 차단하면 도전 제출을 이어갈 수 없다.
- localStorage의 `cm.rankedGame`은 새로고침 복구 편의용 게임 ID다. 이 값을 조작해도 서버 쿠키가 소유한 게임만 읽고 제출할 수 있다.
- 랭킹 문제 ID는 매 게임 무작위 ID로 치환한다. 실제 문제 ID, 정답, 미래 캔들, 미출제 문제 목록은 제출 전에 반환하지 않는다. 연습용 열람 토큰으로 사용할 수도 없다.
- 정답/핵심 근거를 세션 생성 때 서버에 스냅샷으로 보관하고 서버에서 채점한다. 점수·정답 수·닉네임 외 필드 주입 등 허용되지 않은 입력을 거부한다.
- 도전의 선택 비율 통계 역시 공개 등록한 게임만 집계한다. 미등록 도전 결과를 공개 통계로 노출하지 않는다.
- 현재 문제와 순서를 검사하고, 답안의 PK 및 조건부 INSERT로 중복·동시 제출을 차단한다. 답안 INSERT 트리거가 세션 집계를 같은 트랜잭션에서 갱신한다.
- 완료한 10문제 세션만 등록 가능하다. 대표 기록 UPSERT와 세션 등록 표시를 D1 `batch` 트랜잭션으로 처리한다. 낮은 기록도 해당 세션의 등록 완료는 표시하므로 반복 등록할 수 없다.
- 닉네임은 NFC 정규화·앞뒤 공백 제거 후 Unicode 문자/숫자·일반 공백·밑줄 2~16자만 허용한다. React 텍스트 출력과 SQL 바인딩을 사용한다.
- API는 4 KiB 본문 제한, JSON 형식 검증, Origin/Fetch Metadata 확인, `no-store`, `nosniff`를 적용한다. 오류 시 DB 내용이나 쿠키 원문을 응답하지 않는다.
- IP는 신원으로 사용하지 않는다. Cloudflare가 제공한 접속 IP를 시간 버킷/서버 시크릿과 해시해 분당 180요청을 제한한다. 원문 IP를 DB에 저장하지 않는다. 같은 IP를 쓰는 학교·회사에서는 제한을 공유할 수 있다. 새 도전은 방문자당 시간 버킷별 최대 10번이다. 진행 중 게임 재개는 이 횟수를 소모하지 않는다.
- 제한은 D1 조건부 UPSERT라 여러 Functions 인스턴스에서도 일관된다. 정해진 시간 버킷 방식이므로 경계 순간에는 두 버킷의 허용량을 연속 사용할 수 있다. 만료 버킷은 일부 요청에서 최대 100개씩 정리한다.

### 남은 한계

로그인 없는 구조에서는 쿠키 삭제·다중 브라우저·기기·프록시를 통한 반복 참여를 완전히 막을 수 없다. 자동화된 정상 형식의 답안, 과거 차트 암기·이미지 매칭, 연습에서 수집한 차트와 도전 차트를 대조하는 방식도 완벽히 차단하지 못한다. 동일 문제의 직접 정답 조회는 차단했지만 유한한 공개 과거 데이터 자체는 비밀이 아니다.

쿠키가 삭제되면 기존 공개 닉네임/기록을 찾아 소유권을 복구하는 기능은 없다. `TOKEN_SECRET` 변경은 기존 연습 토큰에 영향을 주지만 난수 쿠키 기반의 랭킹 신원에는 영향을 주지 않는다. 욕설 필터·신고/운영자 삭제 UI·CAPTCHA·실시간 난이도 보정은 이번 범위에 포함하지 않았다.

## 데이터베이스

추가 마이그레이션: `apps/api/migrations/0002_guest_ranking.sql`. 기존 테이블을 삭제하거나 변경하지 않는다.

| 테이블 | 용도 |
|---|---|
| `anonymous_visitors` | 쿠키 해시 기반 익명 방문자 |
| `ranking_seasons` | 시즌 및 규칙 버전 |
| `game_sessions` | 소유자, 상태, 서버 집계, 생성·완료·등록 시각 |
| `game_questions` | 10문제 순서, 비공개 원본 ID, 정답/근거 스냅샷, 발급 시각 |
| `game_answers` | 선택·태그·시간 초과·서버 점수, 문제당 한 번 |
| `ranking_entries` | 시즌/방문자당 대표 기록 하나, 공개 닉네임 |
| `request_limits` | 시간 버킷별 요청 제한 |

인덱스: 진행 중 게임 부분 UNIQUE, 게임/순서 UNIQUE, 게임/원본 문제 UNIQUE, 답안 PK, 대표 기록 시즌/방문자 PK 및 게임 UNIQUE, 순위 정렬 인덱스, 문제별 선택 집계, 요청 제한 만료 인덱스. 게임 삭제 시 질문·답안만 CASCADE하며 공개 최고 기록의 원본 게임은 보존한다.

`pipeline/11_upload.py`는 기존 문제를 삭제하는 대신 비활성화하고 다시 출제할 문제만 활성화한다. 기존 ID의 공개·정답 페이로드는 보존하므로 과거 세션과 FK가 깨지지 않는다. 같은 장면의 데이터/설명을 의도적으로 바꿀 때는 새 데이터 버전과 새 salt로 **새 문제 ID**를 생성하고 이전 세션이 가리키는 문제를 보존한다. salt 원문은 공개 저장소/프론트에 포함하지 않는다.

## API

모든 POST는 `Content-Type: application/json`, 같은 출처의 쿠키를 사용한다. 클라이언트는 점수나 user ID를 보내지 않는다.

| 메서드 / 경로 | 요청 / 응답 |
|---|---|
| `POST /api/game/start` | `{}` → 새 게임 또는 진행 중 게임 재개, 현재 공개 문제·서버 시간·집계 |
| `GET /api/game/:id` | 소유한 게임 복원. 마지막 제출 결과도 복원 가능 |
| `POST /api/game/next` | `{game_id}` → 다음 문제 발급. 반복 요청해도 문제/기한을 바꾸지 않음 |
| `POST /api/game/answer` | `{game_id, question_id, pick, tags}` → 서버 채점 결과·집계. 만료 후 자동 제출은 `pick:null,tags:[]` 가능 |
| `POST /api/ranking/submit` | `{game_id,nickname}` → `updated`, 현재 대표 기록 `me` |
| `GET /api/ranking` | 상위 100명·전체 참여자 수·내 대표 순위. 공개 응답에서 내부 방문자/게임 ID 제거 |
| `GET /api/ranking/me` | 쿠키가 연결된 내 대표 기록/순위 또는 null |

주요 오류: 400 입력 오류, 403 소유권/출처, 404 존재하지 않는 내 게임, 409 중복/미완료/순서, 410 세션 만료, 413 본문 초과, 415 JSON 아님, 429 요청 제한(`Retry-After` 포함), 503 출제 문제 부족. 네트워크 오류 뒤에는 게임 조회로 저장 여부를 확인해 재개한다.

## 로컬 실행

Node 24 권장(테스트 런타임 최소 Node 22). 런타임 의존성은 추가하지 않았으며 테스트용 Miniflare와 Node 타입만 추가하고 기존 Vitest를 보안 수정 버전으로 갱신했다.

```powershell
# 저장소 루트
npm ci
npm test
npm run build

cd apps/web
npx wrangler d1 migrations apply candlemma --local
# 로컬 DB에 문제가 없을 때만 기존 파이프라인으로 적재: 아래 파이프라인 절 참조
npx wrangler pages dev dist --port 8788
```

`apps/web/.dev.vars`에 개발용 `TOKEN_SECRET`을 설정한다(기존 파일이 있으면 유지). 운영 시크릿이나 .dev.vars를 커밋하지 않는다. 로컬 SQLite 파일을 직접 수정하지 말고 Wrangler를 사용한다.

문제 데이터가 없는 새 환경에서는 기존 파이프라인을 실행해 `pipeline/data/export/puzzles.jsonl`을 만든 다음 `cd pipeline; uv run python 11_upload.py --local`로 적재한다. T+3 활성 문제가 10개 미만이면 서버가 503으로 시작을 거부한다. 원천/정답 데이터는 Pages 정적 디렉터리에 복사하지 않는다.

## Cloudflare D1 연결과 배포

배포 직전에 실제 계정의 권한·플랜·Pages 바인딩을 확인한다. 다음은 기존 서비스 업데이트와 신규 설치에 사용하는 절차다.

1. `npx wrangler login`으로 해당 Pages/D1을 관리하는 계정에 로그인한다. 기존 `apps/web/wrangler.toml`의 `database_id`가 그 계정의 `candlemma` DB인지 확인한다. 기존 DB를 사용하면 새 DB를 생성할 필요가 없다.
2. 다른 계정에 새로 설치하는 경우만 `cd apps/web; npx wrangler d1 create candlemma` 후 반환된 ID로 `wrangler.toml`의 `database_id`를 교체한다. `binding="DB"`, `migrations_dir="../api/migrations"`는 유지한다.
3. 운영 DB를 백업한다. `cd apps/web`에서 `npx wrangler d1 export candlemma --remote --output ../../candlemma-backup.sql`. 백업에는 정답·방문자·닉네임이 있으므로 `.gitignore`로 제외하고 안전하게 보관한다.
4. 같은 디렉터리에서 `npx wrangler d1 migrations list candlemma --remote`로 상태를 확인하고 `npx wrangler d1 migrations apply candlemma --remote`를 실행한다. 기존 서비스는 0002만 추가 적용된다. 신규 DB는 0001과 0002를 모두 적용한다.
5. 신규 DB라면 기존 파이프라인으로 문제 데이터를 적재한다(`uv run python 11_upload.py --remote`). 기존 데이터가 있으면 재수집·재적재할 필요가 없다. 최소 T+3 문제 수 확인: `npx wrangler d1 execute candlemma --remote --command "SELECT COUNT(*) AS n FROM puzzles_public WHERE active=1 AND horizon=3"`.
6. 기존 연습 토큰용 `TOKEN_SECRET`이 설정돼 있는지 확인한다. 없다면 `npx wrangler pages secret put TOKEN_SECRET --project-name candlemma`로 충분히 긴 무작위 시크릿을 입력한다. 명령/문서/소스에 시크릿 원문을 넣지 않는다.
7. Pages 프로젝트 설정의 D1 바인딩 이름이 `DB`인지, Production이 올바른 DB를 사용하는지 확인한다. Preview는 **별도 테스트 D1**을 연결하고 별도 마이그레이션·테스트 데이터를 적용한다. 운영 기록을 Preview 테스트에 사용하지 않는다.
8. 루트로 돌아와 `npm test`, `npm run build` 후 `npm run deploy`. 이 명령은 `apps/web`에서 `wrangler pages deploy dist --project-name candlemma --branch main`을 실행하며 기존 `functions/`도 컴파일해 업로드한다.
9. Git 연동 배포를 사용한다면 npm workspace 전체가 설치되도록 저장소 루트를 기준으로 빌드한다. 빌드 명령은 `npm run build`, 출력은 `apps/web/dist`. Functions 디렉터리 인식은 선택한 Pages 프로젝트 루트 설정에 맞춰 확인한다. 설정이 불분명하면 기존에 사용하던 위 Wrangler 배포 명령을 사용한다.
10. HTTPS에서 새 브라우저로 도전 완료·등록·다른 브라우저 공개 랭킹·같은 브라우저 최고 기록 갱신을 확인한다. Network에서 HttpOnly/Secure 쿠키와 점수 입력 부재도 확인한다. Free 플랜은 Functions 초과 시 정적 요청으로 우회하는 fail-open 대신 fail-closed 운영을 권장한다.

배포 순서는 **백업 → 마이그레이션 → 빌드·Functions 배포**다. 새 테이블이 없으면 기존 연습의 선택 집계/요청 제한도 실패할 수 있으므로 반드시 마이그레이션을 먼저 적용한다. 앱을 롤백할 때 0002 테이블은 남겨 두어도 기존 버전에 지장을 주지 않는다. 데이터 손실을 일으키는 자동 다운 마이그레이션은 제공하지 않는다.

## 무료 플랜과 운영 비용 (2026-10-23 확인)

공식 자료: [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [D1 한도](https://developers.cloudflare.com/d1/platform/limits/), [Pages Functions 요금](https://developers.cloudflare.com/pages/functions/pricing/), [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/).

- Pages의 Functions를 거치지 않는 정적 요청은 무료·무제한이다. `_routes.json`으로 `/api/*`만 Functions를 호출한다.
- Free Functions/Workers 요청은 계정 합계 하루 100,000회. D1은 하루 읽기 5,000,000행, 쓰기 100,000행, 계정 저장소 5GB, **DB 하나당 500MB** 한도다. 한도는 한국 시간 오전 9시(UTC 자정)에 초기화된다.
- 한 게임은 시작 1 + 답안 10 + 다음 문제 9 + 등록/랭킹 조회 약 2~3 = 약 22~23 API 요청이다. 새로고침·추가 조회·연습 요청은 별도다.
- 인덱스·요청 제한 버킷·트리거를 포함해 완료한 게임당 약 100~180행 쓰기를 보수적으로 예상한다(트래픽 실측치가 아닌 구조 기반 추정). 100게임/일은 약 2,300요청·10,000~18,000행 쓰기, 500게임/일은 약 11,500요청·50,000~90,000행 쓰기다. 연습·다른 앱·대량 조회를 더하면 먼저 한도에 도달할 수 있다.
- 문제 선택의 `ORDER BY RANDOM()`은 활성 T+3 문제 풀을 읽는다. 랭킹 총인원/내 순위 COUNT는 참가자 수에 비례한다. 방문자가 많아지면 읽기 지표를 먼저 확인하고 공개 상위 목록/참가자 수 단기 캐시와 순위 계산 개선을 검토한다. 개인 순위 응답을 공용 캐시에 저장하지 않는다.
- 원본 문제 페이로드를 게임마다 복사하지 않아 저장량을 줄였다. 게임·10문제·답안·인덱스는 대략 수~수십 KB/게임 수준이지만 실제 DB 크기와 D1 `rows_read`/`rows_written` 지표를 기준으로 운영한다. 현재 데이터셋·누적 기록에 따라 500MB가 먼저 찰 수 있다.
- Free 한도 초과 시 자동 과금으로 넘어가는 대신 API가 실패할 수 있다. 유료 플랜을 직접 활성화하면 기본 Workers 요금과 포함량 초과 사용료가 발생할 수 있다. 별도 유료 서비스·외부 AI API·상시 서버는 사용하지 않는다.

유지관리 선택 사항: `scripts/cleanup-ranking.sql`은 30일이 지난 대표 기록 외 게임을 최대 100개씩 지우고 만료 요청 제한 버킷을 정리한다. `--local`로 먼저 검증한 후 필요한 경우 백업을 만들고 `cd apps/web; npx wrangler d1 execute candlemma --remote --file ../../scripts/cleanup-ranking.sql`로 운영자가 실행한다. 자동 삭제 스케줄은 설정하지 않았다. 공개 최고 기록과 연결된 원본 게임은 보존한다.

## 검증 기록

- 로컬 D1(Miniflare/workerd) API 통합 테스트 10개 + 기존 채점/토큰 테스트 5개: 통과.
- 빈 DB에 0001·0002 적용, 10문제 서버 채점/정답률, 미등록 비공개, 다른 쿠키 공개 조회/소유권 거부, 최고점 갱신/동점/낮은 점수 유지, 중복 닉네임 확인.
- 임의 점수 필드, 중복·동시 답안/동시 등록, 미래 문제, 연습 API를 통한 직접 조회, 시간 초과/기한 초기화, 만료 세션, 요청 제한, 닉네임·Origin·본문 크기 검증.
- 106명 데이터에서 상위 100명 제한, 일관된 동점 순서, 100위 밖 내 순위 검증.
- API TypeScript 검사, Vite 프로덕션 빌드, Pages Functions 컴파일: 통과.
- 기존 Python 파이프라인 테스트 29개 + 문제 재업로드 보존 회귀 테스트 1개: 총 30개 통과.
- 실제 로컬 문제 1,250개가 있는 D1에서 브라우저로 390px 모바일 10문제 완료 → 점수/정답률 → 닉네임 등록 → 내 순위 저장 확인. 모바일 가로 넘침 없음, 라이트/다크 랭킹, 최종 결과 복구, 쿠키가 분리된 localhost/127.0.0.1 세션의 공개 랭킹 조회를 확인했다(실제 다른 기기·브라우저를 사용하는 테스트와는 구분).
- 기존 연습의 차트 리플레이·제출·해설/공시·복기 노트 저장/조회도 브라우저에서 확인했고 콘솔 오류는 없었다. 의존성 보안 검사에서 갱신 후 취약점 0개를 확인했다.
- 위 검증 기록은 로컬 환경 기준이다. 프로덕션 배포 후 API·랭킹 조회를 별도로 확인하며, 실제 다른 기기 접속·실트래픽 부하 테스트는 별도 운영 검증이 필요하다.

## 다음 개선 후보

일간/주간 시즌 선택, 패턴·난이도별 균형 출제, 신고·운영자 관리, 선택적 Turnstile, 공개 랭킹 단기 캐시, 페이지네이션, 수명 주기 정리 자동화, 쿠키를 유지한 닉네임 변경/기록 삭제, 접근성 키보드/스크린리더 추가 검증을 고려할 수 있다.
