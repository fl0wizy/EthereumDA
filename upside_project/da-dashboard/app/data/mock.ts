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
    category: "Relay Centralization",
    claim: "Multiple relays prevent single point of failure",
    reality: "Only 1 of 3 registered relays has non-zero key. 2 relays have 0x0 keys.",
    severity: "critical",
    evidence: "relay_registry contract: 3 keys registered, 2 are 0x0000...0000",
    lastChecked: "2026-05-14T09:30:00Z",
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    category: "Rate Limiting",
    claim: "Rate limiting protects against abuse",
    reality: "Rate limit is global (server-wide), not per-client IP. Single client can exhaust entire allocation.",
    severity: "critical",
    evidence: "Disperser gRPC rate limit config: global token bucket, no per-IP isolation",
    lastChecked: "2026-05-14T09:30:00Z",
  },
  {
    da: "eigenda",
    daName: "EigenDA",
    category: "Operator Distribution",
    claim: "Distributed operator set ensures resilience",
    reality: "Top 5 operators control 62% of total stake in quorum 0",
    severity: "warning",
    evidence: "On-chain stake distribution from RegistryCoordinator",
    lastChecked: "2026-05-14T08:00:00Z",
  },
  {
    da: "ethereumda",
    daName: "EthereumDA",
    category: "Blob Retention",
    claim: "Blobs available for ~18 days (4096 epochs)",
    reality: "Actual pruning varies by client. Measured: pruned at day 17.8 on Geth full node.",
    severity: "info",
    evidence: "eth_getBlobSidecars returns empty after epoch 4091 on self-hosted Geth node",
    lastChecked: "2026-05-14T06:00:00Z",
  },
  {
    da: "celestia",
    daName: "Celestia",
    category: "Validator Concentration",
    claim: "Decentralized validator set",
    reality: "Top 10 validators hold 38.2% of total stake. Nakamoto coefficient = 7.",
    severity: "warning",
    evidence: "Validator stake distribution from staking module query",
    lastChecked: "2026-05-14T07:00:00Z",
  },
  {
    da: "celestia",
    daName: "Celestia",
    category: "DAS Sampling",
    claim: "Light nodes verify data availability via DAS",
    reality: "DAS sampling succeeds 100% on recent blocks. Occasional 200ms+ latency spikes.",
    severity: "info",
    evidence: "block_availability_samples table: 0 failures in 30 days, p99 latency 340ms",
    lastChecked: "2026-05-14T09:00:00Z",
  },
  {
    da: "avail",
    daName: "Avail",
    category: "Confidence Level",
    claim: "DAS provides high confidence of data availability",
    reality: "~3.2% of blocks never reach 100% confidence within 60s observation window",
    severity: "warning",
    evidence: "block_availability_samples: 3.2% blocks with max confidence < 99.9%",
    lastChecked: "2026-05-14T08:30:00Z",
  },
  {
    da: "avail",
    daName: "Avail",
    category: "Retrieval Reliability",
    claim: "Data retrievable throughout retention period",
    reality: "Retrieval success drops to 96.4% at 30-day mark. Failures are hash_mismatch and timeout.",
    severity: "warning",
    evidence: "retrievals table: 30d bucket fetch_success rate = 96.4%",
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

export const celestiaNamespaces: NamespaceUsage[] = [
  { name: "Eclipse", namespace: "0x..ec1", blobsLast24h: 2840, bytesLast24h: 1_420_000_000, avgBlobSize: 500_000 },
  { name: "Manta Pacific", namespace: "0x..ma2", blobsLast24h: 1560, bytesLast24h: 780_000_000, avgBlobSize: 500_000 },
  { name: "Celestia Probe", namespace: "DABEAT01", blobsLast24h: 1440, bytesLast24h: 1_440_000, avgBlobSize: 1_000 },
  { name: "Forma", namespace: "0x..fo3", blobsLast24h: 890, bytesLast24h: 445_000_000, avgBlobSize: 500_000 },
  { name: "Orderly", namespace: "0x..or4", blobsLast24h: 620, bytesLast24h: 186_000_000, avgBlobSize: 300_000 },
  { name: "Others", namespace: "mixed", blobsLast24h: 1200, bytesLast24h: 360_000_000, avgBlobSize: 300_000 },
];
