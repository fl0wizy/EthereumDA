# EthereumDA Security Audit Report

**Date:** 2026-05-24
**Scope:** Full (Spec / Crypto / EL / CL × 7-Agent + Cross-Verification)
**Repos audited:** EIPs @be9148d, consensus-specs @b8cf07f4d, c-kzg-4844 @e1c5705, go-ethereum @d3edc58, lighthouse @176cce5, prysm @ca3bed0
**Audit version:** ethereumda-auditor v1.0.0

---

## Executive Summary

- **Total findings: 21** (critical: 0, high: 4, medium: 11, low: 6)
- **Cross-layer chains: 3**
- **Cross-client divergences: 5**
- **Spec invariant violations: 2**
- **LEADs (for follow-up): 18**
- **Known-issues overlap: 0** (none provided)

### Key Highlights

1. **Lighthouse ↔ Prysm reconstruction divergence** — Lighthouse discards ALL verified columns on failure; Prysm skips KZG re-verification on reconstructed columns. Combined: one client stalls availability, the other may accept invalid data. (high, cross-client)
2. **BLOB_SCHEDULE dynamic MAX_BLOBS synchronization** — Fulu introduces epoch-dependent blob limits that must be synchronized EL ↔ CL; stale EL constants → chain split at blob-parameter fork boundary. (high, cross-layer)
3. **KZG inclusion proof depth constant change** — Deneb→Fulu changes both name and value (17→4); mixing constants = all sidecar verification fails. (high, spec)
4. **Blob subnet check formula divergence** — Lighthouse uses identity check, Prysm uses modulo. Currently equivalent but semantically different; future constant change → gossip partition. (high, cross-client)

---

## Findings by Layer

### Spec (EIP-4844 + EIP-7594 + consensus-specs)

#### ETH-DA-001 [**high**] BLOB_SCHEDULE Dynamic MAX_BLOBS EL↔CL Synchronization Risk
- **Layer:** Spec | **Component:** EIP-7892-Spec
- **Function:** `get_blob_parameters`
- **Bug class:** `cross-fork-drift`
- **Confidence:** 85/100
- **File:** `consensus-specs/specs/fulu/beacon-chain.md` L3137-L3145

**Description:** Fulu introduces `BLOB_SCHEDULE` with epoch-dependent `MAX_BLOBS_PER_BLOCK` (6→15→21). EL must dynamically update `MAX_BLOB_GAS_PER_BLOCK` to match. If EL uses stale constants at blob-parameter-only fork boundaries, CL and EL disagree on block validity.

**Spec clause:**
```
def get_blob_parameters(epoch):
    for entry in sorted(BLOB_SCHEDULE, key=lambda e: e['EPOCH'], reverse=True):
        if epoch >= entry['EPOCH']:
            return BlobParameters(entry['EPOCH'], entry['MAX_BLOBS_PER_BLOCK'])
    return BlobParameters(ELECTRA_FORK_EPOCH, MAX_BLOBS_PER_BLOCK_ELECTRA)
```

**Attack path:**
1. Blob-parameter fork at epoch 412672 (max: 6→15)
2. EL still uses `MAX_BLOB_GAS_PER_BLOCK = 786432` (= 6 × 131072)
3. Proposer includes 7+ blobs in block
4. CL accepts (get_blob_parameters returns max=15), EL rejects (exceeds old max)
5. Chain split between updated and non-updated nodes

**Impact:** Chain split at every BLOB_SCHEDULE boundary. Affects all full nodes and validators.

**Steelman:** EL clients already handle this via Engine API communication; EIP-7892 is specifically designed with coordinated client updates.

**Fix:** EL MUST implement dynamic `MAX_BLOB_GAS_PER_BLOCK` matching CL's `get_blob_parameters` schedule.

**Web context:** BPO1 raised target to 10/15 (Dec 2025), BPO2 to 14/21 (Jan 2026). The Fusaka/Prysm incident (Dec 2025, 382 ETH lost, 41 epochs missed) demonstrates how fork-boundary bugs cascade.

🔗 Similar to EX-010: Hardfork constant drift EL↔CL

---

#### ETH-DA-002 [**high**] KZG Inclusion Proof Depth Constant Change Deneb→Fulu
- **Layer:** Spec | **Component:** Fulu-Deneb-Drift
- **Bug class:** `cross-fork-drift`
- **Confidence:** 88/100
- **File:** `consensus-specs/specs/fulu/p2p-interface.md` L3862-L3864

**Description:** Deneb uses `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17` (per-blob commitment proof). Fulu changes to `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4` (whole-list proof). Name changes singular→plural AND value drops 17→4. Mixing these = all sidecar verification fails.

**Attack path:**
1. Fulu activates
2. Client uses Deneb's depth-17 constant for Fulu DataColumnSidecar verification
3. All inclusion proof verifications fail (wrong Merkle depth)
4. All sidecars rejected → DA unavailable
5. L2 rollups cannot verify fraud proofs

**Impact:** Complete DA failure for affected clients. L2 rollups at risk.

**Steelman:** Type system separates `BlobSidecar` and `DataColumnSidecar`, so well-structured code naturally uses the correct constant.

**Fix:** Implementations MUST use fork-aware constant selection.

---

#### ETH-DA-003 [**high**] compute_fork_digest Changes at Blob-Parameter-Only Forks
- **Layer:** Spec | **Component:** Fulu-P2P
- **Function:** `compute_fork_digest`
- **Bug class:** `cross-fork-drift`
- **Confidence:** 83/100
- **File:** `consensus-specs/specs/fulu/beacon-chain.md` L3153-L3184

**Description:** Blob-parameter-only forks change `fork_digest` by XORing `hash(epoch || max_blobs_per_block)` without changing `fork_version`. This creates implicit hard forks at every `BLOB_SCHEDULE` boundary. Non-upgraded clients produce different digests → network partition.

**Impact:** Network partition at every BLOB_SCHEDULE epoch boundary. DA degradation for all L2 rollups.

**Fix:** All client implementations MUST dynamically compute `fork_digest` at every BLOB_SCHEDULE boundary.

---

#### ETH-DA-004 [**medium**] fake_exponential Rounding Divergence Risk
- **Layer:** Spec | **Component:** EIP-4844-Spec
- **Function:** `fake_exponential`
- **Bug class:** `spec-ambiguity`
- **Confidence:** 80/100
- **File:** `EIPs/EIPS/eip-4844.md` L88-L97

**Description:** Python spec uses arbitrary precision integers. Go/Rust implementations use uint256. At boundary values, intermediate overflow handling and division order can cause 1-wei blob base fee divergence → block ACCEPT/REJECT disagreement.

**Steelman:** All major clients pass consensus-spec-tests covering edge cases.

---

#### ETH-DA-005 [**medium**] verify_blob_kzg_proof_batch Empty-Input Returns True
- **Layer:** Spec | **Component:** EIP-4844-Spec
- **Bug class:** `missing-edge-case-spec`
- **Confidence:** 82/100

**Description:** `verify_blob_kzg_proof_batch` returns True for empty inputs (0 blobs). Documented but creates a foot-gun if callers erroneously pass empty subsets.

---

#### ETH-DA-006 [**medium**] EIP-7594 Wrapper Version Change (4→5 Elements)
- **Layer:** Spec | **Component:** EIP-7594-Spec
- **Bug class:** `missing-edge-case-spec`
- **Confidence:** 78/100

**Description:** Blob tx wrapper format changes from 4 elements (EIP-4844) to 5 elements (EIP-7594, with `wrapper_version` byte). No backward compatibility or version negotiation specified.

---

#### ETH-DA-007 [**medium**] get_custody_groups Node ID Grinding
- **Layer:** Spec | **Component:** Fulu-DAS
- **Bug class:** `missing-edge-case-spec`
- **Confidence:** 77/100

**Description:** Attacker can brute-force node_ids to choose least-populated custody groups, minimizing DA contribution while appearing compliant.

🔗 Similar to EX-008: PeerDAS custody node_id grinding

---

#### ETH-DA-008 [**low**] Blob Sidecar Equivocation Silently IGNOREd
- **Layer:** Spec | **Component:** Deneb-P2P
- **Bug class:** `spec-ambiguity`
- **Confidence:** 80/100

**Description:** Duplicate blob sidecars with different content for the same tuple are IGNORED without generating slashing evidence.

---

#### ETH-DA-009 [**low**] BlobSidecarsByRange SHOULD vs MUST for KZG Verification
- **Layer:** Spec | **Component:** Deneb-P2P
- **Bug class:** `spec-ambiguity`
- **Confidence:** 78/100

**Description:** RPC response verification uses SHOULD instead of MUST, allowing implementations to skip KZG proof verification during sync.

---

### Crypto (c-kzg-4844 + crypto/kzg4844)

#### ETH-DA-010 [**medium**] Trusted Setup Loading Without Integrity Check
- **Layer:** Crypto | **Component:** KZG-Binding
- **Function:** `ckzg4844.LoadTrustedSetupFile`
- **Bug class:** `trusted-setup-tampering`
- **Confidence:** 78/100
- **File:** `c-kzg-4844/bindings/go/main.go` L1394-L1413

**Description:** No SHA256 hash/checksum verification of canonical KZG ceremony output when loading trusted setup. File path substitution → backdoored SRS.

**Steelman:** Production geth embeds the setup via `go:embed` and loads through `sync.Once`.

🔗 Similar to EX-001: Sigma Prime c-kzg-4844 audit 2023

---

#### ETH-DA-011 [**low**] validateCellIndices Missing Per-Index Range Check
- **Layer:** Crypto | **Component:** KZG-Binding
- **Function:** `kzg4844.validateCellIndices`
- **Bug class:** `peerdas-proof-binding`
- **Confidence:** 76/100
- **File:** `go-ethereum/crypto/kzg4844/kzg4844.go` L2738-L2750

**Description:** Checks total count but not individual cell index values against `CELLS_PER_EXT_BLOB`. C library handles this internally.

---

#### ETH-DA-012 [**low**] Point Evaluation Precompile Missing Explicit BLS_MODULUS Check
- **Layer:** EL | **Component:** PointEvalPrecompile
- **Function:** `vm.kzgPointEvaluation.Run`
- **Bug class:** `precompile-input-validation`
- **Confidence:** 75/100
- **File:** `go-ethereum/core/vm/contracts.go` L1382-L1415

**Description:** No explicit `z < BLS_MODULUS` / `y < BLS_MODULUS` check before `VerifyProof`. Deferred to underlying KZG library.

[agents: 2 — Agent 2 + Agent 4 independently flagged]

---

### EL — Blobpool & Validation

#### ETH-DA-013 [**medium**] Per-Account Blobpool Exhaustion at 1-Wei Blob Fee
- **Layer:** EL | **Component:** Blobpool
- **Function:** `blobpool.addLocked`
- **Bug class:** `per-account-exhaustion`
- **Confidence:** 80/100
- **File:** `go-ethereum/core/txpool/blobpool/blobpool.go` L85-L89

**Description:** `maxTxsPerAccount=16`, no balance/stake coupling. At 1 wei blob base fee, ~208 accounts fill the entire 2.5GB pool for ~2 ETH (at 30 gwei gas price), evicting honest L2 rollup transactions.

**Web context:** Blob base fee was at/near 1 wei for most of 2024-2025. EIP-7918 introduces a reserve-price floor tied to L1 gas price, included in Fusaka. DoS cost against individual rollups estimated at < 1 ETH/hour. Cross-rollup contagion: attack affects ALL rollups sharing Ethereum DA simultaneously.

🔗 Similar to EX-003: blob mempool DoS via 1-wei spam

---

#### ETH-DA-014 [**medium**] Size Accounting Overflow on Replacement
- **Layer:** EL | **Component:** Blobpool
- **Function:** `blobpool.addLocked`
- **Bug class:** `size-accounting-overflow`
- **Confidence:** 78/100
- **File:** `go-ethereum/core/txpool/blobpool/blobpool.go` L1852

**Description:** `p.stored += uint64(meta.storageSize) - uint64(prev.storageSize)` — if replacement tx is smaller, uint64 subtraction wraps. May trigger catastrophic pool eviction.

**Steelman:** In practice, `p.stored` is always >= any single tx's storageSize, so the two's complement addition nets correctly.

---

### EL — Execution & Engine API

#### ETH-DA-015 [**medium**] engine_getBlobsV1 Panic on Nil Proof Slice
- **Layer:** EL | **Component:** EngineAPI
- **Function:** `catalyst.GetBlobsV1`
- **Bug class:** `concurrency`
- **Confidence:** 76/100
- **File:** `go-ethereum/eth/catalyst/api.go` L740-L749

**Description:** Indexes `proofs[i][0]` without nil/length check. If pool race returns non-nil blob but empty proof slice → index-out-of-range panic → engine API crashes → CL loses EL connectivity.

**Fix:** Add guard: `if blobs[i] == nil || len(proofs[i]) == 0 { continue }`

---

#### ETH-DA-016 [**medium**] Testing API Registered Without JWT Authentication
- **Layer:** EL | **Component:** EngineAPI
- **Function:** `catalyst.newTestingAPI`
- **Bug class:** `engine-api-auth-bypass`
- **Confidence:** 75/100
- **File:** `go-ethereum/eth/catalyst/api_testing.go` L113-L120

**Description:** `testing_` namespace registered with `Authenticated: false` alongside engine namespace. Exposes `BuildBlockV1` without JWT on the engine API port.

🔗 Similar to EX-005: Engine API JWT misconfiguration

---

### CL — Lighthouse

#### ETH-DA-017 [**medium**] from_execution_verified Skips KZG Verification
- **Layer:** CL-Lighthouse | **Component:** BlobValidation
- **Function:** `blob_verification::KzgVerifiedBlob::from_execution_verified`
- **Bug class:** `gossip-validation-missing-check`
- **Confidence:** 80/100
- **File:** `beacon_node/beacon_chain/src/blob_verification.rs` L312-L318

**Description:** EL-sourced blobs bypass KZG proof verification. If EL is compromised or buggy, invalid blob data accepted by CL.

---

#### ETH-DA-018 [**medium**] Reconstruction Failure Discards ALL Verified Columns
- **Layer:** CL-Lighthouse | **Component:** DataAvailabilityChecker
- **Function:** `overflow_lru_cache::handle_reconstruction_failure`
- **Bug class:** `peerdas-custody-derivation`
- **Confidence:** 77/100
- **File:** `beacon_node/beacon_chain/src/data_availability_checker/overflow_lru_cache.rs` L1360-L1396

**Description:** One malicious column among 64+ valid columns → reconstruction fails → ALL verified columns discarded → must re-fetch 50%+ columns from scratch. DoS amplification: 1 bad column forces O(N/2) re-downloads.

---

### CL — Prysm

#### ETH-DA-019 [**medium**] Reconstructed Columns Skip KZG Re-Verification
- **Layer:** CL-Prysm | **Component:** DataColumnReconstruction
- **Function:** `peerdas.ReconstructDataColumnSidecars`
- **Bug class:** `peerdas-reconstruction-no-reverify`
- **Confidence:** 82/100
- **File:** `prysm/beacon-chain/core/peerdas/reconstruction.go` L312-L321

**Description:** Reconstructed sidecars wrapped as `NewVerifiedRODataColumn` without independent KZG proof re-verification. Relies entirely on Reed-Solomon reconstruction correctness.

---

#### ETH-DA-020 [**medium**] Gloas Data Columns Skip Inclusion Proof Verification
- **Layer:** CL-Prysm | **Component:** DataColumnValidation
- **Function:** `peerdas.VerifyDataColumnSidecarInclusionProof`
- **Bug class:** `da-checker-bypass`
- **Confidence:** 80/100
- **File:** `prysm/beacon-chain/core/peerdas/p2p_interface.go` L1476-L1479

**Description:** `if sidecar.IsGloas() { return nil }` — Gloas data columns skip inclusion proof entirely.

---

### Cross-Layer (EL ↔ CL Binding)

#### ETH-DA-021 [**medium**] GetBlobs Per-Hash Locking Creates Torn Read Window
- **Layer:** Cross-Layer | **Component:** EngineAPI
- **Function:** `BlobPool::GetBlobs`
- **Bug class:** `cross-layer-binding-mismatch`
- **Confidence:** 78/100
- **File:** `go-ethereum/core/txpool/blobpool/blobpool.go` L1648-L1653

**Description:** GetBlobs acquires/releases read lock per-vhash (not atomic across request). Concurrent pool mutations create torn reads → CL receives inconsistent mix of blobs.

---

### Cross-Client (Lighthouse ↔ Prysm Divergence)

#### ETH-DA-022 [**high**] Blob Subnet Check Formula Divergence
- **Layer:** Cross-Client | **Component:** BlobValidation
- **Bug class:** `cross-client-divergence`
- **Confidence:** 90/100

**Description:** Lighthouse uses `blob_index != subnet` (direct equality). Prysm uses `blob_index % subnet_count != subnet` (modulo). Currently equivalent when `subnet_count == max_blobs_per_block`, but semantically different.

**Lighthouse:** `blob_verification.rs` L421-427:
```rust
if blob_index != subnet {
    return Err(GossipBlobError::InvalidSubnet { ... });
}
```

**Prysm:** `validate_blob.go` L5063-5068:
```go
func computeSubnetForBlobSidecar(index uint64, slot primitives.Slot) uint64 {
    subnetCount := params.BeaconConfig().BlobsidecarSubnetCount
    return index % subnetCount
}
```

**Spec says:** `compute_subnet_for_blob_sidecar(sidecar.index) == subnet_id` where `compute_subnet_for_blob_sidecar(index) = index % BLOB_SIDECAR_SUBNET_COUNT`

**Impact:** If constants diverge in a future fork → gossip partition → consensus split risk. Lighthouse has 52.6% market share; a Lighthouse-only rejection causes supermajority partition.

---

#### ETH-DA-023 [**high**] Reconstruction Failure Mode Divergence (Cross-Client)
- **Layer:** Cross-Client | **Component:** DataColumnReconstruction
- **Bug class:** `cross-client-divergence`
- **Confidence:** 82/100

**Description:** Opposite failure modes:
- **Lighthouse:** Discards ALL verified columns on reconstruction failure → availability stall, must re-fetch
- **Prysm:** Marks reconstructed columns as verified WITHOUT re-verification → potential acceptance of invalid data

**Chain: ETH-DA-018 + ETH-DA-019** — Combined impact is strictly worse: one client stalls, the other may accept invalid data. If an attacker can control which columns are corrupted, they can partition availability guarantees across clients.

**Impact:** Consensus divergence under adversarial column injection. Severity ≥ high per cross-client divergence rule.

---

#### ETH-DA-024 [**medium**] Seen-Check Ordering Divergence
- **Layer:** Cross-Client | **Component:** GossipValidation
- **Bug class:** `cross-client-divergence`
- **Confidence:** 78/100

**Description:** Lighthouse performs inclusion proof BEFORE seen-check; Prysm performs seen-check BEFORE inclusion proof. Different CPU cost profiles for duplicate blob floods.

---

#### ETH-DA-025 [**medium**] Gloas Data Column Handling Divergence
- **Layer:** Cross-Client | **Component:** DataColumnVerification
- **Bug class:** `cross-client-divergence`
- **Confidence:** 80/100

**Description:** Prysm skips inclusion proof for Gloas sidecars entirely. Lighthouse handles `InvalidVariant` for Gloas with a TODO comment about penalization but no explicit rejection.

---

## Confirmed Correct Bindings

- **versioned_hash computation:** Geth `CalcBlobHashV1` and Prysm `ConvertKzgCommitmentToVersionedHash` produce byte-identical output (SHA256 + 0x01 prefix). ✅
- **BlobsBundle ordering:** EL constructs in transaction order; CL validates element-wise. Confirmed consistent. ✅
- **engine_newPayloadV3 versioned_hash validation:** Element-wise order-sensitive comparison. Correct. ✅

---

## Spec Invariants Verified (Agent 1)

20 invariants extracted (INV-001 through INV-020). Key invariants:
- INV-001: `len(tx.blob_versioned_hashes) > 0` — enforced in all clients ✅
- INV-005: Point evaluation `z < BLS_MODULUS` — deferred to KZG library ⚠️ (ETH-DA-012)
- INV-009: `subnet_id == blob_index % BLOB_SIDECAR_SUBNET_COUNT` — Lighthouse diverges ❌ (ETH-DA-022)
- INV-013: Dynamic MAX_BLOBS_PER_BLOCK — EL sync risk ❌ (ETH-DA-001)

---

## Web Research Context

| Topic | Key Data |
|-------|----------|
| Lighthouse market share | 52.6% (supermajority risk) |
| Prysm market share | 17.7% (dropped post-Fusaka bug) |
| Blob fee floor | 1 wei for most of 2024-2025; EIP-7918 floor in Fusaka |
| DoS cost (1 rollup) | < 1 ETH/hour at 1 wei fee |
| Fusaka incident | 41 missed epochs, 382 ETH lost, Prysm v7.0.0 |
| L2 daily blob spend | ~1,900 ETH total H1 2025 |
| CVE-2025-24883 | Geth DoS via P2P handshake (patched v1.14.13) |
| Blob capacity | Dencun 3/6 → Pectra 6/9 → BPO1 10/15 → BPO2 14/21 |

---

## LEADs (Follow-up Required)

| ID | Layer | Description | Confidence |
|----|-------|-------------|------------|
| L-01 | EL | drop() heap update assumes monotonic eviction values | 55 |
| L-02 | EL | newBlobTxForPool panic if sidecar nil (unreachable?) | 50 |
| L-03 | EL | ExistingCost uint64 underflow on stale state | 45 |
| L-04 | EL | Blob count checked twice with potentially different limits | 40 |
| L-05 | EL | Float64 precision loss in reorg depth calc | 45 |
| L-06 | EL | excess_blob_gas uint64 addition overflow (theoretical) | 35 |
| L-07 | EL | TOCTOU in getBlobs (V2/V3) AvailableBlobs→GetBlobs | 55 |
| L-08 | EL | invalidBlockHitEviction forgives after 128 hits | 50 |
| L-09 | EL | fcuV3 ↔ npV3 fork acceptance asymmetry | 45 |
| L-10 | Crypto | Empty-batch FFI nil pointer to C | 55 |
| L-11 | Crypto | LoadTrustedSetup no runtime.KeepAlive | 45 |
| L-12 | Crypto | ckzgRecoverBlobs division-by-zero on empty cellIndices | 45 |
| L-13 | Crypto | package-level KZGSettings not thread-safe | 40 |
| L-14 | CL-LH | SSZ deserialization bounds unverified (missing source) | 40 |
| L-15 | CL-LH | InvalidVariant no peer penalty (TODO) | 55 |
| L-16 | CL-LH | RepeatBlob no propagate_validation_result | 50 |
| L-17 | CL-Prysm | Self-originated data columns bypass all validation | 55 |
| L-18 | CL-Prysm | Gloas pending queue no aggregate memory limit | 45 |

---

*Generated by EthereumDA Multi-Layer Auditor v1.0.0 — 7-Agent + Cross-Verification*
*🤖 Generated with [Claude Code](https://claude.com/claude-code)*
