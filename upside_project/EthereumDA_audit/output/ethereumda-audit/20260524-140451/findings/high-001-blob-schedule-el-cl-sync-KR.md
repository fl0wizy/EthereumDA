# [high] BLOB_SCHEDULE 동적 MAX_BLOBS EL↔CL 동기화 위험

**Finding ID:** ETH-DA-001
**레이어:** Cross-Layer (Spec → EL → CL)
**컴포넌트:** EIP-7892-Spec / get_blob_parameters
**함수:** `get_blob_parameters(epoch)` ↔ `MAX_BLOB_GAS_PER_BLOCK`
**버그 유형:** `cross-fork-drift`
**신뢰도:** 85/100
**심각도:** **high**

## 설명

Fulu는 에폭에 따라 `MAX_BLOBS_PER_BLOCK` 값이 변하는 `BLOB_SCHEDULE`을 도입합니다 (6→15→21, 특정 에폭 경계에서). CL은 `get_blob_parameters(epoch)`를 통해 현재 최대값을 동적으로 계산하지만, EL도 동일한 경계에서 `MAX_BLOB_GAS_PER_BLOCK` (= `max_blobs × GAS_PER_BLOB`)을 갱신해야 합니다. EL이 오래된 상수를 사용하면 CL이 수용한 블록을 EL이 거부하게 되어 체인 분할이 발생합니다.

## 영향받는 코드

**주요 (CL 스펙):**
- 파일: `consensus-specs/specs/fulu/beacon-chain.md`
- 라인: `L3137-L3145`

```python
def get_blob_parameters(epoch: Epoch) -> BlobParameters:
    for entry in sorted(BLOB_SCHEDULE, key=lambda e: e['EPOCH'], reverse=True):
        if epoch >= entry['EPOCH']:
            return BlobParameters(entry['EPOCH'], entry['MAX_BLOBS_PER_BLOCK'])
    return BlobParameters(ELECTRA_FORK_EPOCH, MAX_BLOBS_PER_BLOCK_ELECTRA)
```

**부차 (EL):**
- 파일: `go-ethereum/consensus/misc/eip4844/eip4844.go`
- `maxBlobGas` 파라미터가 `get_blob_parameters(epoch).max_blobs_per_block × GAS_PER_BLOB`와 동적으로 일치해야 합니다.

## 공격 경로

1. 에폭 412672에서 blob 파라미터 포크 경계 → `MAX_BLOBS_PER_BLOCK`이 6에서 15로 변경
2. EL 노드가 여전히 하드코딩된 `MAX_BLOB_GAS_PER_BLOCK = 786432` (= 6 × 131072) 사용
3. 제안자가 7개의 blob이 포함된 블록 생성 (새 CL 제한에서 허용)
4. CL이 블록 수용 (get_blob_parameters가 max=15 반환)
5. EL이 블록 거부 (7 × 131072 = 917504 > 786432)
6. 동기화된 EL/CL과 비동기화된 노드 간 체인 분할

## 증명

에폭 411392 (FULU_FORK_EPOCH)에서 BLOB_SCHEDULE에 일치하는 항목 없음 → 폴백이 `MAX_BLOBS_PER_BLOCK_ELECTRA = 6` 반환. 에폭 412672에서 스케줄 항목 일치 → `max=15` 반환. 에폭 419072에서 `max=21` 반환. 이들은 "blob 파라미터 전용" 포크로, fork_version 변경 없이 상수만 갱신됩니다.

Geth의 `eip4844.go`는 현재 `params.BlobTxBlobGasPerBlob`과 체인 설정의 `bc.Max`를 사용합니다. `bc.Max`가 BLOB_SCHEDULE을 반영하여 갱신되지 않으면 INVALID payload 상태를 트리거합니다.

## 영향

- 영향받는 주체: 모든 풀 노드, 모든 검증자, 모든 L2 rollup
- 최악의 시나리오: 모든 BLOB_SCHEDULE 경계 에폭에서 체인 분할
- 예상 재정적 영향: Fusaka/Prysm 사건 선례 기반, 41개 미스된 에폭으로 ~382 ETH proof 보상 손실. 완전한 체인 분할은 훨씬 더 심각할 수 있음.

## Steelman 반박

EL 클라이언트들은 이미 Engine API를 통해 동적 blob 파라미터를 처리하며, CL이 기대 값을 전달합니다. EIP-7892는 조율된 클라이언트 업데이트를 위해 특별히 설계되었습니다. **재반박:** 조율은 원자적이지 않습니다 — 업그레이드 배포 중 일부 노드는 새 스케줄을, 다른 노드는 기존 스케줄을 가지는 시간 창이 존재합니다.

## 권장 수정

EL 구현체는 에폭/타임스탬프별로 blob 스케줄을 조회하는 동적 `MAX_BLOB_GAS_PER_BLOCK`을 구현해야 하며(MUST), CL의 `get_blob_parameters` 로직과 일치해야 합니다. 또는 Engine API가 `engine_forkchoiceUpdated` 응답에서 현재 `max_blobs_per_block`을 전달해야 합니다.

## 웹 리서치 맥락

- **선례:** Fusaka/Prysm 사건 (2025년 12월) — 382 ETH 손실, 41 에폭 미스, finality 손실까지 9% 차이
- **시장 점유율 영향:** Lighthouse 52.6%, Prysm 17.7% — 단일 클라이언트 장애가 상당한 검증자 인구에 영향
- **스펙 논의:** BLOB_SCHEDULE은 EIP-7892의 새로운 메커니즘; 동기화 보장에 대한 커뮤니티 논의 진행 중

## 교차 참조

- 유사 exploit DB 항목: EX-010 (하드포크 상수 드리프트 EL↔CL)
- 체인 파트너: ETH-DA-003 (동일 경계에서 fork_digest 변경)
- 스펙 조항: `consensus-specs/specs/fulu/beacon-chain.md`의 `get_blob_parameters`
