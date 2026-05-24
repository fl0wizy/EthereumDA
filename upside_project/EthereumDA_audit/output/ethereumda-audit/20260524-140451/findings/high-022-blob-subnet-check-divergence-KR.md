# [high] Blob Subnet 검사 공식 불일치 (Lighthouse ↔ Prysm)

**Finding ID:** ETH-DA-022
**레이어:** Cross-Client
**컴포넌트:** BlobValidation
**함수:** `validate_blob_sidecar_for_gossip` (LH) vs `validateBlob` (Prysm)
**버그 유형:** `cross-client-divergence`
**신뢰도:** 90/100
**심각도:** **high**

## 설명

Lighthouse는 blob subnet 검증에 직접 동등 비교(`blob_index != subnet`)를 사용하고, Prysm은 스펙의 모듈로 공식(`blob_index % subnet_count != subnet`)을 사용합니다. `BLOB_SIDECAR_SUBNET_COUNT == MAX_BLOBS_PER_BLOCK`이므로 현재는 동치이지만, 의미적으로 다른 공식입니다. 이 상수들이 미래 포크에서 분기되면 두 클라이언트가 blob의 subnet 소속에 대해 불일치하여 gossip 파티션과 잠재적 합의 분할을 유발합니다.

## 영향받는 코드

**Lighthouse:**
- 파일: `lighthouse/beacon_node/beacon_chain/src/blob_verification.rs`
- 라인: `L421-L427`

```rust
// blob_sidecar가 올바른 서브넷에서 수신되었는지 검증.
if blob_index != subnet {
    return Err(GossipBlobError::InvalidSubnet {
        expected: subnet,
        received: blob_index,
    });
}
```

**Prysm:**
- 파일: `prysm/beacon-chain/sync/validate_blob.go`
- 라인: `L5063-L5068`

```go
func computeSubnetForBlobSidecar(index uint64, slot primitives.Slot) uint64 {
    subnetCount := params.BeaconConfig().BlobsidecarSubnetCount
    if slots.ToEpoch(slot) >= params.BeaconConfig().ElectraForkEpoch {
        subnetCount = params.BeaconConfig().BlobsidecarSubnetCountElectra
    }
    return index % subnetCount
}
```

**스펙 명시:**
```
compute_subnet_for_blob_sidecar(sidecar.index) == subnet_id
여기서 compute_subnet_for_blob_sidecar(index) = index % BLOB_SIDECAR_SUBNET_COUNT
```

## 공격 경로

1. 미래 포크가 `BLOB_SIDECAR_SUBNET_COUNT`를 `MAX_BLOBS_PER_BLOCK`과 다르게 변경
2. `index = 7`인 blob이 subnet 1에서 gossip됨
3. Prysm: `7 % 6 = 1` → subnet 일치 → 수용(ACCEPT)
4. Lighthouse: `7 != 1` → 거부(REJECT) (InvalidSubnet)
5. Gossip 파티션: Lighthouse 노드가 Prysm 노드가 수용하는 blob을 거부
6. Lighthouse 시장 점유율 52.6%로, 과반수가 유효한 blob을 거부

## 증명

현재 `BLOB_SIDECAR_SUBNET_COUNT = 6`이고 `MAX_BLOBS_PER_BLOCK = 6` (Deneb)이므로, 유효한 `blob_index ∈ [0,5]`에 대해 `blob_index % 6 == blob_index`입니다. 공식은 동치입니다. 그러나 Prysm은 이미 `BlobsidecarSubnetCountElectra`로 Electra를 처리하며, 상수가 포크 별로 변경될 수 있음을 보여줍니다. 변경 시 Lighthouse의 직접 동등 비교는 깨집니다.

## 영향

- 영향받는 주체: 모든 검증자와 풀 노드
- 최악의 시나리오: gossip 파티션 → 합의 분할 (Lighthouse 52.6% vs Prysm 17.7%)
- Lighthouse > 50%이므로, Lighthouse 단독 거부가 과반수를 파티션하게 됨

## Steelman 반박

이전의 범위 검사 (L414의 `blob_index >= max_blobs_per_block`)가 현재 포크에서 인덱스가 subnet 수를 초과하는 것을 방지하여 모듈로가 무의미해짐. **재반박:** 이는 스펙에 의해 보장되지 않고 Prysm이 이미 위반 준비를 하고 있는 상수 관계(`subnet_count == max_blobs`)에 의존합니다 (별도 Electra 상수).

## 권장 수정

Lighthouse는 `blob_index != subnet`을 스펙 공식과 정확히 일치하는 `blob_index % spec.blob_sidecar_subnet_count != subnet`으로 교체해야 합니다.

## 교차 참조

- 유사 exploit DB 항목: EX-007 (Cross-client gossip 검증 순서 불일치)
- 스펙 조항: (consensus-specs deneb/p2p-interface.md §blob_sidecar 검증)
