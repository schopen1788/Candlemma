# 보합 ±0.5% 판정 (2026-10-24)

사용자가 최종 선택한 기준은 상승 **+0.5% 초과**, 보합 **−0.5% 이상~+0.5% 이하**, 하락 **−0.5% 미만**이다. 연습 T+1/T+3/T+5와 랭킹 T+3 모두 같다. ±0.5% 경계는 보합이며 0.3%, −0.3%도 보합이다. 기존과 동일하게 종가 변동률을 소수 둘째 자리로 반올림한 값으로 판정한다.

`config/judge.yaml`의 `version: flat05-v3`와 기간별 0.5가 원본 설정이다. 파이프라인의 `judge`로 정답을 만들고 서버는 비공개 정답 데이터로 채점한다. 선택 버튼, 상단 판정 안내, 결과의 보합 범위는 서버가 해당 문제에 담은 `flat_band`로 표시한다. 웹의 공통 `directionRanges`를 사용하므로 연습·랭킹에 별도 수치를 하드코딩하지 않는다. 해설의 최종 변동률도 두 자리로 표시해 +0.51%가 +0.5%로 보이는 혼동을 방지한다.

## 데이터와 과거 기록

- 기존 115,421개 원본 장면의 변동률을 다시 판정하고, 15개 패턴·기간별 통계를 재계산한다. 새 기준의 출제 데이터는 1,250문제로 다시 균형 샘플링했다. 공시도 기존 DART 연동으로 다시 연결했다.
- 새 문제 ID에는 판정 버전과 기간을 포함한다. 기존 문제·정답·열람 토큰·게임 세션을 덮어쓰거나 삭제하지 않는다.
- 마이그레이션 `0004_half_percent_judging.sql`은 `all-observations-flat05-v3` 시즌과 `pattern_stats_versions` 테이블을 추가한다. 이전 통계 테이블은 유지하며 결과 API는 문제의 판정 버전에 해당하는 통계를 읽는다. 과거 문제는 과거 통계를 사용한다.
- 이전 `all-v1`, `all-observations-v2` 기록은 각각 별도 랭킹에서 조회한다. 이미 시작한 게임은 당시 문제의 기준으로 제출·복원·등록 가능하다. 새 화면은 `cm.rankedGame.flat05-v3`로 새 기준의 도전을 복원한다.
- 새 연습 문제와 새 랭킹 도전은 활성화된 현재 판정 버전만 고른다. 원본 변화량·정답·미래 캔들은 제출 전에 공개하지 않는다.

## 재생성과 배포

원본 데이터를 다시 수집하지 않고 저장된 변화율을 재사용할 수 있다.

```powershell
# pipeline 디렉터리에서, 순서대로 성공을 확인하며 실행
.venv/Scripts/python.exe 05_label.py --from-existing
.venv/Scripts/python.exe 06_pattern_stats.py
.venv/Scripts/python.exe 07_sample_balance.py
.venv/Scripts/python.exe 07b_fetch_disclosures.py
.venv/Scripts/python.exe 08_difficulty.py
.venv/Scripts/python.exe 09_explain.py
.venv/Scripts/python.exe 10_export.py
.venv/Scripts/python.exe 11_upload.py --stage
```

운영 D1 백업 → 0004 마이그레이션 → `seed.sql` 적재 → 빌드·Pages 배포 → 새 버전 활성화 순으로 적용한다. `--stage`는 기존 활성 문제를 유지하며 새 문제만 비활성 상태로 준비하므로 배포 전 기존 API가 서로 다른 판정 기준의 문제를 섞어 출제하지 않는다. 배포 직후 아래 SQL로 전환한다. 전환 전 잠시 새 문제를 불러오지 못하면 다시 시도할 수 있다.

```sql
UPDATE puzzles_public SET active = CASE
  WHEN json_extract(payload, '$.judge_version') = 'flat05-v3' THEN 1 ELSE 0 END;
```

이후 판정 규칙을 변경할 때도 새 버전·새 시즌을 발급한다. 이미 적재한 같은 ID의 문제 본문은 업로드로 수정하지 않는다.

## 검증

- API/웹 문구 테스트 45개: 로컬 D1의 기간별 ±0.5 경계, ±0.3, ±0.51 제출, 정답·점수·표시 범위·해설·버전별 통계 일치, 이전 게임·시즌 유지, 기존 중복 제출·등록 방어 포함.
- 파이프라인 테스트 36개: 실제 새 출제 데이터 1,250개의 모든 기간별 정답과 변동률 재검사, 보합 경계, 공개 데이터의 미래 정보 제외, 균형 샘플링, 공시 익명화 포함.

## 운영 반영 결과

배포 `https://e5e2f0d9.candlemma.pages.dev`를 완료하고 Trevu 경로에서도 확인했다. 운영 백업은 `.artifacts/candlemma-before-flat05-20261024.sql`이다. 최초 백업의 일시적인 인증 오류는 연결 확인 후 재시도하여 해결했다.

운영에서 T+1/T+3/T+5의 보합 범위 0.5, 문제 수 1,250개, 연습·랭킹의 세 선택 버튼, 기존 두 랭킹 조회를 확인했다. 별도 익명 검증 세션으로 10문제를 모두 제출해 실제 변화율에 따른 서버 정답·점수·해설·통계를 검사했고 정상 완료했다. 공개 랭킹에는 등록하지 않았다. 검증 결과는 `.artifacts/flat05-production-verification.json`에 저장했다.

390px 모바일 크기 검증에서 실제 문서 너비와 스크롤 너비가 모두 375px였고, 세 버튼 각각의 내부 너비와 스크롤 너비가 모두 96px로 등락률 문구가 넘치지 않았다. 검증 후 화면 크기를 복원했다. 스크린샷은 `.artifacts/flat05-practice-production.jpg`, `.artifacts/flat05-ranking-production.jpg`, `.artifacts/flat05-ranking-mobile.jpg`에 저장했다.

## 이전 랭킹 종료 (2026-10-24 후속 변경)

사용자 요청에 따라 공개 랭킹을 최신 기준 하나로 정리하고 이름은 **전체 랭킹**으로 통일했다. 채점 기준 선택 목록과 과거 랭킹 안내를 제거하고, ±0.5%는 일반 규칙 안내에 표시한다. 이전 화면 링크의 `season` 값으로 방문해도 최신 전체 랭킹을 표시한다. 결과 화면의 랭킹 링크도 단일 주소를 사용한다.

이전 두 시즌의 공개 랭킹 조회·내 순위 조회·추가 등록 API는 410과 종료 안내를 반환한다. 최신 시즌의 등록·최고 기록 갱신·TOP 100은 유지한다. 사용자 요청에 따른 `0005_retire_old_rankings.sql`은 `all-v1`, `all-observations-v2`의 랭킹 등록 기록만 삭제한다. 적용 전에 운영 데이터베이스를 백업한다. 개별 게임과 정답 데이터는 남기며, 기존 게임을 직접 복원해 완료한 경우 결과 화면에서 새 기준 도전을 안내한다.

후속 운영 배포는 `https://67ebd921.candlemma.pages.dev`이며 백업 파일은 `.artifacts/candlemma-before-retiring-old-rankings-20261024.sql`이다. 테스트 45개와 프로덕션 빌드를 통과했고, 0005를 운영에 적용한 뒤 이전 두 시즌의 등록 기록이 0개인지 확인했다. Trevu에서 현재 랭킹 200, 과거 두 시즌의 공개/개인 조회 각각 410, 과거 URL로 방문해도 최신 기준 표시, 채점 기준 선택 상자 0개를 확인했다. `.artifacts/single-overall-ranking-production.jpg`에 화면을 저장했다.
