# [high] KZG Inclusion Proof Depth Constant Change Deneb→Fulu

**Finding ID:** ETH-DA-002
**Layer:** Spec
**Component:** Fulu-Deneb-Drift
**Function:** `verify_blob_sidecar_inclusion_proof` / `verify_data_column_sidecar_inclusion_proof`
**Bug class:** `cross-fork-drift`
**Confidence:** 88/100
**Severity:** **high**

## Description

Deneb uses `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17` to prove individual commitments within the block body Merkle tree. Fulu changes this to `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4` (note: plural "commitmentS"), proving the entire commitments list instead. Both the constant name and value change simultaneously. A client that uses the wrong constant at the fork boundary will fail ALL sidecar inclusion proof verifications.

## Affected code

**Spec:**
- File: `consensus-specs/specs/fulu/p2p-interface.md`
- Lines: `L3862-L3864`

```python
# Deneb
KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17  # per-blob commitment Merkle proof

# Fulu
KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4  # whole-list Merkle proof
```

## Attack path

1. Fulu fork activates
2. Client implementation uses Deneb constant (depth 17) for Fulu DataColumnSidecar verification
3. Merkle proof verification expects 17-level tree but receives 4-level proof
4. ALL inclusion proof verifications fail
5. ALL sidecars rejected → complete DA unavailability
6. L2 rollups cannot access blob data for fraud proofs

## Proof

Deneb: `floorlog2(gindex) + 1 + ceillog2(MAX_BLOB_COMMITMENTS_PER_BLOCK)` = 17 for individual commitment proof.
Fulu: `floorlog2(get_generalized_index(BeaconBlockBody, 'blob_kzg_commitments'))` = 4 for whole-list proof.

The proof target changes from `commitment[i]` (individual) to `hash_tree_root(kzg_commitments)` (list root).

## Impact

- Affected actors: all validators and full nodes running the affected client
- Worst-case scenario: complete DA failure for all blocks with blobs
- L2 rollups lose data availability guarantees

## Steelman refutation

The type system separates `BlobSidecar` (Deneb) and `DataColumnSidecar` (Fulu), so well-structured code naturally uses the correct constant. **Rebuttal:** Not all implementations have strong type boundaries; a shared utility function could use the wrong constant.

## Recommended fix

Implementations MUST use fork-aware constant selection: `KZG_COMMITMENT_INCLUSION_PROOF_DEPTH = 17` for Deneb BlobSidecars, `KZG_COMMITMENTS_INCLUSION_PROOF_DEPTH = 4` for Fulu DataColumnSidecars. Add explicit assertions at the fork boundary.

## Cross-references

- Similar exploit DB entry: none
- Spec clause: `consensus-specs/specs/fulu/p2p-interface.md` L3862-L3864

🤖 Generated with [Claude Code](https://claude.com/claude-code)
