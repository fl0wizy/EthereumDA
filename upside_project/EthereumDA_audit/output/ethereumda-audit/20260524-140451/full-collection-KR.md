# EthereumDA 보안 감사 — 전체 발견사항 모음집 (한국어)

**날짜:** 2026-05-24 | **버전:** v1.0.0 | **방법론:** 7-Agent Cross-Layer + Cross-Client 검증

**대상 레포:** EIPs @be9148d, consensus-specs @b8cf07f4d, c-kzg-4844 @e1c5705, go-ethereum @d3edc58, lighthouse @176cce5, prysm @ca3bed0

---

## 통계

| 분류 | 수 |
|------|-----|
| 전체 발견사항 | 21 |
| Critical | 0 |
| High | 4 |
| Medium | 11 |
| Low | 6 |
| LEAD | 18 |
| 1-Depth (직접 공격 가능) | 7 |
| 2-Depth (조건부) | 14 |
| Cross-layer 체인 | 3 |
| Cross-client 불일치 | 5 |

---

## HIGH 발견사항 (4건)

### ETH-DA-001 [HIGH] BLOB_SCHEDULE 동적 MAX_BLOBS EL↔CL 동기화 위험
- **레이어:** Spec (Cross-Layer) | **신뢰도:** 85 | **1-Depth:** 아니오 (포크 경계 필요)
- **버그 유형:** `cross-fork-drift`
- **위치:** `consensus-specs/specs/fulu/beacon-chain.md` L3137-L3145
- **설명:** Fulu의 `BLOB_SCHEDULE`는 에폭 기반 `MAX_BLOBS_PER_BLOCK` (6→15→21)을 도입. EL은 `MAX_BLOB_GAS_PER_BLOCK`을 동적으로 갱신해야 함. 오래된 EL 상수 → CL 수용, EL 거부 → 체인 분할.
- **공격 시나리오:** 제안자가 blob 파라미터 포크 이후 7개 이상의 blob을 포함. 업데이트된 CL은 수용하나 미업데이트 EL은 거부.
- **영향:** 모든 BLOB_SCHEDULE 경계에서 체인 분할. 모든 검증자와 L2 rollup 영향.
- **수정:** EL이 CL의 get_blob_parameters와 일치하는 동적 MAX_BLOB_GAS_PER_BLOCK을 구현해야 함.
- **참조:** EX-010, Fusaka/Prysm 사건 (382 ETH 손실)

### ETH-DA-002 [HIGH] KZG Inclusion Proof Depth 상수 변경 Deneb→Fulu
- **레이어:** Spec | **신뢰도:** 88 | **1-Depth:** 아니오 (Fulu 활성화 필요)
- **버그 유형:** `cross-fork-drift`
- **위치:** `consensus-specs/specs/fulu/p2p-interface.md` L3862-L3864
- **설명:** Deneb `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH=17` → Fulu `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH=4`. 이름(단수→복수) 및 값이 동시 변경. 잘못된 상수 사용 시 모든 sidecar 검증 실패.
- **영향:** 영향받는 클라이언트의 완전한 DA 장애.
- **수정:** 포크 인식 상수 선택; 포크 경계에서 assertion 추가.

### ETH-DA-022 [HIGH] Blob Subnet 검사 공식 불일치 (Lighthouse ↔ Prysm)
- **레이어:** Cross-Client | **신뢰도:** 90 | **1-Depth:** 아니오 (미래 상수 변경 필요)
- **버그 유형:** `cross-client-divergence`
- **위치:** LH `blob_verification.rs` L421-427 vs Prysm `validate_blob.go` L5063-5068
- **설명:** Lighthouse: `blob_index != subnet` (항등식). Prysm: `blob_index % subnet_count` (모듈로). 현재 동치이나 의미적으로 다름.
- **영향:** 미래 상수 변경 시 gossip 파티션. Lighthouse 52.6% → 과반수 파티션.
- **수정:** Lighthouse가 스펙의 모듈로 공식을 사용해야 함.
- **참조:** EX-007

### ETH-DA-023 [HIGH] Reconstruction 실패 모드 불일치 (Lighthouse ↔ Prysm)
- **레이어:** Cross-Client | **신뢰도:** 82 | **1-Depth:** 아니오 (악의적 컬럼 필요)
- **버그 유형:** `cross-client-divergence`
- **위치:** LH `overflow_lru_cache.rs` L1401-L1406 vs Prysm `reconstruction.go` L312-L321
- **설명:** 반대 실패 모드: Lighthouse는 모든 컬럼 삭제(지연). Prysm은 KZG 재검증 생략(무효 데이터 수용 가능). 체인: ETH-DA-018 + ETH-DA-019.
- **영향:** 악의적 컬럼 주입 시 합의 불일치.
- **수정:** LH: 선택적 삭제. Prysm: 재구성된 컬럼의 KZG 재검증.

---

## MEDIUM 발견사항 (11건)

### ETH-DA-003 [MEDIUM] Blob 파라미터 전용 포크에서의 compute_fork_digest 변경
- **레이어:** Spec | **신뢰도:** 83
- **설명:** fork_version 변경 없이 BLOB_SCHEDULE 경계에서 fork_digest 변경 → 암묵적 하드포크 → 네트워크 파티션.
- **수정:** BLOB_SCHEDULE 경계에서의 동적 fork_digest 계산.

### ETH-DA-004 [MEDIUM] fake_exponential 반올림 불일치 위험
- **레이어:** Spec | **신뢰도:** 80
- **설명:** Python 임의 정밀도 vs Go/Rust uint256이 경계값에서 1-wei blob fee 불일치를 유발할 수 있음.

### ETH-DA-005 [MEDIUM] verify_blob_kzg_proof_batch 빈 입력 시 True 반환
- **레이어:** Spec | **신뢰도:** 82
- **설명:** 빈 배치가 True 반환. 빈 서브셋을 전달하는 호출자에 대한 문서화된 함정.

### ETH-DA-006 [MEDIUM] EIP-7594 Wrapper 버전 변경 (4→5 요소)
- **레이어:** Spec | **신뢰도:** 78
- **설명:** Blob tx wrapper 형식이 하위 호환성 명세 없이 변경.

### ETH-DA-007 [MEDIUM] get_custody_groups Node ID Grinding ★1-Depth
- **레이어:** Spec | **신뢰도:** 77
- **설명:** 가장 적은 노드가 배정된 custody group을 선택하기 위한 node_id 무차별 대입. 참조: EX-008.

### ETH-DA-010 [MEDIUM] Trusted Setup 무결성 검사 없는 로딩
- **레이어:** Crypto | **신뢰도:** 78
- **설명:** 로드 시 정식 KZG 세레모니 출력에 대한 SHA256 체크섬 없음. 참조: EX-001.

### ETH-DA-013 [MEDIUM] 계정 당 1-Wei Blobpool 고갈 ★1-Depth
- **레이어:** EL | **신뢰도:** 80
- **설명:** ~208개 계정으로 ~2 ETH에 2.5GB 풀 채움. EIP-7918이 부분적으로 완화. 참조: EX-003.

### ETH-DA-014 [MEDIUM] 교체 시 크기 기록 오버플로 ★1-Depth
- **레이어:** EL | **신뢰도:** 78
- **설명:** 교체 트랜잭션이 더 작을 때 uint64 빼기 랩핑 → 치명적 퇴출.

### ETH-DA-015 [MEDIUM] engine_getBlobsV1 Nil Proof 시 Panic ★1-Depth
- **레이어:** EL | **신뢰도:** 76
- **설명:** nil 검사 없이 `proofs[i][0]` 접근 → panic → engine API 충돌.

### ETH-DA-016 [MEDIUM] JWT 인증 없는 Testing API ★1-Depth
- **레이어:** EL | **신뢰도:** 75
- **설명:** engine 네임스페이스와 함께 `testing_` 네임스페이스 `Authenticated: false`. 참조: EX-005.

### ETH-DA-017 [MEDIUM] from_execution_verified가 KZG 검증 건너뜀
- **레이어:** CL-Lighthouse | **신뢰도:** 80
- **설명:** EL 소스 blob이 KZG proof 검증을 완전히 우회.

### ETH-DA-018 [MEDIUM] Reconstruction 실패 시 모든 컬럼 삭제 ★1-Depth
- **레이어:** CL-Lighthouse | **신뢰도:** 77
- **설명:** 불량 컬럼 1개 → 검증된 64개 이상의 컬럼 전부 삭제 → DoS 증폭.

### ETH-DA-019 [MEDIUM] 재구성된 컬럼의 KZG 재검증 생략
- **레이어:** CL-Prysm | **신뢰도:** 82
- **설명:** 독립적 KZG 검사 없이 `NewVerifiedRODataColumn` 사용.

### ETH-DA-020 [MEDIUM] Gloas Data Column의 Inclusion Proof 생략
- **레이어:** CL-Prysm | **신뢰도:** 80
- **설명:** `if sidecar.IsGloas() { return nil }` — inclusion proof 우회.

### ETH-DA-021 [MEDIUM] GetBlobs 해시 별 잠금으로 인한 Torn Read
- **레이어:** Cross-Layer | **신뢰도:** 78
- **설명:** vhash 별 RLock/RUnlock, 요청 전체에 대해 원자적이지 않음 → 비일관적 blob 스냅샷.

### ETH-DA-024 [MEDIUM] Seen-Check 순서 불일치
- **레이어:** Cross-Client | **신뢰도:** 78
- **설명:** LH: seen-check 전에 inclusion proof. Prysm: seen-check 먼저. 다른 CPU 프로필.

### ETH-DA-025 [MEDIUM] Gloas Data Column 처리 불일치
- **레이어:** Cross-Client | **신뢰도:** 80
- **설명:** Prysm은 Gloas의 inclusion proof를 건너뜀. LH에는 페널티에 대한 TODO만 존재.

---

## LOW 발견사항 (6건)

### ETH-DA-008 [LOW] Blob Sidecar Equivocation 무시 ★1-Depth
- **레이어:** Spec | **신뢰도:** 80
- **설명:** 다른 내용의 중복 sidecar가 slashing 증거 없이 IGNORE됨.

### ETH-DA-009 [LOW] BlobSidecarsByRange KZG에 대한 SHOULD vs MUST
- **레이어:** Spec | **신뢰도:** 78
- **설명:** SHOULD는 동기화 중 KZG 검증 생략을 허용.

### ETH-DA-011 [LOW] validateCellIndices 개별 인덱스 범위 검사 누락
- **레이어:** Crypto | **신뢰도:** 76
- **설명:** 개별 cell_index < CELLS_PER_EXT_BLOB 검사 없음. C 라이브러리가 내부적으로 처리.

### ETH-DA-012 [LOW] Point Evaluation Precompile BLS_MODULUS 검사 누락
- **레이어:** EL | **신뢰도:** 75
- **설명:** VerifyProof 전에 z, y의 BLS_MODULUS 검사 없음. [agents: 2]

---

## LEAD (18건)

| ID | 레이어 | 설명 | 신뢰도 |
|----|--------|------|--------|
| L-01 | EL | drop() 힙 업데이트 단조 가정 | 55 |
| L-02 | EL | sidecar nil 시 newBlobTxForPool panic | 50 |
| L-03 | EL | 오래된 상태에서 ExistingCost uint64 언더플로 | 45 |
| L-04 | EL | 다른 제한을 사용하는 Blob 수 이중 검사 | 40 |
| L-05 | EL | reorg 깊이의 Float64 정밀도 손실 | 45 |
| L-06 | EL | excess_blob_gas uint64 오버플로 (이론적) | 35 |
| L-07 | EL | getBlobs V2/V3의 TOCTOU | 55 |
| L-08 | EL | 128 이후 invalidBlockHitEviction 용서 | 50 |
| L-09 | EL | fcuV3 ↔ npV3 포크 수용 비대칭 | 45 |
| L-10 | Crypto | 빈 배치 FFI nil 포인터를 C에 전달 | 55 |
| L-11 | Crypto | LoadTrustedSetup에 runtime.KeepAlive 없음 | 45 |
| L-12 | Crypto | 빈 cellIndices에서 ckzgRecoverBlobs 0 나누기 | 45 |
| L-13 | Crypto | KZGSettings 스레드 안전하지 않음 | 40 |
| L-14 | CL-LH | SSZ 역직렬화 범위 미검증 | 40 |
| L-15 | CL-LH | InvalidVariant에 피어 페널티 없음 (TODO) | 55 |
| L-16 | CL-LH | RepeatBlob에 propagate_validation_result 없음 | 50 |
| L-17 | CL-Prysm | 자체 생성 컬럼이 검증 우회 | 55 |
| L-18 | CL-Prysm | Gloas 대기 큐 메모리 제한 없음 | 45 |

---

## Cross-Layer 체인

| 체인 | 발견사항 | 결합 영향 |
|------|---------|----------|
| BLOB_SCHEDULE 동기화 | ETH-DA-001 + ETH-DA-003 | EL↔CL 분할 + 네트워크 파티션 |
| Reconstruction 불일치 | ETH-DA-018 + ETH-DA-019 → ETH-DA-023 | 지연(LH) + 무효 수용(Prysm) |
| EL 신뢰 우회 | ETH-DA-017 + ETH-DA-021 | EL을 통한 무효 blob → CL이 KZG 없이 수용 |

---

## 1-Depth 취약점 (7건) — 직접 공격 가능

| ID | 심각도 | 발견사항 | 트리거 | 영향 |
|----|--------|---------|--------|------|
| ETH-DA-013 | Medium | 계정 당 1-wei blobpool 고갈 | ~208개 계정에서 1 wei blob fee로 blob tx 전송 | 풀 DoS, 정상 L2 tx 퇴출 (~2 ETH 비용) |
| ETH-DA-015 | Medium | engine_getBlobsV1 nil proof panic | 풀 퇴출 중 CL이 getBlobsV1 호출 | Engine API 충돌, CL이 EL 연결 상실 |
| ETH-DA-018 | Medium | Reconstruction 실패 시 모든 컬럼 삭제 (LH) | 64개 이상의 유효 컬럼 중 1개 악의적 컬럼 전송 | DoS 증폭: O(N/2) 컬럼 재다운로드 |
| ETH-DA-007 | Medium | Node ID grinding으로 custody group 선택 | 노드 운영자가 키 생성을 무차별 대입 | DA 기여 감소, custody 비대칭 |
| ETH-DA-016 | Medium | JWT 인증 없는 Testing API | engine 포트 8551에 네트워크 접근 가능한 모든 사람 | 비인증 블록 생성 |
| ETH-DA-014 | Medium | tx 교체 시 크기 기록 오버플로 | 6-blob tx를 1-blob tx로 교체 | p.stored 랩핑 → 치명적 풀 퇴출 |
| ETH-DA-008 | Low | Blob sidecar equivocation 무시 | 악의적 제안자가 2개 다른 sidecar 전송 | equivocation 미탐지, slashing 없음 |

---

*EthereumDA Multi-Layer Auditor v1.0.0으로 생성*
