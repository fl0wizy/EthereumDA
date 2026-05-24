# [high] Blob Subnet Check Formula Divergence (Lighthouse ↔ Prysm)

**Finding ID:** ETH-DA-022
**Layer:** Cross-Client
**Component:** BlobValidation
**Function:** `validate_blob_sidecar_for_gossip` (LH) vs `validateBlob` (Prysm)
**Bug class:** `cross-client-divergence`
**Confidence:** 90/100
**Severity:** **high**

## Description

Lighthouse uses direct equality (`blob_index != subnet`) for blob subnet validation, while Prysm uses the spec's modulo formula (`blob_index % subnet_count != subnet`). These are currently equivalent because `BLOB_SIDECAR_SUBNET_COUNT == MAX_BLOBS_PER_BLOCK`, but they are semantically different formulas. If these constants ever diverge in a future fork, the two clients will disagree on which subnet a blob belongs to, causing gossip partition and potentially a consensus split.

## Affected code

**Lighthouse:**
- File: `lighthouse/beacon_node/beacon_chain/src/blob_verification.rs`
- Lines: `L421-L427`

```rust
// Verify that the blob_sidecar was received on the correct subnet.
if blob_index != subnet {
    return Err(GossipBlobError::InvalidSubnet {
        expected: subnet,
        received: blob_index,
    });
}
```

**Prysm:**
- File: `prysm/beacon-chain/sync/validate_blob.go`
- Lines: `L5063-L5068`

```go
func computeSubnetForBlobSidecar(index uint64, slot primitives.Slot) uint64 {
    subnetCount := params.BeaconConfig().BlobsidecarSubnetCount
    if slots.ToEpoch(slot) >= params.BeaconConfig().ElectraForkEpoch {
        subnetCount = params.BeaconConfig().BlobsidecarSubnetCountElectra
    }
    return index % subnetCount
}
```

**Spec says:**
```
compute_subnet_for_blob_sidecar(sidecar.index) == subnet_id
where compute_subnet_for_blob_sidecar(index) = index % BLOB_SIDECAR_SUBNET_COUNT
```

## Attack path

1. Future fork changes `BLOB_SIDECAR_SUBNET_COUNT` to differ from `MAX_BLOBS_PER_BLOCK`
2. Blob with `index = 7` gossiped on subnet 1
3. Prysm: `7 % 6 = 1` → subnet matches → ACCEPT
4. Lighthouse: `7 != 1` → REJECT (InvalidSubnet)
5. Gossip partition: Lighthouse nodes reject blobs that Prysm nodes accept
6. With Lighthouse at 52.6% market share, supermajority rejects valid blobs

## Proof

Currently `BLOB_SIDECAR_SUBNET_COUNT = 6` and `MAX_BLOBS_PER_BLOCK = 6` (Deneb), so for any valid `blob_index ∈ [0,5]`: `blob_index % 6 == blob_index`. The formulas are equivalent. But Prysm already handles Electra with `BlobsidecarSubnetCountElectra`, showing the constant CAN change per fork. Lighthouse's direct equality would break when it does.

## Impact

- Affected actors: all validators and full nodes
- Worst-case scenario: gossip partition → consensus split (Lighthouse 52.6% vs Prysm 17.7%)
- With Lighthouse > 50%, a Lighthouse-only rejection would partition the supermajority

## Steelman refutation

The earlier bounds check (`blob_index >= max_blobs_per_block` at L414) prevents any index from exceeding the subnet count in current forks, making the modulo a no-op. **Rebuttal:** This relies on a constant relationship (`subnet_count == max_blobs`) that is not guaranteed by spec and which Prysm already prepares to violate (separate Electra constant).

## Recommended fix

Lighthouse should replace `blob_index != subnet` with `blob_index % spec.blob_sidecar_subnet_count != subnet` to match the spec formula exactly.

## Cross-references

- Similar exploit DB entry: EX-007 (Cross-client gossip validation ordering divergence)
- Spec clause: (consensus-specs deneb/p2p-interface.md §blob_sidecar validation)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
