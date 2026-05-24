// Mock data for DA Dashboard prototype

export type DALayer = "ethereumda" | "eigenda" | "celestia" | "avail";

export interface DAStatus {
  id: DALayer;
  name: string;
  color: string;
  status: "operational" | "degraded" | "down";
  activeInfra: string;
  specInfra: string;
  submitLatencyP50: number;
  submitLatencyP95: number;
  retrievalSuccess24h: number;
  blobSurvival30d: number | null;
  spofRisk: "low" | "medium" | "high" | "critical";
  spofReason: string;
  uptimeLast7d: number;
}

export const daStatuses: DAStatus[] = [
  {
    id: "ethereumda",
    name: "EthereumDA",
    color: "#627eea",
    status: "operational",
    activeInfra: "Full Node (self-hosted)",
    specInfra: "Decentralized validators",
    submitLatencyP50: 12400,
    submitLatencyP95: 24800,
    retrievalSuccess24h: 100,
    blobSurvival30d: null,
    spofRisk: "low",
    spofReason: "Fully decentralized, 900k+ validators",
    uptimeLast7d: 100,
  },
  {
    id: "eigenda",
    name: "EigenDA",
    color: "#7c3aed",
    status: "operational",
    activeInfra: "1 active relay / 3 registered",
    specInfra: "Multiple relays (decentralized)",
    submitLatencyP50: 1800,
    submitLatencyP95: 4200,
    retrievalSuccess24h: 99.2,
    blobSurvival30d: 87.3,
    spofRisk: "critical",
    spofReason: "Single active relay + global rate limit = DoS vector",
    uptimeLast7d: 99.1,
  },
  {
    id: "celestia",
    name: "Celestia",
    color: "#8b5cf6",
    status: "operational",
    activeInfra: "Light Node (peers: 42)",
    specInfra: "DAS-based light nodes",
    submitLatencyP50: 1600,
    submitLatencyP95: 3800,
    retrievalSuccess24h: 100,
    blobSurvival30d: 99.8,
    spofRisk: "medium",
    spofReason: "Validator set concentration (top 10 = 38% stake)",
    uptimeLast7d: 100,
  },
  {
    id: "avail",
    name: "Avail",
    color: "#06b6d4",
    status: "degraded",
    activeInfra: "Light Node (peers: 18)",
    specInfra: "DAS-based light nodes",
    submitLatencyP50: 2800,
    submitLatencyP95: 6200,
    retrievalSuccess24h: 98.7,
    blobSurvival30d: 96.4,
    spofRisk: "medium",
    spofReason: "Confidence often below 100% on recent blocks",
    uptimeLast7d: 98.2,
  },
];

// Blob Survival Curve data
export interface SurvivalPoint {
  bucket: string;
  minutes: number;
  ethereumda: number | null;
  eigenda: number | null;
  celestia: number;
  avail: number;
}

export const survivalCurveData: SurvivalPoint[] = [
  { bucket: "5m", minutes: 5, ethereumda: 100, eigenda: 100, celestia: 100, avail: 100 },
  { bucket: "15m", minutes: 15, ethereumda: 100, eigenda: 99.8, celestia: 100, avail: 99.9 },
  { bucket: "1h", minutes: 60, ethereumda: 100, eigenda: 99.5, celestia: 100, avail: 99.7 },
  { bucket: "6h", minutes: 360, ethereumda: 100, eigenda: 98.2, celestia: 100, avail: 99.1 },
  { bucket: "1d", minutes: 1440, ethereumda: 100, eigenda: 95.1, celestia: 99.9, avail: 98.3 },
  { bucket: "3d", minutes: 4320, ethereumda: 100, eigenda: 92.4, celestia: 99.9, avail: 97.8 },
  { bucket: "7d", minutes: 10080, ethereumda: 100, eigenda: 90.1, celestia: 99.8, avail: 97.2 },
  { bucket: "14d", minutes: 20160, ethereumda: 82.3, eigenda: 88.5, celestia: 99.8, avail: 96.8 },
  { bucket: "30d", minutes: 43200, ethereumda: null, eigenda: 87.3, celestia: 99.8, avail: 96.4 },
];

// Submit Latency time series (last 24h, hourly)
export interface LatencyPoint {
  time: string;
  ethereumda: number;
  eigenda: number;
  celestia: number;
  avail: number;
}

function generateLatencyData(): LatencyPoint[] {
  const data: LatencyPoint[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    data.push({
      time: `${t.getHours().toString().padStart(2, "0")}:00`,
      ethereumda: 12000 + Math.random() * 3000,
      eigenda: 1500 + Math.random() * 1500 + (i === 8 ? 8000 : 0),
      celestia: 1400 + Math.random() * 1200,
      avail: 2500 + Math.random() * 2000 + (i === 15 ? 5000 : 0),
    });
  }
  return data;
}
export const latencyData = generateLatencyData();

// Spec vs Reality entries
export interface SpecVsReality {
  da: DALayer;
  daName: string;
  category: string;
  claim: string;
  reality: string;
  severity: "info" | "warning" | "critical";
  evidence: string;
  lastChecked: string;
}

export const specVsRealityData: SpecVsReality[] = [
  {
    da: "eigenda",
    daName: "EigenDA",
    category: "Relay 중앙화",
    claim:
      "Relay 집합은 다수로 구성되어 단일 장애점을 방지한다. (EigenDA 백서 §3.2 — multi-relay)",
    reality:
      "2026-05-14 기준 relay_registry 컨트랙트의 슬롯 3개 중 실제 온체인 주소를 가진 키는 1개뿐이며, 나머지 2개 슬롯은 모두 0x0000…0000 으로 비어 있다. 결과적으로 active relay는 1개이며, 백서가 약속한 다중 relay는 현재 단일 relay에 의존한다.",
    severity: "critical",
    evidence:
      "relay_registry contract · 슬롯 0 = 0x1a3f…e7d9 (active) · 슬롯 1 = 0x0000…0000 · 슬롯 2 = 0x0000…0000 · 마지막 polling 2026-05-14 09:30 UTC",
    lastChecked: "2026-05-14T09:30:00Z",
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    category: "Rate Limit 구조",
    claim: "Rate limit은 남용을 방지한다.",
    reality:
      "Rate limit이 client IP 별이 아니라 server-wide(글로벌) 토큰 버킷이다. 단일 클라이언트가 전체 할당을 소진할 수 있으며, 위 relay 단일화와 결합하면 1개 클라이언트로 read 경로 전체를 마비시킬 수 있다.",
    severity: "critical",
    evidence: "Disperser gRPC rate limit config: global token bucket · per-IP isolation 없음",
    lastChecked: "2026-05-14T09:30:00Z",
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    category: "Operator 분포",
    claim: "분산된 operator 집합이 회복탄력성을 보장한다.",
    reality:
      "Quorum 0에서 상위 5개 operator가 전체 stake의 62%를 보유하고 있다. Top-Nakamoto 3 — 3개 operator만 담합해도 임계값을 흔들 수 있다.",
    severity: "warning",
    evidence: "On-chain stake distribution · RegistryCoordinator 조회",
    lastChecked: "2026-05-14T08:00:00Z",
  },
  {
    da: "ethereumda",
    daName: "EthereumDA",
    category: "Blob 보존 기간",
    claim: "Blob은 약 18일(4096 epoch) 동안 가용하다.",
    reality:
      "실측 prune 시점은 클라이언트에 따라 차이가 있다. 자체 호스팅 Geth full node 기준 day 17.8에서 prune됨. spec 대비 -0.2일.",
    severity: "info",
    evidence: "eth_getBlobSidecars · self-hosted Geth full node · epoch 4091 이후 empty",
    lastChecked: "2026-05-14T06:00:00Z",
  },
  {
    da: "celestia",
    daName: "Celestia",
    category: "Validator 집중도",
    claim: "탈중앙화된 validator 집합.",
    reality: "Top 10 validator가 전체 stake의 38.2%를 보유. Nakamoto 계수 7.",
    severity: "warning",
    evidence: "Validator stake distribution · staking module query",
    lastChecked: "2026-05-14T07:00:00Z",
  },
  {
    da: "celestia",
    daName: "Celestia",
    category: "DAS 샘플링",
    claim: "라이트 노드가 DAS로 데이터 가용성을 검증.",
    reality: "최근 블록에서 DAS 샘플링은 100% 성공. 가끔 200ms 이상 지연 스파이크 발생.",
    severity: "info",
    evidence: "block_availability_samples · 30일간 실패 0건, p99 latency 340ms",
    lastChecked: "2026-05-14T09:00:00Z",
  },
  {
    da: "avail",
    daName: "Avail",
    category: "Confidence 수준",
    claim: "DAS가 데이터 가용성에 대한 높은 confidence를 제공한다.",
    reality: "블록 중 약 3.2%는 60초 관측 윈도우 내에 100% confidence에 도달하지 않는다.",
    severity: "warning",
    evidence: "block_availability_samples · 3.2%의 블록이 max confidence < 99.9%",
    lastChecked: "2026-05-14T08:30:00Z",
  },
  {
    da: "avail",
    daName: "Avail",
    category: "Retrieval 신뢰성",
    claim: "Retention 기간 내내 데이터 retrieval 가능.",
    reality: "30일 시점에 retrieval 성공률이 96.4%까지 떨어진다. 실패 유형은 hash_mismatch와 timeout.",
    severity: "warning",
    evidence: "retrievals · 30d bucket fetch_success = 96.4%",
    lastChecked: "2026-05-14T09:00:00Z",
  },
];

// Incidents
export interface Incident {
  id: string;
  da: DALayer;
  daName: string;
  timestamp: string;
  type: "submit_failure" | "retrieval_failure" | "sync_lag" | "peers_drop" | "latency_spike";
  title: string;
  description: string;
  duration: string;
  resolved: boolean;
}

export const incidents: Incident[] = [
  {
    id: "inc-001",
    da: "eigenda",
    daName: "EigenDA",
    timestamp: "2026-05-14T03:22:00Z",
    type: "latency_spike",
    title: "Submit latency spike to 9.2s",
    description: "Disperser submit latency spiked from ~1.8s to 9.2s for 12 minutes. Likely relay congestion.",
    duration: "12m",
    resolved: true,
  },
  {
    id: "inc-002",
    da: "avail",
    daName: "Avail",
    timestamp: "2026-05-13T18:45:00Z",
    type: "retrieval_failure",
    title: "3 consecutive retrieval failures (1h bucket)",
    description: "Blob retrieval returned hash_mismatch for 3 probes at 1h age bucket. Recovered after 20m.",
    duration: "20m",
    resolved: true,
  },
  {
    id: "inc-003",
    da: "avail",
    daName: "Avail",
    timestamp: "2026-05-13T14:10:00Z",
    type: "peers_drop",
    title: "Peer count dropped to 4",
    description: "Light node peer count dropped from 18 to 4. Recovered to 15 within 8 minutes.",
    duration: "8m",
    resolved: true,
  },
  {
    id: "inc-004",
    da: "celestia",
    daName: "Celestia",
    timestamp: "2026-05-12T22:00:00Z",
    type: "latency_spike",
    title: "DAS sampling latency p99 > 500ms",
    description: "DAS sampling latency p99 exceeded 500ms for 45 minutes during high blob activity period.",
    duration: "45m",
    resolved: true,
  },
  {
    id: "inc-005",
    da: "eigenda",
    daName: "EigenDA",
    timestamp: "2026-05-12T09:15:00Z",
    type: "submit_failure",
    title: "2 submit failures (rate limit)",
    description: "Submit requests returned RESOURCE_EXHAUSTED. Global rate limit likely hit by another client.",
    duration: "3m",
    resolved: true,
  },
];

// EigenDA Relay Registry data
export interface RelayEntry {
  index: number;
  key: string;
  isActive: boolean;
  lastSeen: string | null;
}

export const relayRegistry: RelayEntry[] = [
  {
    index: 0,
    key: "0x1a3f8b2c...e7d9",
    isActive: true,
    lastSeen: "2026-05-14T09:31:00Z",
  },
  {
    index: 1,
    key: "0x0000...0000",
    isActive: false,
    lastSeen: null,
  },
  {
    index: 2,
    key: "0x0000...0000",
    isActive: false,
    lastSeen: null,
  },
];

// Namespace/Rollup usage for Celestia
export interface NamespaceUsage {
  name: string;
  namespace: string;
  blobsLast24h: number;
  bytesLast24h: number;
  avgBlobSize: number;
}

// ─────────────────────────────────────────────────────────────────────
// Per-DA descriptive info (Overview cards)
// ─────────────────────────────────────────────────────────────────────
export interface DAInfo {
  id: DALayer;
  name: string;
  color: string;
  tagline: string;                 // role tag — "Built-in DA" / "Restaking-secured DA" / ...
  mechanism: string;               // 1-2 sentence mechanism explanation
  economicSecurity: string;        // human-readable, e.g. "$34.7B" or "~$8B restaked"
  economicSecurityNote?: string;   // optional caveat
  operatorCount: string;           // e.g. "~900,000" or "142"
  operatorKind: string;            // "validators" / "restakers" / "validators + light nodes"
  activeRollups: string[];         // top 3-5 names
  rollupCountTotal?: number;       // approx total
  throughput: string;              // "6.6 GiB/day avg"
  consensusModel: string;          // "Casper FFG" / "Restaked BLS" / "Tendermint" / "BABE+GRANDPA"
  bondaOnlyHighlights: string[];   // 2-3 metrics BONDA shows that others don't
  retentionPolicy: string;         // "~18 days (pruned)" / "14 days (claimed)" / etc.
}

export const daInfo: Record<DALayer, DAInfo> = {
  ethereumda: {
    id: "ethereumda",
    name: "EthereumDA",
    color: "#627eea",
    tagline: "내장 DA",
    mechanism:
      "EIP-4844 blob carrier 트랜잭션. EL 클라이언트에서 ~18일(4096 epoch) 후 prune. KZG commitment는 컨센서스 레이어에 영구 anchor.",
    economicSecurity: "$34.7B",
    economicSecurityNote: "이더리움 전체 staked ETH로 보호",
    operatorCount: "~900,000",
    operatorKind: "validators",
    activeRollups: ["Optimism", "Arbitrum", "Base", "Linea", "zkSync", "Scroll"],
    rollupCountTotal: 50,
    throughput: "평균 6.6 GiB/일 · ~6 blob/slot",
    consensusModel: "Casper FFG + LMD-GHOST",
    bondaOnlyHighlights: [
      "실측 pruning cliff (~17.8일) vs spec (18일)",
      "Retrieval 시 KZG re-commit 불일치 탐지",
      "Submit→Inclusion 지연 분포 (target slot vs actual)",
    ],
    retentionPolicy: "약 18일 (EL 클라이언트가 prune)",
  },
  eigenda: {
    id: "eigenda",
    name: "EigenDA",
    color: "#7c3aed",
    tagline: "리스테이킹 기반 DA",
    mechanism:
      "중앙 disperser가 blob을 chunk로 분할 → EigenLayer 리스테이커들에게 분산 저장. Operator는 BLS 서명을 모으고, relay가 read를 서빙.",
    economicSecurity: "~$8B 리스테이크",
    economicSecurityNote: "EigenLayer 경유 · slashing 미가동",
    operatorCount: "142",
    operatorKind: "리스테이커 (quorum 0)",
    activeRollups: ["Mantle", "Polynomial", "Movement"],
    rollupCountTotal: 8,
    throughput: "이론치 10 MB/s · 실측 ~12 MiB/분",
    consensusModel: "리스테이크 BLS aggregation · 55% stake 임계값",
    bondaOnlyHighlights: [
      "Relay registry 라이브 상태 (1/3 active, 백서는 multi-relay 주장)",
      "Operator free-riding 탐지 (서명만 하고 GetChunks 실패)",
      "재구성 임계값 라이브 마진 (55% 대비 +12 pts)",
    ],
    retentionPolicy: "14일 (스펙 기준)",
  },
  celestia: {
    id: "celestia",
    name: "Celestia",
    color: "#8b5cf6",
    tagline: "독립형 DA",
    mechanism:
      "모듈러 DA 체인. Validator가 합의 + 저장 제공, 라이트 노드는 DAS 샘플링으로 validator를 신뢰하지 않고 가용성 검증. 인코딩 오류 발생 시 BEFP 발행.",
    economicSecurity: "$888M",
    economicSecurityNote: "staked TIA",
    operatorCount: "100",
    operatorKind: "validators (+ DAS 라이트 노드)",
    activeRollups: ["Eclipse", "Manta Pacific", "Forma", "Orderly"],
    rollupCountTotal: 30,
    throughput: "평균 1.4 GB/일 · 2 MB/블록",
    consensusModel: "Tendermint (CometBFT) · 2/3 voting power",
    bondaOnlyHighlights: [
      "블록별 DAS confidence (Celenium은 노출 X)",
      "롤업별 namespace 활동 분해",
      "BEFP 탐지 로그",
    ],
    retentionPolicy: "30일+ (네트워크 정책)",
  },
  avail: {
    id: "avail",
    name: "Avail",
    color: "#06b6d4",
    tagline: "독립형 DA",
    mechanism:
      "Polkadot 파생 독립형 DA. row × col별 KZG commitment, 셀 무작위 샘플링 DAS. BABE 블록 생성 + GRANDPA finality.",
    economicSecurity: "~$300M",
    economicSecurityNote: "staked AVAIL · 초기 단계",
    operatorCount: "~100",
    operatorKind: "validators (BABE/GRANDPA)",
    activeRollups: ["Madara", "Astar zkEVM"],
    rollupCountTotal: 12,
    throughput: "~512 KiB/블록 · 20초 블록 타임",
    consensusModel: "BABE + GRANDPA · 2/3 voting power",
    bondaOnlyHighlights: [
      "블록 단위 confidence 곡선 (블록 3.2%가 100% 미만)",
      "30일 retrieval 감쇠 실측 (~96.4% 성공)",
      "Row × column 차원 분포",
    ],
    retentionPolicy: "30일+ (네트워크 정책)",
  },
};

// ─────────────────────────────────────────────────────────────────────
// Threat Modeling — Assets at risk per DA
// ─────────────────────────────────────────────────────────────────────
export interface AssetEntry {
  asset: string;           // what's at risk
  owner: string;           // who controls / where it lives
  trust: string;           // the trust assumption
  failureImpact: string;   // what happens on compromise
}

export const daAssets: Record<DALayer, AssetEntry[]> = {
  ethereumda: [
    {
      asset: "Blob payload (sidecar)",
      owner: "EL 클라이언트 (Geth / Reth / Erigon / Besu)",
      trust: "~4096 epoch (~18일) 유지 후 prune 가능",
      failureImpact: "Retention 경과 후 롤업이 자체 노드만으론 state 재구성 불가",
    },
    {
      asset: "KZG commitment",
      owner: "On-chain (컨센서스 레이어 영구)",
      trust: "영구 보존 · blob bytes에 암호학적으로 결합",
      failureImpact: "Commitment 자체는 blob보다 오래 살아 과거 가용성 증명 가능",
    },
    {
      asset: "Validator stake",
      owner: "~90만 validator",
      trust: "경제적 보안 · 2/3 정직 가정",
      failureImpact: ">1/3 byzantine 시 finality 중단",
    },
  ],
  eigenda: [
    {
      asset: "Blob chunk",
      owner: "운영자 집합 (142, quorum 0)",
      trust: "Retrieval 위해 55% 이상 stake가 chunk 보유 필요",
      failureImpact: "임계값 미만 → blob 복원 불가",
    },
    {
      asset: "KZG commitment + BLS 서명",
      owner: "On-chain (EigenDAServiceManager)",
      trust: "Commitment 영구 · 서명은 dispersal 증명",
      failureImpact: "저장 없는 서명 = free-riding (조용한 데이터 손실)",
    },
    {
      asset: "Disperser 파이프라인",
      owner: "EigenLabs (중앙화)",
      trust: "운영적 정직성 · 대체 경로 없음",
      failureImpact: "모든 쓰기의 단일 장애점 — 전체 중단 또는 검열 가능",
    },
    {
      asset: "Relay 키 (registry)",
      owner: "등록된 relay 운영자",
      trust: "최소 1개 active relay가 read 서빙",
      failureImpact: "현재 1/3 slot만 active → 1개 outage = read 중단",
    },
    {
      asset: "리스테이크 stake (ETH / EIGEN)",
      owner: "EigenLayer 리스테이커",
      trust: "경제적 보안 · 라이브 slashing 없음",
      failureImpact: "Slashing 없으면 악의적 운영자에 페널티 없음",
    },
  ],
  celestia: [
    {
      asset: "블록 데이터 + namespace",
      owner: "Validator 집합 (active 100)",
      trust: "2/3 voting power 정직 (Tendermint)",
      failureImpact: ">1/3 byzantine 시 liveness 중단 또는 데이터 위장",
    },
    {
      asset: "DAS 샘플",
      owner: "라이트 노드 (독립)",
      trust: "무작위 샘플링 → 확률적 보장",
      failureImpact: "샘플러 부족 → DAS 보장 약화",
    },
    {
      asset: "TIA stake",
      owner: "Validator + delegator",
      trust: "경제적 보안 · equivocation 시 slashable",
      failureImpact: "Top-10이 38.2% 보유 → 조율된 공격 임계값 도달 가능",
    },
  ],
  avail: [
    {
      asset: "블록 데이터 (row × col)",
      owner: "Validator 집합 (~100)",
      trust: "2/3 정직 (BABE / GRANDPA)",
      failureImpact: "Finality 중단 또는 데이터 위장",
    },
    {
      asset: "KZG cell commitment",
      owner: "On-chain (row + col별)",
      trust: "영구 보존",
      failureImpact: "Commitment 자체는 안전. 셀은 여전히 샘플러 필요",
    },
    {
      asset: "AVAIL stake",
      owner: "Validator",
      trust: "경제적 보안 · 초기 단계, Celestia 대비 낮은 TVS",
      failureImpact: "성숙한 L1보다 공격 비용 낮음",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// Threat Scenarios — prose narratives per DA. Headline weaknesses + how
// BONDA watches them. EigenDA gets the most detail; others are stubs that
// will fill in as DFDs land.
// ─────────────────────────────────────────────────────────────────────
export interface ThreatScenario {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  body: string[];   // paragraphs (rendered as <p>)
  watchedBy?: string[];  // BONDA indicators monitoring this scenario
}

export const daThreatScenarios: Record<DALayer, ThreatScenario[]> = {
  eigenda: [
    {
      id: "single-relay-dos",
      title: "단일 Relay + 글로벌 Rate Limit이 만드는 DoS 표면",
      severity: "critical",
      body: [
        "EigenDA 백서는 분산된 relay 집합과 BLS 서명 집계로 가용성을 보장한다고 말한다. 그러나 2026-05-14 기준 relay_registry 컨트랙트의 슬롯 3개 중 실제 주소를 가진 키는 1개뿐이며, 나머지 두 슬롯은 모두 0x0000…0000 으로 비어 있다. 즉 백서가 약속한 다중 relay는 현재 단일 relay에 전적으로 의존한다.",
        "이 상태에서 단일 공격자가 그 active relay에 DoS를 가하면 — 별도 발견에서 확인된, server-wide(non per-IP) rate limit과 결합되어 — EigenDA의 read 경로 전체가 사실상 마비될 수 있다. 백서는 operator 직접 접근 경로(direct-operator fetch)를 언급하지만, 그 경로의 discovery·인증 메커니즘은 SDK나 공식 문서에 노출되어 있지 않다. 폴백 경로의 존재가 곧 사용자가 그 경로를 일관되게 쓸 수 있다는 뜻이 아니다.",
        "쓰기 경로에서도 disperser가 단일 ingress이므로, disperser 자체가 다운되거나 정책적으로 특정 tenant를 거부하면 모든 쓰기가 멈춘다. 결국 EigenDA의 라이브니스는 EigenLabs의 운영적 정직성과 단 하나의 relay 노드 가용성 두 가지에 의해 결정된다.",
      ],
      watchedBy: [
        "relay_registry 컨트랙트 상태 1분 polling (active key 수)",
        "Disperser gRPC health probe 응답률",
        "Direct-operator fetch 성공률 (현재 미검증, Phase 2 추가 예정)",
      ],
    },
    {
      id: "operator-free-riding",
      title: "Operator Free-riding — 서명만 하고 저장은 안 한다면",
      severity: "warning",
      body: [
        "Operator는 BLS 서명으로 batch를 attest 하지만, 서명 자체가 실제로 chunk를 저장했다는 증명은 아니다. 악의적인 — 또는 단지 비용을 아끼는 — operator가 서명만 모은 뒤 GetChunks 요청에 응답하지 않으면, retrieval 시점에 와서야 데이터 손실이 드러난다. 그것도 충분히 많은 operator에게서 동시에 fetch 시도가 일어날 때만.",
        "BONDA는 retrieval probe에서 operator별 GetChunks 성공률을 측정하고, 그것을 BLS 서명 로그와 대조한다. 24시간 기준 142명 중 4명이 GetChunks 50%+ 실패를 보이며, 이는 free-rider 후보로 분류된다. 임계값(현재 10명, 또는 한 명이라도 95% 이상 실패)을 넘으면 critical로 격상된다.",
      ],
      watchedBy: [
        "Operator별 GetChunks 성공률 24h 트래킹",
        "BLS 서명 vs GetChunks 응답 mismatch 매트릭스",
      ],
    },
  ],
  ethereumda: [
    {
      id: "blob-pruning-cliff",
      title: "Blob Pruning Cliff — 18일 이후 자체 노드만으로는 복원 불가",
      severity: "info",
      body: [
        "Spec 상 blob은 약 4096 epoch (~18일) 동안만 EL 클라이언트에 유지되고 이후 prune된다. 이는 의도된 동작이지만, 롤업이 자체 EL 노드만으로 과거 state를 재구성하려는 경우 retention 경계 이후로는 외부 archive(Blobscan, Swarm, GCS 등)에 의존해야 한다는 뜻이다.",
        "BONDA는 retention 경계를 실측한다. 자체 Geth full node 기준 prune은 day 17.8 부근에서 일어나며, spec(18일) 대비 약 -0.2일의 편차가 있다. 이 편차 자체는 안전 마진이지만, 만약 클라이언트별로 더 빨리 prune되는 패턴이 생기면 롤업 운영자에게는 의미 있는 신호가 된다.",
      ],
      watchedBy: [
        "eth_getBlobSidecars 응답 가용성을 age bucket별로 측정",
        "Pruning 시점 일별 추적 (클라이언트 종류별 분리)",
      ],
    },
  ],
  celestia: [
    {
      id: "validator-concentration",
      title: "Validator 집중도 — Nakamoto 7의 의미",
      severity: "warning",
      body: [
        "Tendermint는 2/3 voting power 임계값을 가진다. Celestia의 현재 validator 분포에서 상위 10명이 전체 stake의 38.2%를 보유하고 있고, 임계값을 흔드는 데 필요한 최소 인원(Nakamoto 계수)은 7명이다. 이는 mature L1보다 낮은 수치이며, validator 담합 비용을 추정할 때 직접적인 입력값이 된다.",
        "BONDA는 stake 분포를 staking module 쿼리로 실시간 추적하고, top-N 집중도와 Nakamoto 계수를 함께 노출한다. DAS 자체는 validator를 신뢰하지 않아도 가용성을 검증할 수 있게 해 주지만, 라이트 노드 수가 부족하면 DAS 보장도 약해진다는 점은 별개 위협이다.",
      ],
      watchedBy: [
        "Validator stake 분포 일별 스냅샷",
        "DAS 샘플링 성공률 + 활성 라이트 노드 수",
      ],
    },
  ],
  avail: [
    {
      id: "confidence-gap",
      title: "Confidence Gap — 100%에 도달 못 하는 블록 3.2%",
      severity: "warning",
      body: [
        "Avail의 DAS는 무작위 셀 샘플링으로 confidence를 누적한다. 백서는 짧은 시간 안에 confidence가 100%에 수렴한다고 설명하지만, 실측 결과 블록 중 약 3.2%는 60초 관측 윈도우 내에 100%에 도달하지 못한다. 원인은 라이트 노드 peer 부족, 셀 응답 timeout, 또는 가끔 발생하는 hash_mismatch다.",
        "또한 30일 시점에 retrieval 성공률이 96.4%까지 감쇠한다. 이는 retention 정책 미준수의 신호일 수 있으며, BONDA는 retention 경계에서의 fetch 결과를 별도 트래킹한다.",
      ],
      watchedBy: [
        "블록별 confidence 곡선 (60초 윈도우)",
        "30d retrieval bucket 성공률 + 실패 유형 분포",
      ],
    },
  ],
};

// DFD diagram paths. casper.png is mock data sourced from L2Beat — reused
// across all 4 DAs until real hand-drawn DFDs land per DA. Replace any entry
// with "/dfd/<da>.png" once the actual diagram is uploaded.
export const daDfdImage: Record<DALayer, string> = {
  ethereumda: "/dfd/casper.png",
  eigenda: "/dfd/casper.png",
  celestia: "/dfd/casper.png",
  avail: "/dfd/casper.png",
};

// ─────────────────────────────────────────────────────────────────────
// Q2 — Integrity signals: KZG re-commit match rate + free-rider candidates
// ─────────────────────────────────────────────────────────────────────
export interface IntegritySignal {
  da: DALayer;
  daName: string;
  kzgMatchRate: number;        // % of fetched blobs whose recomputed KZG matches the on-chain commitment
  kzgChecks24h: number;        // number of re-checks in last 24h
  freeRiderCandidates: number; // operators / responders that signed-but-didn't-return chunks
  freeRiderTotal: number;      // total operators in the responder set
  tenantP95SpreadMs: number;   // p95 latency spread across tenants (high = possible discrimination)
  note: string;
}

export const integritySignals: IntegritySignal[] = [
  {
    da: "ethereumda",
    daName: "EthereumDA",
    kzgMatchRate: 100,
    kzgChecks24h: 18420,
    freeRiderCandidates: 0,
    freeRiderTotal: 0,
    tenantP95SpreadMs: 320,
    note: "KZG commitments verified on-chain by EL clients; no per-operator storage layer.",
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    kzgMatchRate: 99.97,
    kzgChecks24h: 6480,
    freeRiderCandidates: 4,
    freeRiderTotal: 142,
    tenantP95SpreadMs: 4100,
    note: "4 operators signed batches but failed >50% GetChunks calls in 24h. P95 spread suggests tenant-dependent latency.",
  },
  {
    da: "celestia",
    daName: "Celestia",
    kzgMatchRate: 100,
    kzgChecks24h: 9320,
    freeRiderCandidates: 0,
    freeRiderTotal: 100,
    tenantP95SpreadMs: 180,
    note: "DAS-based — no chunk storage by individual operators to free-ride on.",
  },
  {
    da: "avail",
    daName: "Avail",
    kzgMatchRate: 99.84,
    kzgChecks24h: 5210,
    freeRiderCandidates: 0,
    freeRiderTotal: 0,
    tenantP95SpreadMs: 240,
    note: "0.16% KZG mismatch rate at 30d retrieval — flagged for investigation.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Q3 — Safety margin: SPOF + reconstruction-threshold + stake concentration
// ─────────────────────────────────────────────────────────────────────
export interface SafetyMargin {
  da: DALayer;
  daName: string;
  spofScore: number;                // 0 (worst) — 100 (best)
  spofComponents: string[];         // named single-points-of-failure
  reconstructionMarginPct: number;  // live signing stake above threshold (% pts). negative = below
  reconstructionThreshold: string;  // human label, e.g. "55% (EigenDA quorum)"
  topNakamotoCoefficient: number;   // minimum #operators to halt
  topNShare: number;                // top-5 stake share %
}

export const safetyMargins: SafetyMargin[] = [
  {
    da: "ethereumda",
    daName: "EthereumDA",
    spofScore: 92,
    spofComponents: [],
    reconstructionMarginPct: 33,
    reconstructionThreshold: "66% (Casper finality)",
    topNakamotoCoefficient: 4,
    topNShare: 18.4,
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    spofScore: 22,
    spofComponents: ["disperser (1)", "active relay (1/3)", "registry coordinator"],
    reconstructionMarginPct: 12,
    reconstructionThreshold: "55% (quorum 0)",
    topNakamotoCoefficient: 3,
    topNShare: 62.0,
  },
  {
    da: "celestia",
    daName: "Celestia",
    spofScore: 78,
    spofComponents: [],
    reconstructionMarginPct: 24,
    reconstructionThreshold: "66% (Tendermint)",
    topNakamotoCoefficient: 7,
    topNShare: 38.2,
  },
  {
    da: "avail",
    daName: "Avail",
    spofScore: 70,
    spofComponents: ["light-client bootstrap node"],
    reconstructionMarginPct: 19,
    reconstructionThreshold: "67% (BABE/GRANDPA)",
    topNakamotoCoefficient: 6,
    topNShare: 41.5,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Q4 — BONDA-only metrics (not visible on L2Beat, Etherscan, Blobscan,
// EigenDA explorer, Celenium, Subscan-Avail at time of writing)
// ─────────────────────────────────────────────────────────────────────
export interface BondaOnlyMetric {
  title: string;
  whereMissing: string[];
  why: string;
}

export const bondaOnlyMetrics: BondaOnlyMetric[] = [
  {
    title: "Empirical 30-day blob survival curve",
    whereMissing: ["L2Beat", "Blobscan", "EigenDA Explorer"],
    why: "Blobscan archives, but no public dashboard reports actual fetch SLA at t+1d / 7d / 30d.",
  },
  {
    title: "KZG re-commitment mismatch detection",
    whereMissing: ["beaconcha.in", "Blobscan", "Celenium"],
    why: "Explorers store commitments but never recompute from blob bytes to flag silent corruption.",
  },
  {
    title: "Spec-vs-reality on relay registry (live)",
    whereMissing: ["EigenDA docs", "L2Beat"],
    why: "Whitepaper claims multi-relay; on-chain registry actually has 1 active / 2 zero — no dashboard surfaces this.",
  },
  {
    title: "Cross-DA same-blob benchmark",
    whereMissing: ["Everywhere"],
    why: "We submit the same blob payload to all 4 DAs simultaneously and compare write/read end-to-end.",
  },
  {
    title: "Reconstruction-threshold live margin",
    whereMissing: ["EigenDA Explorer", "Celenium", "Avail Subscan"],
    why: "55% (EigenDA) and 66%/67% (Tendermint/GRANDPA) thresholds exist in spec but live margin is never plotted.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Q6 — EigenDA Threat-Model panels (5 threats → live indicators)
// ─────────────────────────────────────────────────────────────────────
export type ThreatStatus = "ok" | "warn" | "critical";

export interface EigenDAThreat {
  id: string;
  title: string;
  description: string;
  status: ThreatStatus;
  indicator: string;     // current numeric/text reading
  threshold: string;     // what would trigger the next severity step
  evidence: string;      // where to look on-chain / logs
}

// Per-DA threats. Currently only EigenDA has formal threat modeling;
// other DAs reuse the same shape and will be populated as their DFDs land.
export type Threat = EigenDAThreat;

export const eigenDAThreats: EigenDAThreat[] = [
  {
    id: "disperser-spof",
    title: "Disperser 단일 장애점",
    description: "중앙화된 disperser가 유일한 ingress 경로. 장애나 검열 시 모든 쓰기 중단.",
    status: "warn",
    indicator: "24h 도달률 99.4% · 문서화된 대체 ingress 없음",
    threshold: "도달률 < 99% → critical",
    evidence: "Disperser gRPC health probe + alt-ingress 탐색",
  },
  {
    id: "operator-free-riding",
    title: "Operator free-riding",
    description: "Operator가 BLS 서명은 하지만 실제로 할당된 chunk를 저장하지 않을 가능성.",
    status: "warn",
    indicator: "142명 중 4명이 24h GetChunks 50%+ 실패",
    threshold: "후보 > 10명 또는 95%+ 실패 발생 → critical",
    evidence: "GetChunks probe 결과 vs BLS 서명 로그",
  },
  {
    id: "reconstruction-threshold",
    title: "재구성 임계값 마진",
    description: "응답 가능한 operator stake가 인코딩 임계값 아래로 떨어지면 blob 복원 불가.",
    status: "ok",
    indicator: "라이브 서명 stake 67% / 임계값 55% (마진 +12 pts)",
    threshold: "마진 < +5 pts → warn · 임계값 미만 → critical",
    evidence: "RegistryCoordinator stake + batch별 서명 집계",
  },
  {
    id: "data-integrity",
    title: "데이터 무결성 (잘못된 chunk)",
    description: "Operator가 KZG re-commitment에 실패하는 chunk를 반환.",
    status: "ok",
    indicator: "KZG 일치율 99.97% (24h, 6,480회 검사) — 불일치 2건",
    threshold: "지속적 불일치 발생 시 → critical (P0)",
    evidence: "Retrieval probe 시 KZG 재계산",
  },
  {
    id: "relay-spof",
    title: "Relay 단일 장애점",
    description: "등록된 3개 relay 중 1개만 non-zero 키 보유. Operator 직접 접근 경로 미공개.",
    status: "critical",
    indicator: "Active 1 / 등록 3 · Operator 직접 fetch 미검증",
    threshold: "Active ≥ 2 → warn · Active ≥ 3 → ok",
    evidence: "relay_registry 컨트랙트 + 수동 operator 직접 probe",
  },
];

export const celestiaNamespaces: NamespaceUsage[] = [
  { name: "Eclipse", namespace: "0x..ec1", blobsLast24h: 2840, bytesLast24h: 1_420_000_000, avgBlobSize: 500_000 },
  { name: "Manta Pacific", namespace: "0x..ma2", blobsLast24h: 1560, bytesLast24h: 780_000_000, avgBlobSize: 500_000 },
  { name: "Celestia Probe", namespace: "DABEAT01", blobsLast24h: 1440, bytesLast24h: 1_440_000, avgBlobSize: 1_000 },
  { name: "Forma", namespace: "0x..fo3", blobsLast24h: 890, bytesLast24h: 445_000_000, avgBlobSize: 500_000 },
  { name: "Orderly", namespace: "0x..or4", blobsLast24h: 620, bytesLast24h: 186_000_000, avgBlobSize: 300_000 },
  { name: "Others", namespace: "mixed", blobsLast24h: 1200, bytesLast24h: 360_000_000, avgBlobSize: 300_000 },
];

// Per-DA threat list. Only EigenDA populated today (it has formal modeling).
// Others stay empty until their DFDs land — UI shows a placeholder.
export const daThreats: Record<DALayer, Threat[]> = {
  ethereumda: [],
  eigenda: eigenDAThreats,
  celestia: [],
  avail: [],
};
