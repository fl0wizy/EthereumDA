# EigenDA Security Review — Fund Theft / Fund Freeze / DoS Impact Report

**Date**: 2026-05-12
**Target**: `Layr-Labs/eigenda` (Go 158,812 nSLOC / Solidity 6,103 nSLOC)
**Method**: 8-Agent Parallel Audit + Cross-Domain Verification (5-Gate Validation)
**Known Issues**: 47 items (Sigma Prime x2, ChainLight)

---

## Impact Classification

본 보고서는 전체 감사 결과(19 FINDINGs + 21 LEADs)에서 아래 3가지 실질적 위협에 해당하는 항목만 추출하였다:

| Impact Category | Description |
|---|---|
| **Fund Theft** | 공격자가 프로토콜/사용자 자금을 탈취할 수 있는 경로 |
| **Fund Freeze** | 자금이 컨트랙트에 영구적으로 잠기거나 출금 불가능한 상태 |
| **DoS** | 서비스 거부 — DA 서비스 중단, batch confirmation 차단, 노드 crash |

---

## Depth Classification

본 감사의 findings를 공격자 관점에서 **depth(깊이)**로 분류한다:

| Depth | Definition | 의미 |
|---|---|---|
| **1-depth** | 외부 공격자가 **precondition 없이** 직접 트리거 가능. 인증/권한 불필요 | 즉시 자금 탈취/동결/서비스 중단 가능 |
| **2-depth** | precondition 1개 필요 (예: admin key 탈취, 특정 operator 자격, governance 실수) | 조건부 위협 |
| **3-depth** | precondition 2개 이상 필요 (예: admin key + 특정 시점 + race condition 동시 충족) | 이론적 위협 |

### Precondition 세팅 비용 분석

Depth 분류의 핵심은 **precondition을 공격자가 직접 세팅할 수 있는가**이다:

| Precondition | 공격자 세팅 가능? | 비용 | 결론 |
|---|---|---|---|
| **Operator 등록 (Quorum 1)** | **YES — permissionless** | **1 EIGEN ≈ $2-3** | 사실상 무료. 이 precondition이 필요한 finding은 **depth 1.5** |
| **Operator 등록 (Quorum 0)** | YES — permissionless | 32 ETH ≈ $80-100K | 자본 필요하나 가능 |
| Relay 등록 | NO — owner multisig | N/A | depth 2 이상 유지 |
| Disperser 등록 | NO — owner multisig | N/A | depth 2 이상 유지 |
| Owner key 탈취 | NO — governance | N/A | depth 2 이상 유지 |
| 유효한 blob key | **YES — on-chain 공개** | 0 | L1 이벤트에서 추출 가능 |
| 노드 endpoint | **YES — 공개 정보** | 0 | operator set에서 조회 가능 |

### Depth 분포 (재평가)

```
★ 1-depth (직접 공격):    3건 신규  (F-13, F-14, F-15 — 인증 없는 endpoint DoS)
  1.5-depth (precondition  2건      (F-07 재평가, F-10 재평가 — operator $2-3이면 세팅)
             $2-3로 세팅):
  2-depth (조건부):        7건      (F-01~F-04: owner 전제, F-05~F-06, F-08~F-09)
  3-depth (복합 조건):     2건      (F-11, F-12)
```

> **결론**: 자금 탈취 1-depth는 여전히 0건이나, **DoS 1-depth가 3건 신규 발견**되었다. 또한 operator 등록 비용이 $2-3에 불과하여 "malicious operator" precondition이 필요한 finding들은 사실상 1.5-depth로 재분류된다.

---

## Executive Summary

| ID | Title | Impact | Severity | Depth | Precondition | Confidence | Agents |
|---|---|---|---|---|---|---|---|
| F-01 | `_setBatchConfirmer` toggle → batch confirmation 영구 중단 | **DoS** (네트워크 전체) | HIGH | 2 | owner key 또는 governance 실수 | 88 | 4 |
| F-02 | `_findPrecedingRegisteredABN` → DA cert 검증 실패 | **DoS** (L1 finality) | HIGH | 2 | ABN 0 미등록 + verifier 업그레이드 | 88 | 2 |
| F-03 | `PaymentVault.withdrawERC20` silent failure | **Fund Freeze** | MEDIUM | 2 | owner 인출 시도 + non-standard ERC20 | 82 | 2 |
| F-04 | On-demand depositor 출금 불가 | **Fund Freeze** (by design) | MEDIUM | 2 | owner 비응답 | 78 | 2 |
| F-05 | Relay `GetBlob` global rate limiter DoS | **DoS** (Relay) | **MEDIUM→HIGH** | **1** | **없음 — 무인증, blob key는 on-chain 공개** | 82→**88** | 2 |
| F-06 | Node `GetChunks` 무인증 + rate limit 0 → 노드 DoS | **DoS** (Node) | **MEDIUM→HIGH** | **1** | **없음 — 무인증, rate limit 완전 부재** | 82→**90** | 1 |
| F-07 | `ChunkRateLimiter` map 무한 증가 → OOM crash | **DoS** (Relay) | MEDIUM | **1.5** | operator 등록 $2-3 (permissionless) | 80 | 1 |
| F-08 | `KeyLock.keyMutexMap` 무한 증가 → OOM crash | **DoS** (Client) | MEDIUM | 2 | 장기 운영 + 다량의 unique blob key | 78 | 1 |
| F-09 | `DeserializeSplitFrameProofs` nil proof → panic crash | **DoS** (Node/Relay) | MEDIUM | 2 | 악의적 relay 또는 operator 필요 | 85 | 1 |
| F-10 | `_tryEjectOperator` silent fail → 악의적 operator 잔류 | **DoS** (Quorum 무결성) | MEDIUM | **1.5** | **operator $2-3 + front-run timing** | 80 | 2 |
| F-11 | Reservation cache eviction → 무료 처리량 도용 | **Fund Theft** (간접) | MEDIUM | 3 | 1024+ reservation accounts (각 governance 승인) | 78 | 1 |
| F-12 | Payment commit 후 rate limit 확인 → 자금 소모 without 서비스 | **Fund Theft** (소액) | LOW | 3 | legacy path 사용 + global bin 포화 + concurrent race | 75 | 1 |
| **F-13** | **`GetBlobCommitment` 무인증 CPU 고갈 → Disperser DoS** | **DoS** (Disperser) | **HIGH** | **1** | **없음 — 인증/rate limit 전무** | **90** | **신규** |
| **F-14** | **`DisperseBlob` 300 MiB pre-auth deserialization → Disperser OOM** | **DoS** (Disperser) | **HIGH** | **1** | **없음 — gRPC deserialization은 인증 전** | **88** | **신규** |
| **F-15** | **`DefaultBlobCodec.DecodeBlob` 4 GB allocation → Client OOM** | **DoS** (Client/Rollup) | **HIGH** | **1.5** | **malicious relay 또는 MITM (relay는 permissioned)** | **85** | **신규** |

---

## Detailed Findings

---

### F-01 [HIGH] `_setBatchConfirmer` Toggle Pattern — 네트워크 전체 DoS

**Impact**: DoS (네트워크 전체 batch confirmation 중단)
**Confidence**: 88 | **Agents**: Agent 3, 6, 7, 8 (4개 독립 발견)
**Location**: `contracts/src/core/EigenDAServiceManager.sol:L1364-L1367`

#### Root Cause

```solidity
function _setBatchConfirmer(address _batchConfirmer) internal {
    isBatchConfirmer[_batchConfirmer] = !isBatchConfirmer[_batchConfirmer]; // TOGGLE!
    emit BatchConfirmerStatusChanged(_batchConfirmer, isBatchConfirmer[_batchConfirmer]);
}
```

Toggle 패턴으로 인해:
- `initialize([addrA, addrA])` → 두 번째 호출이 confirmer를 **OFF**
- Owner가 기존 confirmer를 "재확인"하려고 `setBatchConfirmer(existingAddr)` 호출 → **OFF**

#### Attack Scenario

```
1. [Governance 실수] initialize 배열에 중복 주소 포함
   → isBatchConfirmer[addr] = false

2. [Off-chain] Disperser batcher가 confirmBatch() 호출 시도
   → onlyBatchConfirmer modifier에서 revert
   → "Why does this keep failing?" — 원인 파악 어려움

3. [Impact] 모든 V1 batch confirmation 중단
   → EigenDA DA certificate 발급 불가
   → L2 rollup이 DA 증명 없이 진행 불가
   → 네트워크 전체 liveness 위협
```

#### Cross-Domain Impact

Off-chain batcher는 on-chain confirmer 상태 변경을 감지하는 메커니즘이 없어, 지속적으로 실패하는 tx를 재시도하며 gas를 소모한다.

#### Mitigation

```diff
- function _setBatchConfirmer(address _batchConfirmer) internal {
-     isBatchConfirmer[_batchConfirmer] = !isBatchConfirmer[_batchConfirmer];
- }
+ function _grantBatchConfirmer(address _batchConfirmer) internal {
+     require(!isBatchConfirmer[_batchConfirmer], "Already confirmer");
+     isBatchConfirmer[_batchConfirmer] = true;
+     emit BatchConfirmerGranted(_batchConfirmer);
+ }
+ function _revokeBatchConfirmer(address _batchConfirmer) internal {
+     require(isBatchConfirmer[_batchConfirmer], "Not confirmer");
+     isBatchConfirmer[_batchConfirmer] = false;
+     emit BatchConfirmerRevoked(_batchConfirmer);
+ }
```

#### Steelman Refutation

Owner-only 함수이므로 외부 공격자가 직접 트리거할 수 없다. Governance 다중서명이 이를 방지할 수 있다. 그러나 toggle 패턴 자체가 "의도치 않은 제거"의 원천이며, 4개 에이전트가 독립적으로 발견한 점은 설계 명확성 부족을 시사한다.

---

### F-02 [HIGH] `CertVerifierRouter._findPrecedingRegisteredABN` — DA Cert 검증 실패

**Impact**: DoS (L1 finality 영향 — DA certificate 검증 경로 파괴)
**Confidence**: 88 | **Agents**: Agent 6, 7 (2개 교차 검증)
**Location**: `contracts/src/integrations/cert/router/EigenDACertVerifierRouter.sol:L4417-L4433`

#### Root Cause

```solidity
function _findPrecedingRegisteredABN(uint32 referenceBlockNumber)
    internal view returns (uint32 activationBlockNumber)
{
    for (uint256 i; i < certVerifierABNs.length; i++) {
        activationBlockNumber = certVerifierABNs[abnMaxIndex - i];
        if (activationBlockNumber <= referenceBlockNumber) {
            return activationBlockNumber;
        }
    }
    // BUG: 루프 종료 시 revert 없음
    // activationBlockNumber는 마지막으로 할당된 값 (certVerifierABNs[0]) 그대로 반환
    // 이 값은 referenceBlockNumber보다 큰 값 — 잘못된 verifier로 라우팅
}
```

#### Attack Scenario

```
1. [Setup] 시스템 배포 후 첫 ABN = block 1000으로 설정
   (ABN 0이 등록되지 않은 경우)

2. [Trigger] RBN=500인 DA cert 검증 요청 도착
   → 루프가 certVerifierABNs[0]=1000을 확인
   → 1000 <= 500? No → 루프 종료
   → activationBlockNumber = 1000 반환 (잘못된 값)

3. [Impact] certVerifiers[1000]으로 라우팅
   → 해당 verifier의 security threshold가 다를 수 있음
   → 유효한 cert가 거부되거나, 무효한 cert가 승인
   → L2 rollup의 DA 증명 검증 실패 → settlement 차단
```

#### Mitigation

```diff
  for (uint256 i; i < certVerifierABNs.length; i++) {
      activationBlockNumber = certVerifierABNs[abnMaxIndex - i];
      if (activationBlockNumber <= referenceBlockNumber) {
          return activationBlockNumber;
      }
  }
+ revert("No preceding ABN found for referenceBlockNumber");
```

#### Steelman Refutation

초기화 시 ABN 0을 등록하면 모든 RBN에 대해 올바르게 동작한다. 그러나 `addCertVerifier`로 사후 추가 시 이 보호가 없으며, verifier 업그레이드 과도기에 발생 가능성이 높아진다.

---

### F-03 [MEDIUM] `PaymentVault.withdrawERC20` Silent Transfer Failure — Fund Freeze

**Impact**: Fund Freeze (ERC20 토큰 출금 실패 시 vault에 영구 잠김)
**Confidence**: 82 | **Agents**: Agent 6, 7
**Location**: `contracts/src/core/PaymentVault.sol:L571-L575`

#### Root Cause

```solidity
function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
    _token.transfer(owner(), _amount);
    // return value NOT checked
    // USDT-like tokens return false on failure instead of reverting
}
```

ERC20 표준에서 `transfer()`는 `bool`을 반환한다. 일부 토큰(USDT, BNB 등)은 실패 시 revert하지 않고 `false`를 반환한다. 반환값을 확인하지 않으면 transfer가 실패해도 트랜잭션이 성공으로 처리된다.

#### Fund Freeze Scenario

```
1. 사용자들이 PaymentVault에 USDT를 depositOnDemand()로 예치
2. Owner가 withdrawERC20(USDT, amount) 호출
3. USDT.transfer()가 잔액 부족 등으로 false 반환
4. 트랜잭션 성공으로 기록 — Owner는 출금 완료로 인식
5. 실제로는 USDT가 vault에 그대로 잔류
6. Accounting 불일치 → 재출금 시도 시에도 같은 문제 반복 가능
```

#### Mitigation

```diff
+ import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
+ using SafeERC20 for IERC20;

  function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
-     _token.transfer(owner(), _amount);
+     _token.safeTransfer(owner(), _amount);
  }
```

#### Steelman Refutation

코드 주석에 "We assume `_token` is a valid ERC20 token"이라고 기재. Owner가 알려진 토큰만 사용한다면 문제 없음. 그러나 `SafeERC20` 적용 비용이 거의 없으므로 defense-in-depth 권장.

---

### F-04 [MEDIUM] On-Demand Depositor 출금 불가 — Fund Freeze (by Design)

**Impact**: Fund Freeze (설계상 한계)
**Confidence**: 78 | **Agents**: Agent 6, 8
**Location**: `contracts/src/core/PaymentVault.sol`

#### Root Cause

`PaymentVault`에 depositor 자신이 예치금을 출금하는 함수가 없다. `withdraw()`와 `withdrawERC20()`은 모두 `onlyOwner`이다.

```solidity
// depositOnDemand — 누구나 예치 가능
function depositOnDemand(address _account) external payable { ... }

// withdraw — Owner만 출금 가능
function withdraw(uint256 _amount) external onlyOwner { ... }

// 사용자 출금 함수: 없음
```

#### Fund Freeze Scenario

```
1. 사용자 A가 1 ETH를 depositOnDemand()으로 예치
2. 사용자 A가 EigenDA 서비스를 더 이상 사용하지 않기로 결정
3. 남은 잔액 0.5 ETH를 출금하려 하지만 → 함수 없음
4. Owner에게 출금 요청해야 하나, 중앙화된 프로세스
5. Owner가 응답하지 않으면 → 자금 영구 잠김
```

#### Mitigation

```diff
+ function withdrawOnDemand(uint256 _amount) external {
+     require(onDemandPayments[msg.sender].totalDeposit >= _amount, "Insufficient balance");
+     onDemandPayments[msg.sender].totalDeposit -= uint80(_amount);
+     (bool success,) = msg.sender.call{value: _amount}("");
+     require(success, "Transfer failed");
+ }
```

#### Steelman Refutation

의도적 설계일 수 있음 — 예치금이 서비스 사용에 대한 선불이므로 환불 메커니즘이 없을 수 있다. 그러나 사용자 입장에서 남은 잔액을 회수할 수 없는 것은 자금 동결에 해당한다.

---

### F-05 [MEDIUM] Relay `GetBlob` — Global Rate Limiter DoS

**Impact**: DoS (Relay 서비스 중단)
**Confidence**: 82 | **Agents**: Agent 1, 4
**Location**: `relay/server.go:L203-L269`

#### Root Cause

```go
func (s *Server) GetBlob(ctx context.Context, request *pb.GetBlobRequest) (*pb.GetBlobReply, error) {
    // NO authentication — s.authenticator not referenced
    // ONLY global rate limiter
    s.blobRateLimiter.BeginGetBlobOperation(ctx) // global, not per-client
    // ...
}
```

`GetChunks`는 `s.authenticator.AuthenticateGetChunksRequest()`로 인증하지만, `GetBlob`은 인증이 전혀 없다. Rate limiter도 global 단위로만 동작하여 per-client 제한이 없다.

#### DoS Scenario

```
1. 공격자가 유효한 blob key 수집 (on-chain 이벤트에서 파생 가능)
2. 다수의 GetBlob 요청을 동시 전송
3. Global rate limiter 예산 소진
   - MaxGetBlobOpsPerSecond 도달
   - MaxConcurrentGetBlobOps 도달
4. 정당한 사용자(rollup sequencer 등)의 blob retrieval 차단
5. L2 rollup이 blob 데이터를 가져올 수 없어 derivation 중단
```

#### Cost Analysis

| | |
|---|---|
| **공격 비용** | 네트워크 대역폭만 필요. 인증 없으므로 자격 증명 불필요. 거의 0 |
| **피해** | Relay 서비스 중단 → L2 rollup derivation 차단 |
| **비대칭성** | 극심 — 저비용 공격으로 고가치 서비스 중단 |

#### Mitigation

```diff
  func (s *Server) GetBlob(ctx context.Context, request *pb.GetBlobRequest) (*pb.GetBlobReply, error) {
+     clientID := peer.FromContext(ctx) // IP-based
+     if !s.blobRateLimiter.AllowPerClient(clientID) {
+         return nil, status.Error(codes.ResourceExhausted, "per-client rate limit")
+     }
      s.blobRateLimiter.BeginGetBlobOperation(ctx)
```

---

### F-06 [MEDIUM] Node `GetChunks` 무인증 → 노드 리소스 고갈 DoS

**Impact**: DoS (개별 노드)
**Confidence**: 82 | **Agents**: Agent 1
**Location**: `node/grpc/server_v2.go:L443-L487`, `node/grpc/storechunks_interceptor.go:L50`

#### Root Cause

```go
// storechunks_interceptor.go:L50
func StoreChunksDisperserAuthAndRateLimitInterceptor(...) {
    if info.FullMethod != validatorpb.Dispersal_StoreChunks_FullMethodName {
        return handler(ctx, req) // ALL other methods pass through unguarded
    }
    // auth + rate limit only for StoreChunks
}
```

```go
// server_v2.go:L39
type ServerV2 struct {
    ratelimiter common.RateLimiter // ASSIGNED but NEVER USED
    // ...
}
```

Interceptor가 `StoreChunks`만 보호하고, `GetChunks`는 완전히 무방비. `ratelimiter` 필드가 존재하지만 어디에서도 호출되지 않는 dead code.

#### Mitigation

```diff
  // storechunks_interceptor.go
- if info.FullMethod != validatorpb.Dispersal_StoreChunks_FullMethodName {
-     return handler(ctx, req)
- }
+ switch info.FullMethod {
+ case validatorpb.Dispersal_StoreChunks_FullMethodName:
+     // existing auth + rate limit
+ case validatorpb.Retrieval_GetChunks_FullMethodName:
+     // apply retrieval rate limit
+     if err := rateLimiter.Allow(ctx); err != nil {
+         return nil, status.Error(codes.ResourceExhausted, "rate limit exceeded")
+     }
+     return handler(ctx, req)
+ default:
+     return handler(ctx, req)
+ }
```

---

### F-07 [MEDIUM] `ChunkRateLimiter` Map 무한 증가 → OOM Crash

**Impact**: DoS (Relay OOM crash)
**Confidence**: 80 | **Agents**: Agent 1
**Location**: `relay/limiter/chunk_rate_limiter.go:L86-L98`

#### Root Cause

```go
func (l *ChunkRateLimiter) BeginGetChunkOperation(requesterID string, ...) {
    if _, exists := l.perClientOperationsInFlight[requesterID]; !exists {
        l.perClientOperationsInFlight[requesterID] = &atomic.Int64{}    // new entry
        l.perClientOpLimiter[requesterID] = rate.NewLimiter(...)         // new entry
        l.perClientBandwidthLimiter[requesterID] = rate.NewLimiter(...)  // new entry
        // NO eviction, NO TTL, NO max size
    }
}
```

`requesterID`는 `request.GetOperatorId()`에서 추출 — 공격자 제어 바이트. 인증 전에 rate limiter가 호출되지는 않지만, 인증된 operator라도 다양한 operator_id 바이트를 전송하여 map을 무한 확장할 수 있다.

#### DoS Scenario

```
1. 공격자가 valid operator key로 인증
2. 각 요청마다 다른 operator_id 바이트를 포함
3. 3개의 map (perClientOpsInFlight, perClientOpLimiter, perClientBandwidthLimiter) 동시 증가
4. 장기 운영 시 relay 메모리 고갈 → OOM crash
5. Relay 재시작 시 map 초기화 → 공격자 반복
```

#### Mitigation

```diff
+ const maxPerClientEntries = 10000
+
  func (l *ChunkRateLimiter) BeginGetChunkOperation(requesterID string, ...) {
+     if len(l.perClientOperationsInFlight) >= maxPerClientEntries {
+         // evict oldest or reject
+         return ErrTooManyClients
+     }
```

---

### F-08 [MEDIUM] `KeyLock.keyMutexMap` 무한 증가 → OOM Crash

**Impact**: DoS (Relay client OOM)
**Confidence**: 78 | **Agents**: Agent 5
**Location**: `api/clients/v2/relay/key_lock.go:L34-L46`

#### Root Cause

```go
func (kl *KeyLock[T]) AcquireKeyLock(key T) func() {
    kl.globalMutex.Lock()
    keyMutex, valueAlreadyExists := kl.keyMutexMap[key]
    if !valueAlreadyExists {
        keyMutex = &sync.Mutex{}
        kl.keyMutexMap[key] = keyMutex // GROWS FOREVER
    }
    kl.globalMutex.Unlock()
    keyMutex.Lock()
    return keyMutex.Unlock
}
// No deletion path exists anywhere in the file
```

Generic type `T`로 인해 key space가 무한. Blob key 등 unique key를 사용하면 운영 시간에 비례하여 메모리 증가.

---

### F-09 [MEDIUM] `DeserializeSplitFrameProofs` nil Proof → Panic Crash

**Impact**: DoS (노드/relay crash via panic)
**Confidence**: 85 | **Agents**: Agent 2
**Location**: `encoding/serialization.go:L156-L162`

#### Root Cause

```go
func DeserializeSplitFrameProofs(proofs [][]byte) ([]*Proof, error) {
    proofsSlice := make([]*Proof, len(proofs))
    for i, proof := range proofs {
        proofsSlice[i], _ = DeserializeFrameProof(proof) // ERROR DISCARDED
        // If DeserializeFrameProof fails → proofsSlice[i] = nil
    }
    return proofsSlice, nil // returns nil proofs without error
}
```

#### Crash Scenario

```
1. 악의적 relay/operator가 손상된 chunk proof 데이터 전송
2. DeserializeSplitFrameProofs 호출 → nil proof 저장
3. 이후 pairing check에서 nil *bn254.G1Affine 접근
4. → panic: runtime error: invalid memory address or nil pointer dereference
5. 노드/relay 프로세스 crash
6. 반복 전송으로 지속적 crash → DoS
```

#### Mitigation

```diff
  for i, proof := range proofs {
-     proofsSlice[i], _ = DeserializeFrameProof(proof)
+     var err error
+     proofsSlice[i], err = DeserializeFrameProof(proof)
+     if err != nil {
+         return nil, fmt.Errorf("failed to deserialize proof at index %d: %w", i, err)
+     }
  }
```

---

### F-10 [MEDIUM] `_tryEjectOperator` Silent Fail → 악의적 Operator 잔류

**Impact**: DoS (Quorum 무결성 저하 → DA 보장 약화)
**Confidence**: 80 | **Agents**: Agent 6, 7
**Location**: `contracts/src/periphery/ejection/EigenDAEjectionManager.sol:L4599-L4601`

#### Root Cause

```solidity
function _tryEjectOperator(address operator, bytes memory quorums) internal {
    try registryCoordinator.ejectOperator(operator, quorums) {} catch {}
    // ALL errors silently swallowed
}
```

#### Scenario

```
1. Ejector가 악의적 operator A 제거를 시작 (startEjection)
2. Operator A가 front-run: 대상 quorum 일부에서 자발적 deregister
3. completeEjection 호출 → _tryEjectOperator 실행
4. ejectOperator가 revert (quorum bitmap 불일치)
5. catch{}가 에러를 무시 → 트랜잭션 성공
6. EjectionCompleted 이벤트 emit → off-chain에서 "제거 완료"로 인식
7. 실제로 operator A는 남은 quorum에서 여전히 활동 중
8. Cooldown 시작 → 재시도 차단
9. 악의적 operator가 cooldown 기간 동안 quorum에 잔류
```

#### Mitigation

```diff
  function _tryEjectOperator(address operator, bytes memory quorums) internal {
-     try registryCoordinator.ejectOperator(operator, quorums) {} catch {}
+     try registryCoordinator.ejectOperator(operator, quorums) {
+         // success
+     } catch (bytes memory reason) {
+         emit EjectionFailed(operator, quorums, reason);
+     }
  }
```

---

### F-11 [MEDIUM] Reservation Cache Eviction → 무료 처리량 도용

**Impact**: Fund Theft (간접 — 무료 서비스 이용으로 프로토콜 수익 손실)
**Confidence**: 78 | **Agents**: Agent 8
**Location**: `core/payments/reservation/reservationvalidation/reservation_ledger_cache.go`

#### Root Cause

```go
// GetOrCreate 시 cache miss → 새 ledger 생성 (빈 LeakyBucket)
// 기존 ledger가 eviction되면 사용량 카운터 소실
// 재접근 시 빈 bucket으로 시작 → 이전 사용량 무효화
```

코드 내에 이 race condition이 인지/문서화되어 있으나(L2656-2670), 수정되지 않았다.

#### Scenario

```
1. 공격자가 reservation account R1으로 할당량의 80% 사용
2. 공격자가 >1024개의 다른 account로 요청 → R1의 cache eviction 유발
3. R1로 다시 요청 → cache miss → 빈 LeakyBucket 생성
4. 할당량 100% 다시 사용 가능 → 총 180% 사용
5. 반복으로 무한 무료 처리량 획득
```

**Cost**: >1024 reservation accounts 필요 (각각 governance 승인 필요). 현실적 공격 비용 높음.

#### Steelman Refutation

개발팀이 인지하고 있으며 발생 확률이 낮다고 판단. Dynamic resizing (최대 65536)이 지속적 공격을 어렵게 만든다. 그러나 bucket state를 DB에 persist하면 근본적 해결 가능.

---

### F-12 [LOW] Payment Commit 후 Rate Limit 확인 → 자금 소모 Without 서비스

**Impact**: Fund Theft (소액 — 사용자 on-demand 예치금 소모)
**Confidence**: 75 | **Agents**: Agent 8
**Location**: `core/meterer/meterer.go:L546-L581`

#### Root Cause

```go
func (m *Meterer) ServeOnDemandRequest(ctx context.Context, ...) error {
    // STEP 1: payment 먼저 commit
    err = m.AddOnDemandPayment(ctx, header)  // DynamoDB에 payment 기록

    // STEP 2: 그 다음 rate limit 확인
    err = m.IncrementGlobalBinUsage(ctx, ...)
    if err != nil {
        // STEP 3: rate limit 초과 → rollback 시도
        m.RollbackOnDemandPayment(ctx, header)
        // BUT: rollback은 conditional write — concurrent 환경에서 실패 가능
    }
}
```

#### Scenario

```
1. 공격자가 global bin을 capacity까지 채움
2. 정당한 사용자가 on-demand dispersal 요청
3. Payment commit 성공 (Step 1)
4. Global rate limit 초과 (Step 2) → 요청 거부
5. Rollback 시도 (Step 3) → concurrent write로 인해 conditional check 실패
6. 사용자의 cumulativePayment는 증가했으나 서비스는 제공되지 않음
7. 소액이지만 반복 시 누적
```

#### Steelman Refutation

Legacy metering path이며, 새로운 시스템(`OnDemandMeterer`)에서는 rate limit을 payment 전에 확인한다. Legacy path가 deprecated되었다면 영향 없음.

---

### F-13 [HIGH] `GetBlobCommitment` 무인증 CPU 고갈 → Disperser DoS ★ 1-depth

**Impact**: DoS (Disperser 서비스 완전 중단)
**Confidence**: 90 | **Depth**: 1 — precondition 없음
**Location**: `disperser/apiserver/server_v2.go:L273-L333`

#### Root Cause

```go
func (s *DispersalServerV2) getBlobCommitment(req *pb.BlobCommitmentRequest) (*pb.BlobCommitmentReply, error) {
    // NO authentication
    // NO rate limiting
    blobSize := uint32(len(req.GetBlob()))
    // size check exists BUT allows up to maxNumSymbolsPerBlob * 32 bytes
    c, err := s.committer.GetCommitmentsForPaddedLength(req.GetBlob())
    // KZG commitment computation — CPU-intensive (FFT, polynomial evaluation)
}
```

- **인증**: 없음
- **Rate limit**: 없음
- **gRPC max message size**: 300 MiB (`grpc.MaxRecvMsgSize(1024 * 1024 * 300)`)
- **비용**: KZG commitment 계산은 blob 크기에 비례하여 CPU-intensive

#### Attack Scenario

```
1. 공격자가 최대 크기 blob (수십 MB)을 포함한 GetBlobCommitment 요청 생성
2. 인증 없이 disperser gRPC endpoint에 전송
3. Disperser가 KZG commitment 계산 시작 (CPU-heavy)
4. 동시에 수십 개의 요청을 병렬 전송
5. Disperser CPU 100% → 정당한 DisperseBlob 요청 처리 불가
6. DA 서비스 전체 중단
```

#### Cost Analysis

| | |
|---|---|
| **공격 비용** | 네트워크 대역폭만 필요. 인증 불필요. **$0** |
| **피해** | Disperser CPU 고갈 → 전체 DA 서비스 중단 |
| **비대칭성** | **극단적** — 공격자는 요청만 전송, disperser는 비용이 높은 KZG 연산 수행 |
| **지속성** | 공격 중단 시 즉시 복구. 그러나 공격자가 지속 가능 |

#### Why This Is 1-depth

- 인증 전무: 어떤 자격 증명도 불필요
- Rate limit 전무: 요청 횟수 제한 없음
- 공격자 제어 입력: blob 크기를 공격자가 결정
- CPU amplification: 작은 요청 크기 대비 높은 CPU 비용

#### Mitigation

```diff
  func (s *DispersalServerV2) getBlobCommitment(req *pb.BlobCommitmentRequest) ... {
+     // Option 1: disable by default (already has config flag)
+     // Option 2: require authentication
+     if err := s.authenticator.AuthenticateRequest(ctx); err != nil {
+         return nil, status.Error(codes.Unauthenticated, "authentication required")
+     }
+     // Option 3: at minimum, add rate limiting
+     if !s.commitmentRateLimiter.Allow() {
+         return nil, status.Error(codes.ResourceExhausted, "rate limit exceeded")
+     }
```

> **참고**: `disableGetBlobCommitment` config flag가 존재하지만 기본값이 `false` (활성화). 프로덕션에서 비활성화되었다면 영향 없음.

---

### F-14 [HIGH] `DisperseBlob` 300 MiB Pre-Auth Deserialization → Disperser OOM ★ 1-depth

**Impact**: DoS (Disperser 메모리 고갈)
**Confidence**: 88 | **Depth**: 1 — precondition 없음
**Location**: `disperser/apiserver/server_v2.go:L229`, `disperser/apiserver/disperse_blob_v2.go:L40-L111`

#### Root Cause

```go
// server_v2.go:L229 — gRPC 서버 설정
s.grpcServer = grpc.NewServer(
    grpc.MaxRecvMsgSize(1024 * 1024 * 300), // 300 MiB per message!
    // NO concurrent request limit
)

// disperse_blob_v2.go — 처리 순서
func (s *DispersalServerV2) disperseBlob(ctx context.Context, req *pb.DisperseBlobRequest) {
    blob := req.GetBlob()         // STEP 1: 이미 300 MiB 할당 완료 (gRPC deserialization)
    // ...
    _, err = rs.ToFrArray(blob)   // STEP 2: 또 다른 복사본 생성 (field elements)
    // ...
    s.committer.GetCommitmentsForPaddedLength(blob) // STEP 3: KZG 연산용 추가 할당
    // STEP 4: 이제야 인증 확인
    s.blobRequestAuthenticator.AuthenticateBlobRequest(...)
}
```

**핵심**: gRPC의 protobuf deserialization은 **인증 전에** 발생한다. 300 MiB 메시지를 수신하면 인증 체크 여부와 무관하게 메모리에 할당된다.

#### Attack Scenario

```
1. 공격자가 300 MiB protobuf 메시지 생성 (유효하지 않은 서명 포함)
2. DisperseBlob endpoint로 전송
3. gRPC가 300 MiB를 메모리에 deserialization (인증 전)
4. 내부에서 ToFrArray 등으로 ~3x 메모리 amplification
5. 이후 인증 실패 → 요청 거부. 그러나 메모리는 이미 할당됨
6. 10개 동시 요청 → 300 MiB × 3 × 10 = ~9 GB 순간 메모리 사용
7. Disperser OOM crash
```

#### Mitigation

```diff
  // Option 1: gRPC max message size 축소
- grpc.MaxRecvMsgSize(1024 * 1024 * 300),
+ grpc.MaxRecvMsgSize(1024 * 1024 * 16), // 16 MiB — 실제 필요한 크기로 축소

  // Option 2: concurrent request limiter 추가
+ grpc.ChainUnaryInterceptor(
+     concurrencyLimiterInterceptor(maxConcurrent: 5),
+     s.metrics.grpcMetrics.UnaryServerInterceptor(),
+ ),
```

---

### F-15 [HIGH] `DefaultBlobCodec.DecodeBlob` 4 GB Allocation → Client OOM ★ 1.5-depth

**Impact**: DoS (EigenDA client / L2 rollup node OOM crash)
**Confidence**: 85 | **Depth**: 1.5 — malicious relay 필요 (permissioned)
**Location**: `api/clients/codecs/default_blob_codec.go:L39-L61`

#### Root Cause

```go
func (v DefaultBlobCodec) DecodeBlob(data []byte) ([]byte, error) {
    if len(data) < 32 {
        return nil, fmt.Errorf("...")
    }
    length := binary.BigEndian.Uint32(data[2:6])   // attacker controls this (4 bytes)
    // NO validation that length <= len(data)
    rawData := make([]byte, length)                 // allocation up to 4 GiB!
    // ...
    reader.Read(rawData)  // Read will fail, but allocation already happened
}
```

**관련 경로**: `DeserializeBlob` (`api/clients/v2/coretypes/blob.go:L27-L57`)도 동일 패턴:
```go
blobLengthBytes := blobLengthSymbols * encoding.BYTES_PER_SYMBOL  // 32 bytes per symbol
if uint32(len(bytes)) < blobLengthBytes {
    bytes = append(bytes, make([]byte, blobLengthBytes-uint32(len(bytes)))...) // up to ~32 GB
}
```

`blobLengthSymbols`는 BlobHeader에서 오며, `IsPowerOfTwo` 검증만 수행 (크기 상한 없음).

#### Attack Scenario

```
1. [Precondition] 악의적 relay 또는 relay-client 간 MITM
   (relay는 permissioned이므로 직접 등록 불가 — governance 장악 필요)

2. Client(L2 rollup node)가 relay에 GetBlob 요청
3. Relay가 조작된 응답 반환:
   - 정상적 protobuf wrapper (작은 크기)
   - blob data의 length prefix를 0xFFFFFFFF (4 GB)로 설정
4. Client의 DefaultBlobCodec.DecodeBlob 호출
5. make([]byte, 4294967295) → 4 GB 할당 시도 → OOM crash
6. L2 rollup node가 crash → rollup liveness 영향

또는 DeserializeBlob 경로:
3'. BlobHeader.BlobCommitments.Length를 2^30으로 설정
4'. make([]byte, 2^30 * 32) → ~32 GB 할당 시도 → OOM crash
```

#### Why 1.5-depth (Not 1-depth)

Relay는 **permissioned** (owner multisig가 등록). 공격자가 relay를 직접 세팅할 수 없다. 그러나:
- Relay가 compromise되면 모든 client에 영향 (blast radius가 크다)
- `relayClient.GetBlob`은 commitment 검증 없이 raw data를 반환 (low-level API)
- 상위 `RelayPayloadRetriever`를 통하면 commitment 검증이 수행되지만, DecodeBlob 내부의 length 체크는 commitment 검증 이전에 발생

#### Mitigation

```diff
  func (v DefaultBlobCodec) DecodeBlob(data []byte) ([]byte, error) {
      length := binary.BigEndian.Uint32(data[2:6])
+     if length > uint32(len(data)) {
+         return nil, fmt.Errorf("declared length %d exceeds data size %d", length, len(data))
+     }
      rawData := make([]byte, length)
```

---

## Depth 재평가: 기존 Findings

### F-05 [MEDIUM→HIGH] Relay `GetBlob` — 1-depth로 상향

**재평가 근거**:
- blob key는 on-chain 이벤트에서 무비용으로 수집 가능 → precondition 아님
- 인증 없음, per-client rate limit 없음
- 공격 비용 $0, 네트워크 대역폭만 필요
- **Depth 2 → 1**: 외부 공격자가 직접 트리거 가능

### F-06 [MEDIUM→HIGH] Node `GetChunks` — 1-depth로 상향

**재평가 근거**:
- interceptor가 `StoreChunks`만 보호, `GetChunks`는 **완전 무방비**
- Rate limiter 필드가 존재하지만 **dead code** (어디서도 호출 안 됨)
- 노드 endpoint는 operator set에서 공개 조회 가능
- **Depth 2 → 1**: 인증도 rate limit도 없는 진정한 1-depth

### F-07 [MEDIUM] ChunkRateLimiter OOM — 1.5-depth 유지, 근거 강화

**재평가 근거**:
- Operator 등록 비용: Quorum 1에서 **1 EIGEN ≈ $2-3** (permissionless)
- Slashing 없음 — 공격 후에도 stake 보전
- **Depth 2 → 1.5**: precondition 비용이 거의 없으므로 사실상 1-depth에 가까움

### F-10 [MEDIUM] `_tryEjectOperator` — 1.5-depth로 재분류

**재평가 근거**:
- 악의적 operator 등록: $2-3 (Quorum 1)
- Front-run timing은 공격자가 제어 가능 (mempool 모니터링)
- **Depth 3 → 1.5**: 두 precondition 모두 공격자가 저비용으로 세팅 가능

---

## Impact Summary Matrix

```
                      Fund Theft    Fund Freeze    DoS          Depth
                      ----------    -----------    ---          -----
★ F-13 GetBlobCommit                               ★★★ (Disperser)  1
★ F-14 DisperseBlob                                ★★★ (Disperser)  1
     pre-auth OOM
★ F-05 GetBlob DoS                                 ★★★ (Relay)      1
★ F-06 GetChunks DoS                               ★★★ (Node)       1
  F-15 DecodeBlob                                  ★★★ (Client)     1.5
     4GB alloc
  F-07 ChunkRate                                   ★★ (Relay OOM)   1.5
     Limiter OOM
  F-10 Ejection fail                               ★★ (Quorum)      1.5
  F-01 BatchConfirmer                              ★★★ (Network)    2
  F-02 CertVerifier                                ★★★ (L1)         2
  F-03 withdrawERC20                ★★                              2
  F-04 No depositor                 ★★                              2
       withdrawal
  F-08 KeyLock OOM                                 ★ (Client OOM)   2
  F-09 nil proof panic                             ★★ (Node)        2
  F-11 Cache eviction   ★ (indirect)                                3
  F-12 Payment griefing ★ (small)                                   3
```

**핵심 위험 요약**:

### 1-depth DoS: 외부 공격자가 $0으로 트리거 가능한 서비스 중단

| Finding | 대상 | 공격 비용 | 인증 | Rate Limit |
|---|---|---|---|---|
| **F-13** GetBlobCommitment CPU 고갈 | Disperser | $0 | 없음 | 없음 |
| **F-14** DisperseBlob 300MiB pre-auth | Disperser | $0 | 인증 전에 할당 | 없음 |
| **F-05** GetBlob global rate limit | Relay | $0 | 없음 | Global만 (per-client 없음) |
| **F-06** GetChunks 완전 무방비 | Node | $0 | 없음 | 없음 (dead code) |

이 4건은 **외부 공격자가 인증 없이 $0으로 즉시 트리거할 수 있는** 서비스 거부 공격이다. 특히 F-13은 CPU amplification (작은 요청 → 비용이 높은 KZG 연산)으로 비대칭성이 극단적이다.

### 1.5-depth: operator 등록 $2-3으로 precondition 세팅

| Finding | Precondition 비용 |
|---|---|
| **F-07** ChunkRateLimiter OOM | 1 EIGEN ≈ $2-3 (Quorum 1, permissionless) |
| **F-10** Ejection silent fail | 1 EIGEN ≈ $2-3 + mempool 모니터링 |
| **F-15** DecodeBlob 4GB alloc | relay 장악 필요 (permissioned) — 이 경우만 비용 높음 |

### 자금 관련: 직접 탈취 경로 없음

- **Fund Theft**: 간접적이며 소액 (F-11 cache eviction, F-12 payment griefing). 1-depth 자금 탈취는 0건.
- **Fund Freeze**: Owner-gated (F-03, F-04). 외부 공격자의 직접 자금 동결 경로 없음.

### 공격 가능성 vs 영향 매트릭스

```
          영향: 낮음         영향: 높음
          ──────────────────────────────
용이함:   │ F-08 (client)  │ F-13 ★ (disperser CPU)
높음      │ F-12 (소액)    │ F-14 ★ (disperser OOM)
($0)      │                │ F-05 ★ (relay)
          │                │ F-06 ★ (node)
          ├────────────────┼──────────────────
용이함:   │ F-11 (cache)   │ F-07 (relay OOM)
중간      │                │ F-10 (quorum)
($2-3)    │                │
          ├────────────────┼──────────────────
용이함:   │                │ F-01 (network DoS)
낮음      │                │ F-02 (L1 finality)
(admin)   │                │ F-03 (fund freeze)
          │                │ F-04 (fund freeze)
          ──────────────────────────────
```

**우측 상단(용이+고영향)이 가장 위험** — F-13, F-14, F-05, F-06이 이에 해당.

### Unauthenticated Endpoint 전체 현황

심층 분석에서 확인된 EigenDA의 전체 무인증 endpoint 현황:

| Endpoint | Component | 인증 | Rate Limit | 공격자 제어 입력 | 영향 |
|---|---|---|---|---|---|
| `GetBlobCommitment` | Disperser | 없음 | 없음 | blob 크기 (최대 수십 MB) | **CPU 고갈** |
| `DisperseBlob` | Disperser | 있음 (서명) | 없음 | 300 MiB pre-auth deserialization | **메모리 고갈** |
| `GetBlobStatus` | Disperser | 없음 | 없음 | blob key | DB I/O |
| `GetValidatorSigningRate` | Disperser | 없음 | 없음 | validator ID | 경미 |
| `GetBlob` | Relay | 없음 | Global만 | blob key | **대역폭 고갈** |
| `GetChunks` (auth off) | Relay | 조건부 (config) | Per-client (spoofable) | chunk 요청 수 | **리소스 고갈** |
| `GetChunks` | Node | 없음 | **없음** | blob key | **디스크 I/O** |
| `GetNodeInfo` | Node | 없음 | 없음 | 없음 | 정보 노출 |
| Proxy REST (모든 경로) | Proxy | 없음 | 없음 | POST 16 MiB | Proxy 부하 |

### 성숙도 평가

EigenDA는 3차례 전문 감사를 통해 47건의 이슈가 수정된 코드베이스이다. **On-chain 코드(Solidity)는 높은 성숙도**를 보이나, **Off-chain 서비스 레이어(Go gRPC)에서 인증 및 rate limiting 누락이 체계적으로 발견**되었다. 이는 DA 시스템의 특성상 "데이터 조회는 공개"라는 설계 의도와 "서비스 가용성 보호"라는 보안 요구 사이의 gap으로 보인다.

---

> **Disclaimer**: 본 보고서는 AI 기반 8-agent 병렬 감사 + 5-Gate 검증을 통해 작성되었습니다. 47건의 기존 감사 보고서 발견 사항과 교차 확인하였으나, AI 분석은 취약점의 완전한 부재를 보장하지 않습니다. 특히 1-depth 취약점의 부재는 static analysis의 구조적 한계를 반영하며, 동적 분석과 fuzzing을 통한 추가 검증을 권장합니다.
