# 1-Depth Vulnerability Analysis

## Definition

**1-depth vulnerabilities** are findings that can be **directly triggered by a single external actor** in **one step** without requiring:
- Prior compromise of another system
- Chaining with another vulnerability
- Waiting for a specific rare condition (like a hardfork boundary)
- Insider/admin access

These are the most immediately dangerous findings because they have the **shortest path from attacker action to impact**.

---

## 1-Depth Findings (7 of 21)

### Immediate External Trigger — No Preconditions

| ID | Severity | Finding | Trigger | Impact |
|----|----------|---------|---------|--------|
| **ETH-DA-013** | medium | Blobpool per-account exhaustion at 1-wei | Any user sends blob txs from ~208 accounts at 1 wei blob fee | Full pool DoS, honest L2 txs evicted (~2 ETH cost) |
| **ETH-DA-015** | medium | engine_getBlobsV1 panic on nil proof | CL calls getBlobsV1 during concurrent pool eviction | Engine API crash, CL loses EL |
| **ETH-DA-018** | medium | Reconstruction failure discards ALL columns (LH) | Attacker sends 1 malicious column among 64+ valid | DoS amplification: re-download O(N/2) columns |
| **ETH-DA-007** | medium | Node ID grinding for custody groups | Any node operator brute-forces key generation | Reduced DA contribution, custody asymmetry |
| **ETH-DA-016** | medium | Testing API without JWT auth | Anyone with network access to engine port 8551 | Unauthenticated block construction |
| **ETH-DA-014** | medium | Size accounting overflow on tx replacement | Attacker replaces 6-blob tx with 1-blob tx | p.stored wraps → catastrophic pool eviction |
| **ETH-DA-008** | low | Blob sidecar equivocation silently IGNOREd | Malicious proposer sends 2 different sidecars | Equivocation undetected, no slashing |

---

## 2-Depth (Conditional / Chain Required) — 14 of 21

These require **specific preconditions** such as hardfork boundaries, constant changes, EL compromise, or chaining with another finding.

| ID | Severity | Condition Required |
|----|----------|--------------------|
| ETH-DA-001 | high | BLOB_SCHEDULE fork boundary (epoch 412672/419072) |
| ETH-DA-002 | high | Fulu fork activation + implementation using wrong constant |
| ETH-DA-003 | high | BLOB_SCHEDULE fork boundary + non-upgraded client |
| ETH-DA-022 | high | Future fork where BLOB_SIDECAR_SUBNET_COUNT ≠ MAX_BLOBS_PER_BLOCK |
| ETH-DA-023 | high | Adversarial column injection + reconstruction trigger |
| ETH-DA-004 | medium | Specific excess_blob_gas values at rounding boundary |
| ETH-DA-005 | medium | Caller erroneously passes empty subset |
| ETH-DA-006 | medium | EIP-7594 fork activation + Deneb node receiving Fulu wrapper |
| ETH-DA-010 | medium | Operator uses custom trusted_setup path or file substituted |
| ETH-DA-017 | medium | EL compromised or buggy → invalid blobs through engine API |
| ETH-DA-019 | medium | Input column with subtle encoding error bypasses individual KZG |
| ETH-DA-020 | medium | Gloas fork active + malicious data column sidecar |
| ETH-DA-021 | medium | Concurrent pool mutation during GetBlobs request |
| ETH-DA-024/025 | medium | Cross-client gossip validation differences |

---

## Risk Matrix: 1-Depth Findings

```
                    ┌─────────────────────────────────────────────┐
  Impact            │                                             │
                    │                                             │
  Chain split       │                                             │
  / Fund loss       │                                             │
                    │                                             │
  Network DoS       │         ETH-DA-013 ●                        │
                    │         ETH-DA-014 ●   ETH-DA-015 ●         │
                    │         ETH-DA-018 ●                        │
  Single node       │                       ETH-DA-016 ●          │
                    │         ETH-DA-007 ●                        │
  Cosmetic          │                       ETH-DA-008 ●          │
                    │                                             │
                    └─────────────────────────────────────────────┘
                    Free      < 2 ETH      Network      Admin
                              Cost to trigger
```

## Recommendation Priority

1. **ETH-DA-013** (Blobpool 1-wei DoS) — Highest 1-depth risk. EIP-7918 partially mitigates but not yet universally deployed. Immediate.
2. **ETH-DA-015** (getBlobsV1 panic) — Simple nil check fix. One-line patch. Immediate.
3. **ETH-DA-016** (Testing API auth) — Gate behind build flag. Immediate.
4. **ETH-DA-018** (Reconstruction DoS amplification) — Design-level fix needed. Medium-term.
5. **ETH-DA-014** (Size accounting) — Verify two's complement correctness or add signed comparison. Medium-term.
6. **ETH-DA-007** (Node ID grinding) — Protocol-level; longer-term.
7. **ETH-DA-008** (Equivocation IGNORE) — Spec-level; longer-term.
