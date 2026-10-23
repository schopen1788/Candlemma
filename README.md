# 차트 맞히기 (Candlemma)

실제 국내 상장 종목의 과거 일봉을 하루씩 재생하다 멈추고, 그 시점까지의 차트·거래대금만 보고 이후 흐름(상승/보합/하락)을 판단하는 차트 판독 훈련 게임. 기획은 [PLAN.md](PLAN.md).

현재 구현 범위: **데이터 파이프라인 + 연습 모드 + 로그인 없는 10문제 도전/전체 랭킹**.

비회원 랭킹의 규칙·API·D1 스키마·보안 한계·무료 한도·배포 절차는 [운영 가이드](docs/guest-ranking.md)를 참고하세요. 기존 연습 모드는 그대로 사용할 수 있습니다.

## 구조

```
apps/web/        Vite + React + TypeScript, Lightweight Charts. Cloudflare Pages 로 배포
apps/web/functions/api/[[path]].ts   Pages Functions → apps/api 의 Hono 앱
apps/api/        Hono API (open / submit / meta), D1 스키마·마이그레이션
pipeline/        Python 파이프라인 01~11 (uv)
config/          judge / tags / patterns / sectors / explain 설정
```

## 데이터 파이프라인

```bash
cd pipeline
uv run python 01_fetch_universe.py     # 종목 목록 (상장 + 2020년 이후 상폐)
uv run python 02_fetch_daily.py        # 일봉 증분 수집 (약 30분)
uv run python run_all.py               # 03~10 + seed.sql 생성
uv run python 11_upload.py --local     # 로컬 D1 적재 (--remote: Cloudflare)
uv run pytest -q tests
```

## 웹 / API

```bash
npm install
npm test               # API 단위 테스트
npm run build          # API 타입 검사 + 프로덕션 프론트 빌드
npm run dev            # 빌드 후 wrangler pages dev (http://localhost:8788)
npm run deploy         # Cloudflare Pages 배포 (프로젝트 candlemma)
```

처음 실행하거나 랭킹 버전을 배포하기 전에 `apps/web`에서 `npx wrangler d1 migrations apply candlemma --local`(운영은 `--remote`)로 마이그레이션을 먼저 적용하세요. 운영 DB는 백업 후 적용합니다.

운영 환경에는 `TOKEN_SECRET` 시크릿이 필요하다: `npx wrangler pages secret put TOKEN_SECRET --project-name candlemma`

과거 데이터 기반 학습용 게임이며 투자 권유가 아닙니다.
