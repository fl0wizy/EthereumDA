# [high] Reconstruction Failure Mode Divergence (Lighthouse ↔ Prysm)

**Finding ID:** ETH-DA-023
**Layer:** Cross-Client
**Component:** DataColumnReconstruction
**Function:** `handle_reconstruction_failure` (LH) vs `ReconstructDataColumnSidecars` (Prysm)
**Bug class:** `cross-client-divergence`
**Confidence:** 82/100
**Severity:** **high**

## Description

Lighthouse and Prysm have **opposite** failure modes for PeerDAS data column reconstruction:
- **Lighthouse:** On reconstruction failure, discards ALL previously-verified data columns and resets, requiring complete re-fetch
- **Prysm:** On reconstruction success, marks output as verified (`NewVerifiedRODataColumn`) WITHOUT re-verifying KZG proofs

These are complementary vulnerabilities: Lighthouse over-discards (availability stall DoS), Prysm under-verifies (potential invalid data acceptance). Under adversarial conditions, one client stalls while the other may accept invalid data.

## Affected code

**Lighthouse:**
- File: `lighthouse/beacon_node/beacon_chain/src/data_availability_checker/overflow_lru_cache.rs`
- Lines: `L1401-L1406`

```rust
pub fn handle_reconstruction_failure(&self, block_root: &Hash256) {
    if let Some(pending_components_mut) = self.critical.write().get_mut(block_root) {
        pending_components_mut.verified_data_columns = vec![];
        pending_components_mut.reconstruction_started = false;
    }
}
```

**Prysm:**
- File: `prysm/beacon-chain/core/peerdas/reconstruction.go`
- Lines: `L312-L321`

```go
// Input sidecars are verified, and we reconstructed ourselves the missing sidecars.
// As a consequence, reconstructed sidecars are also verified.
reconstructedVerifiedRoSidecars := make([]blocks.VerifiedRODataColumn, 0, len(outSidecars))
for _, sidecar := range outSidecars {
    verifiedRoSidecar := blocks.NewVerifiedRODataColumn(sidecar)
    reconstructedVerifiedRoSidecars = append(reconstructedVerifiedRoSidecars, verifiedRoSidecar)
}
return reconstructedVerifiedRoSidecars, nil
```

## Attack path

1. Attacker controls 1 custody column out of 64+ needed for reconstruction
2. Attacker sends a column that passes individual KZG verification but has subtly corrupted cell data
3. **Lighthouse path:** Reconstruction fails → all 63+ valid columns discarded → node must re-fetch everything → availability stall → DoS
4. **Prysm path:** If reconstruction succeeds with corrupted input producing incorrect output → `NewVerifiedRODataColumn` marks it as verified → invalid data stored and served
5. Combined: Lighthouse stalls, Prysm may accept invalid data → consensus divergence

## Proof

The divergence is in how each client trusts reconstruction output:
- Lighthouse is conservative: any failure → scorched earth (clear everything)
- Prysm is optimistic: reconstruction output is trusted by construction

The Prysm comment "Input sidecars are verified, and we reconstructed ourselves the missing sidecars. As a consequence, reconstructed sidecars are also verified" assumes Reed-Solomon reconstruction from valid inputs always produces valid outputs. This is mathematically true IF all inputs are correct AND the reconstruction algorithm has no bugs. However, if even one input bypassed verification or has a subtle encoding error, the output is silently wrong.

## Impact

- Affected actors: all full nodes and validators running either client
- Worst-case scenario: consensus divergence — Lighthouse nodes show block unavailable while Prysm nodes show it available with potentially different data
- L2 rollups depending on reconstructed data from Prysm could process incorrect state transitions

## Steelman refutation

**Lighthouse:** Clearing all columns is safe (conservative). Re-fetching from honest peers is fast on a healthy network. **Prysm:** Reed-Solomon reconstruction from valid inputs mathematically guarantees correct outputs; `RecoverCellsAndKZGProofs` in c-kzg-4844 internally verifies. **Rebuttal for combined:** The different trust models mean the same adversarial input produces different outcomes (stall vs accept), which IS the consensus split risk.

## Recommended fix

- **Lighthouse:** Only discard columns that contributed to the failure, not ALL columns
- **Prysm:** Re-verify KZG proofs on reconstructed columns before marking as verified

## Cross-references

- Similar exploit DB entry: none (novel cross-client finding)
- Chain partner: ETH-DA-018 (Lighthouse side) + ETH-DA-019 (Prysm side)
- Spec clause: "the node MUST expose the new column as if it had received it over the network" (consensus-specs fulu/das-core.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
