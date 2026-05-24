# [high] BLOB_SCHEDULE Dynamic MAX_BLOBS EL↔CL Synchronization Risk

**Finding ID:** ETH-DA-001
**Layer:** Cross-Layer (Spec → EL → CL)
**Component:** EIP-7892-Spec / get_blob_parameters
**Function:** `get_blob_parameters(epoch)` ↔ `MAX_BLOB_GAS_PER_BLOCK`
**Bug class:** `cross-fork-drift`
**Confidence:** 85/100
**Severity:** **high**

## Description

Fulu introduces `BLOB_SCHEDULE` with epoch-dependent `MAX_BLOBS_PER_BLOCK` values (6→15→21 at specific epoch boundaries). The CL dynamically computes the current max via `get_blob_parameters(epoch)`, but the EL must also update `MAX_BLOB_GAS_PER_BLOCK` (= `max_blobs × GAS_PER_BLOB`) at the same boundaries. If the EL uses stale constants, blocks accepted by the CL will be rejected by the EL (or vice versa), causing a chain split.

## Affected code

**Primary (CL spec):**
- File: `consensus-specs/specs/fulu/beacon-chain.md`
- Lines: `L3137-L3145`

```python
def get_blob_parameters(epoch: Epoch) -> BlobParameters:
    for entry in sorted(BLOB_SCHEDULE, key=lambda e: e['EPOCH'], reverse=True):
        if epoch >= entry['EPOCH']:
            return BlobParameters(entry['EPOCH'], entry['MAX_BLOBS_PER_BLOCK'])
    return BlobParameters(ELECTRA_FORK_EPOCH, MAX_BLOBS_PER_BLOCK_ELECTRA)
```

**Secondary (EL):**
- File: `go-ethereum/consensus/misc/eip4844/eip4844.go`
- The `maxBlobGas` parameter must dynamically match `get_blob_parameters(epoch).max_blobs_per_block × GAS_PER_BLOB`.

## Attack path

1. Blob-parameter fork boundary at epoch 412672 → `MAX_BLOBS_PER_BLOCK` changes from 6 to 15
2. EL node still uses hardcoded `MAX_BLOB_GAS_PER_BLOCK = 786432` (= 6 × 131072)
3. Proposer creates block with 7 blobs (allowed by new CL limit)
4. CL accepts block (get_blob_parameters returns max=15)
5. EL rejects block (7 × 131072 = 917504 > 786432)
6. Chain split between nodes with synchronized vs unsynchronized EL/CL

## Proof

At epoch 411392 (FULU_FORK_EPOCH), BLOB_SCHEDULE has no matching entry → fallback returns `MAX_BLOBS_PER_BLOCK_ELECTRA = 6`. At epoch 412672, the schedule entry matches → returns `max=15`. At epoch 419072, returns `max=21`. These are "blob-parameter-only" forks — no fork_version change, just constant updates.

Geth's `eip4844.go` currently uses `params.BlobTxBlobGasPerBlob` and `bc.Max` from chain config. If `bc.Max` is not updated to reflect the BLOB_SCHEDULE, the mismatch triggers INVALID payload status.

## Impact

- Affected actors: all full nodes, all validators, all L2 rollups
- Worst-case scenario: chain split at every BLOB_SCHEDULE boundary epoch
- Estimated financial impact: based on Fusaka/Prysm incident precedent, 41 missed epochs cost ~382 ETH in proof rewards. A full chain split could be significantly worse.

## Steelman refutation

EL clients already handle dynamic blob parameters via the Engine API, where the CL communicates expected values. EIP-7892 is specifically designed for coordinated client updates. **Rebuttal:** The coordination is not atomic — there is a window during upgrade deployment where some nodes may have the new schedule and others don't.

## Recommended fix

EL implementations MUST implement dynamic `MAX_BLOB_GAS_PER_BLOCK` that queries the blob schedule by epoch/timestamp, matching the CL's `get_blob_parameters` logic. Alternatively, the Engine API should communicate the current `max_blobs_per_block` in `engine_forkchoiceUpdated` responses.

## Web research context

- **Precedent:** Fusaka/Prysm incident (Dec 2025) — 382 ETH lost, 41 epochs missed, network within 9% of finality loss
- **Market share impact:** Lighthouse 52.6%, Prysm 17.7% — any single-client failure affects significant validator population
- **Spec discussion:** BLOB_SCHEDULE is a new mechanism in EIP-7892; community discussion ongoing about synchronization guarantees

## Cross-references

- Similar exploit DB entry: EX-010 (Hardfork constant drift EL↔CL)
- Chain partner: ETH-DA-003 (fork_digest changes at same boundaries)
- Spec clause: `get_blob_parameters` in `consensus-specs/specs/fulu/beacon-chain.md`
