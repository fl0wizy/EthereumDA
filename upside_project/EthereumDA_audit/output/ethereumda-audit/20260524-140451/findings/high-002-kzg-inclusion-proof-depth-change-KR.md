# [high] KZG Inclusion Proof Depth 상수 변경 Deneb→Fulu

**Finding ID:** ETH-DA-002
**레이어:** Spec
**컴포넌트:** Fulu-Deneb-Drift
**함수:** `verify_blob_sidecar_inclusion_proof` / `verify_data_column_sidecar_inclusion_proof`
**버그 유형:** `cross-fork-drift`
**신뢰도:** 88/100
**심각도:** **high**

## 설명

Deneb은 블록 바디 Merkle 트리 내의 개별 commitment를 증명하기 위해 `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17`을 사용합니다. Fulu는 이를 `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4`로 변경하며(복수형 "commitmentS" 주의), 개별 commitment 대신 전체 commitments 리스트를 증명합니다. 상수 이름과 값이 동시에 변경됩니다. 포크 경계에서 잘못된 상수를 사용하는 클라이언트는 모든 sidecar inclusion proof 검증에 실패합니다.

## 영향받는 코드

**스펙:**
- 파일: `consensus-specs/specs/fulu/p2p-interface.md`
- 라인: `L3862-L3864`

```python
# Deneb
KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17  # blob 당 commitment Merkle proof

# Fulu
KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4  # 전체 리스트 Merkle proof
```

## 공격 경로

1. Fulu 포크 활성화
2. 클라이언트 구현이 Fulu DataColumnSidecar 검증에 Deneb 상수(depth 17) 사용
3. Merkle proof 검증이 17단계 트리를 기대하나 4단계 proof를 수신
4. 모든 inclusion proof 검증 실패
5. 모든 sidecar 거부 → 완전한 DA 불가용성
6. L2 rollup이 fraud proof를 위한 blob 데이터에 접근 불가

## 증명

Deneb: `floorlog2(gindex) + 1 + ceillog2(MAX_BLOB_COMMITMENTS_PER_BLOCK)` = 17 (개별 commitment proof).
Fulu: `floorlog2(get_generalized_index(BeaconBlockBody, 'blob_kzg_commitments'))` = 4 (전체 리스트 proof).

증명 대상이 `commitment[i]` (개별)에서 `hash_tree_root(kzg_commitments)` (리스트 루트)로 변경됩니다.

## 영향

- 영향받는 주체: 영향받는 클라이언트를 실행하는 모든 검증자와 풀 노드
- 최악의 시나리오: blob이 포함된 모든 블록에 대한 완전한 DA 장애
- L2 rollup의 데이터 가용성 보장 상실

## Steelman 반박

타입 시스템이 `BlobSidecar` (Deneb)와 `DataColumnSidecar` (Fulu)를 분리하므로, 잘 구조화된 코드는 자연스럽게 올바른 상수를 사용합니다. **재반박:** 모든 구현체가 강력한 타입 경계를 가지는 것은 아닙니다; 공유 유틸리티 함수가 잘못된 상수를 사용할 수 있습니다.

## 권장 수정

구현체는 포크 인식 상수 선택을 사용해야 합니다(MUST): Deneb BlobSidecar에는 `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17`, Fulu DataColumnSidecar에는 `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4`. 포크 경계에서 명시적 assertion을 추가해야 합니다.

## 교차 참조

- 유사 exploit DB 항목: 없음
- 스펙 조항: `consensus-specs/specs/fulu/p2p-interface.md` L3862-L3864
