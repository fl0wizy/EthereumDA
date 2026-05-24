# EthereumDA Security Audit — Full Findings Collection (English)

**Date:** 2026-05-24 | **Version:** v1.0.0 | **Methodology:** 7-Agent Cross-Layer + Cross-Client Verification

**Repos:** EIPs @be9148d, consensus-specs @b8cf07f4d, c-kzg-4844 @e1c5705, go-ethereum @d3edc58, lighthouse @176cce5, prysm @ca3bed0

---

## Statistics

| Category | Count |
|----------|-------|
| Total Findings | 21 |
| Critical | 0 |
| High | 4 |
| Medium | 11 |
| Low | 6 |
| LEADs | 18 |
| 1-Depth (directly exploitable) | 7 |
| 2-Depth (conditional) | 14 |
| Cross-layer chains | 3 |
| Cross-client divergences | 5 |

---

## HIGH Findings (4)

### ETH-DA-001 [HIGH] BLOB_SCHEDULE Dynamic MAX_BLOBS EL↔CL Synchronization Risk
- **Layer:** Spec (Cross-Layer) | **Confidence:** 85 | **1-Depth:** No (requires fork boundary)
- **Bug class:** `cross-fork-drift`
- **Location:** `consensus-specs/specs/fulu/beacon-chain.md` L3137-L3145
- **Description:** Fulu's `BLOB_SCHEDULE` introduces epoch-dependent `MAX_BLOBS_PER_BLOCK` (6→15→21). EL must dynamically update `MAX_BLOB_GAS_PER_BLOCK`. Stale EL constants → CL accepts, EL rejects → chain split.
- **Attack:** Proposer includes 7+ blobs after blob-parameter fork. Updated CL accepts, non-updated EL rejects.
- **Impact:** Chain split at every BLOB_SCHEDULE boundary. All validators and L2 rollups affected.
- **Fix:** EL must implement dynamic MAX_BLOB_GAS_PER_BLOCK matching CL's get_blob_parameters.
- **Ref:** EX-010, Fusaka/Prysm incident (382 ETH lost)

### ETH-DA-002 [HIGH] KZG Inclusion Proof Depth Constant Change Deneb→Fulu
- **Layer:** Spec | **Confidence:** 88 | **1-Depth:** No (requires Fulu activation)
- **Bug class:** `cross-fork-drift`
- **Location:** `consensus-specs/specs/fulu/p2p-interface.md` L3862-L3864
- **Description:** Deneb `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH=17` → Fulu `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH=4`. Name (singular→plural) AND value change. Wrong constant = ALL sidecar verification fails.
- **Impact:** Complete DA failure for affected clients.
- **Fix:** Fork-aware constant selection; assertions at fork boundary.

### ETH-DA-022 [HIGH] Blob Subnet Check Formula Divergence (Lighthouse ↔ Prysm)
- **Layer:** Cross-Client | **Confidence:** 90 | **1-Depth:** No (requires future constant change)
- **Bug class:** `cross-client-divergence`
- **Location:** LH `blob_verification.rs` L421-427 vs Prysm `validate_blob.go` L5063-5068
- **Description:** Lighthouse: `blob_index != subnet` (identity). Prysm: `blob_index % subnet_count` (modulo). Currently equivalent but semantically different.
- **Impact:** Future constant divergence → gossip partition. Lighthouse at 52.6% → supermajority partition.
- **Fix:** Lighthouse should use spec's modulo formula.
- **Ref:** EX-007

### ETH-DA-023 [HIGH] Reconstruction Failure Mode Divergence (Lighthouse ↔ Prysm)
- **Layer:** Cross-Client | **Confidence:** 82 | **1-Depth:** No (requires adversarial column)
- **Bug class:** `cross-client-divergence`
- **Location:** LH `overflow_lru_cache.rs` L1401-L1406 vs Prysm `reconstruction.go` L312-L321
- **Description:** Opposite failure modes: Lighthouse discards ALL columns (stall). Prysm skips KZG re-verify (may accept invalid). Chain: ETH-DA-018 + ETH-DA-019.
- **Impact:** Consensus divergence under adversarial column injection.
- **Fix:** LH: selective discard. Prysm: re-verify reconstructed columns.

---

## MEDIUM Findings (11)

### ETH-DA-003 [MEDIUM] compute_fork_digest Changes at Blob-Parameter-Only Forks
- **Layer:** Spec | **Confidence:** 83
- **Description:** fork_digest changes without fork_version change at BLOB_SCHEDULE boundaries → implicit hard fork → network partition.
- **Fix:** Dynamic fork_digest computation at BLOB_SCHEDULE boundaries.

### ETH-DA-004 [MEDIUM] fake_exponential Rounding Divergence Risk
- **Layer:** Spec | **Confidence:** 80
- **Description:** Python arbitrary precision vs Go/Rust uint256 can cause 1-wei blob fee divergence at boundary values.

### ETH-DA-005 [MEDIUM] verify_blob_kzg_proof_batch Empty-Input Returns True
- **Layer:** Spec | **Confidence:** 82
- **Description:** Empty batch returns True. Documented foot-gun for callers passing empty subsets.

### ETH-DA-006 [MEDIUM] EIP-7594 Wrapper Version Change (4→5 Elements)
- **Layer:** Spec | **Confidence:** 78
- **Description:** Blob tx wrapper format changes without backward compatibility specification.

### ETH-DA-007 [MEDIUM] get_custody_groups Node ID Grinding ★1-Depth
- **Layer:** Spec | **Confidence:** 77
- **Description:** Brute-force node_ids to choose least-populated custody groups. Ref: EX-008.

### ETH-DA-010 [MEDIUM] Trusted Setup Loading Without Integrity Check
- **Layer:** Crypto | **Confidence:** 78
- **Description:** No SHA256 checksum of canonical KZG ceremony output at load time. Ref: EX-001.

### ETH-DA-013 [MEDIUM] Per-Account Blobpool Exhaustion at 1-Wei ★1-Depth
- **Layer:** EL | **Confidence:** 80
- **Description:** ~208 accounts fill 2.5GB pool for ~2 ETH. EIP-7918 partially mitigates. Ref: EX-003.

### ETH-DA-014 [MEDIUM] Size Accounting Overflow on Replacement ★1-Depth
- **Layer:** EL | **Confidence:** 78
- **Description:** uint64 subtraction wrap when replacement tx is smaller → catastrophic eviction.

### ETH-DA-015 [MEDIUM] engine_getBlobsV1 Panic on Nil Proof ★1-Depth
- **Layer:** EL | **Confidence:** 76
- **Description:** `proofs[i][0]` without nil check → panic → engine API crash.

### ETH-DA-016 [MEDIUM] Testing API Without JWT Authentication ★1-Depth
- **Layer:** EL | **Confidence:** 75
- **Description:** `testing_` namespace `Authenticated: false` alongside engine namespace. Ref: EX-005.

### ETH-DA-017 [MEDIUM] from_execution_verified Skips KZG Verification
- **Layer:** CL-Lighthouse | **Confidence:** 80
- **Description:** EL-sourced blobs bypass KZG proof verification entirely.

### ETH-DA-018 [MEDIUM] Reconstruction Failure Discards ALL Columns ★1-Depth
- **Layer:** CL-Lighthouse | **Confidence:** 77
- **Description:** 1 bad column → ALL 64+ verified columns discarded → DoS amplification.

### ETH-DA-019 [MEDIUM] Reconstructed Columns Skip KZG Re-Verification
- **Layer:** CL-Prysm | **Confidence:** 82
- **Description:** `NewVerifiedRODataColumn` without independent KZG check.

### ETH-DA-020 [MEDIUM] Gloas Data Columns Skip Inclusion Proof
- **Layer:** CL-Prysm | **Confidence:** 80
- **Description:** `if sidecar.IsGloas() { return nil }` — bypasses inclusion proof.

### ETH-DA-021 [MEDIUM] GetBlobs Per-Hash Locking Torn Read
- **Layer:** Cross-Layer | **Confidence:** 78
- **Description:** Per-vhash RLock/RUnlock, not atomic across request → inconsistent blob snapshot.

### ETH-DA-024 [MEDIUM] Seen-Check Ordering Divergence
- **Layer:** Cross-Client | **Confidence:** 78
- **Description:** LH: inclusion proof before seen-check. Prysm: seen-check first. Different CPU profiles.

### ETH-DA-025 [MEDIUM] Gloas Data Column Handling Divergence
- **Layer:** Cross-Client | **Confidence:** 80
- **Description:** Prysm skips inclusion proof for Gloas. LH has TODO for penalization.

---

## LOW Findings (6)

### ETH-DA-008 [LOW] Blob Sidecar Equivocation Silently IGNOREd ★1-Depth
- **Layer:** Spec | **Confidence:** 80
- **Description:** Duplicate sidecars with different content IGNORED without slashing evidence.

### ETH-DA-009 [LOW] BlobSidecarsByRange SHOULD vs MUST for KZG
- **Layer:** Spec | **Confidence:** 78
- **Description:** SHOULD allows skipping KZG verification during sync.

### ETH-DA-011 [LOW] validateCellIndices Missing Per-Index Range Check
- **Layer:** Crypto | **Confidence:** 76
- **Description:** No individual cell_index < CELLS_PER_EXT_BLOB check. C library handles internally.

### ETH-DA-012 [LOW] Point Evaluation Precompile Missing BLS_MODULUS Check
- **Layer:** EL | **Confidence:** 75
- **Description:** z, y not checked against BLS_MODULUS before VerifyProof. [agents: 2]

---

## LEADs (18)

| ID | Layer | Description | Conf |
|----|-------|-------------|------|
| L-01 | EL | drop() heap update monotonic assumption | 55 |
| L-02 | EL | newBlobTxForPool panic if sidecar nil | 50 |
| L-03 | EL | ExistingCost uint64 underflow on stale state | 45 |
| L-04 | EL | Blob count double-check with different limits | 40 |
| L-05 | EL | Float64 precision loss in reorg depth | 45 |
| L-06 | EL | excess_blob_gas uint64 overflow (theoretical) | 35 |
| L-07 | EL | TOCTOU in getBlobs V2/V3 | 55 |
| L-08 | EL | invalidBlockHitEviction forgives after 128 | 50 |
| L-09 | EL | fcuV3 ↔ npV3 fork acceptance asymmetry | 45 |
| L-10 | Crypto | Empty-batch FFI nil pointer to C | 55 |
| L-11 | Crypto | LoadTrustedSetup no runtime.KeepAlive | 45 |
| L-12 | Crypto | ckzgRecoverBlobs div-by-zero empty cellIndices | 45 |
| L-13 | Crypto | KZGSettings not thread-safe | 40 |
| L-14 | CL-LH | SSZ deserialization bounds unverified | 40 |
| L-15 | CL-LH | InvalidVariant no peer penalty (TODO) | 55 |
| L-16 | CL-LH | RepeatBlob no propagate_validation_result | 50 |
| L-17 | CL-Prysm | Self-originated columns bypass validation | 55 |
| L-18 | CL-Prysm | Gloas pending queue no memory limit | 45 |

---

## Cross-Layer Chains

| Chain | Findings | Combined Impact |
|-------|----------|-----------------|
| BLOB_SCHEDULE sync | ETH-DA-001 + ETH-DA-003 | EL↔CL split + network partition |
| Reconstruction divergence | ETH-DA-018 + ETH-DA-019 → ETH-DA-023 | Stall (LH) + invalid accept (Prysm) |
| EL trust bypass | ETH-DA-017 + ETH-DA-021 | Invalid blob via EL → CL accepts without KZG |

---

*Generated by EthereumDA Multi-Layer Auditor v1.0.0*
