# [high] Reconstruction 실패 모드 불일치 (Lighthouse ↔ Prysm)

**Finding ID:** ETH-DA-023
**레이어:** Cross-Client
**컴포넌트:** DataColumnReconstruction
**함수:** `handle_reconstruction_failure` (LH) vs `ReconstructDataColumnSidecars` (Prysm)
**버그 유형:** `cross-client-divergence`
**신뢰도:** 82/100
**심각도:** **high**

## 설명

Lighthouse와 Prysm은 PeerDAS data column reconstruction에서 **정반대의** 실패 모드를 가집니다:
- **Lighthouse:** reconstruction 실패 시 이전에 검증된 모든 data column을 삭제하고 리셋, 전체 재다운로드 필요
- **Prysm:** reconstruction 성공 시 KZG proof를 재검증하지 않고(`NewVerifiedRODataColumn`) 출력을 검증됨으로 표시

이들은 상호보완적 취약점입니다: Lighthouse는 과도하게 삭제(가용성 지연 DoS), Prysm은 과소 검증(잠재적 무효 데이터 수용). 적대적 조건에서 한 클라이언트는 정지하고 다른 클라이언트는 무효 데이터를 수용할 수 있습니다.

## 영향받는 코드

**Lighthouse:**
- 파일: `lighthouse/beacon_node/beacon_chain/src/data_availability_checker/overflow_lru_cache.rs`
- 라인: `L1401-L1406`

```rust
pub fn handle_reconstruction_failure(&self, block_root: &Hash256) {
    if let Some(pending_components_mut) = self.critical.write().get_mut(block_root) {
        pending_components_mut.verified_data_columns = vec![];
        pending_components_mut.reconstruction_started = false;
    }
}
```

**Prysm:**
- 파일: `prysm/beacon-chain/core/peerdas/reconstruction.go`
- 라인: `L312-L321`

```go
// 입력 sidecar는 검증되었고, 누락된 sidecar는 우리가 직접 재구성했습니다.
// 따라서 재구성된 sidecar도 검증된 것입니다.
reconstructedVerifiedRoSidecars := make([]blocks.VerifiedRODataColumn, 0, len(outSidecars))
for _, sidecar := range outSidecars {
    verifiedRoSidecar := blocks.NewVerifiedRODataColumn(sidecar)
    reconstructedVerifiedRoSidecars = append(reconstructedVerifiedRoSidecars, verifiedRoSidecar)
}
return reconstructedVerifiedRoSidecars, nil
```

## 공격 경로

1. 공격자가 reconstruction에 필요한 64개 이상의 custody column 중 1개를 제어
2. 공격자가 개별 KZG 검증을 통과하지만 미묘하게 손상된 cell 데이터를 가진 column 전송
3. **Lighthouse 경로:** Reconstruction 실패 → 유효한 63개 이상의 column 전부 삭제 → 모든 것을 재다운로드 → 가용성 지연 → DoS
4. **Prysm 경로:** 손상된 입력으로 reconstruction 성공 시 부정확한 출력 생성 → `NewVerifiedRODataColumn`이 검증됨으로 표시 → 무효 데이터 저장 및 서빙
5. 결합: Lighthouse 정지, Prysm이 무효 데이터 수용 가능 → 합의 불일치

## 증명

불일치는 각 클라이언트가 reconstruction 출력을 신뢰하는 방식에 있습니다:
- Lighthouse는 보수적: 어떤 실패든 → 초토화 (전부 삭제)
- Prysm은 낙관적: reconstruction 출력은 구조상 신뢰됨

Prysm의 주석 "입력 sidecar는 검증되었고, 누락된 sidecar는 우리가 직접 재구성했습니다. 따라서 재구성된 sidecar도 검증된 것입니다"는 유효한 입력으로부터의 Reed-Solomon reconstruction이 항상 유효한 출력을 생성한다고 가정합니다. 이는 모든 입력이 올바르고 reconstruction 알고리즘에 버그가 없는 경우에만 수학적으로 참입니다. 그러나 입력 하나라도 검증을 우회했거나 미묘한 인코딩 오류가 있으면 출력은 조용히 잘못됩니다.

## 영향

- 영향받는 주체: 어느 한 클라이언트를 실행하는 모든 풀 노드와 검증자
- 최악의 시나리오: 합의 불일치 — Lighthouse 노드는 블록을 불가용으로, Prysm 노드는 잠재적으로 다른 데이터로 가용으로 표시
- 재구성된 데이터에 의존하는 L2 rollup이 Prysm에서 잘못된 상태 전환을 처리할 수 있음

## Steelman 반박

**Lighthouse:** 모든 column 삭제는 안전합니다 (보수적). 건전한 네트워크에서 정직한 피어로부터 재다운로드는 빠릅니다. **Prysm:** 유효한 입력으로부터의 Reed-Solomon reconstruction은 수학적으로 올바른 출력을 보장합니다; c-kzg-4844의 `RecoverCellsAndKZGProofs`가 내부적으로 검증합니다. **결합에 대한 재반박:** 서로 다른 신뢰 모델은 동일한 적대적 입력이 다른 결과(정지 vs 수용)를 생산하며, 이것이 바로 합의 분할 위험입니다.

## 권장 수정

- **Lighthouse:** 실패에 기여한 column만 삭제하고, 모든 column을 삭제하지 않기
- **Prysm:** 재구성된 column에 대해 검증됨으로 표시하기 전에 KZG proof 재검증

## 교차 참조

- 유사 exploit DB 항목: 없음 (새로운 cross-client 발견)
- 체인 파트너: ETH-DA-018 (Lighthouse 측) + ETH-DA-019 (Prysm 측)
- 스펙 조항: "노드는 네트워크에서 수신한 것처럼 새 column을 노출해야 한다(MUST)" (consensus-specs fulu/das-core.md)
