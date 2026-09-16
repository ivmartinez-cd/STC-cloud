export type {
  SuppliesItem, InputTrayInfo, OutputTrayInfo, CounterRowDetail, CounterTriple, ScanCounters,
  DetailedCounters, DeviceExtraInfo, SuppliesDetails,
} from './supplies';
export type { Device } from './device';
export type {
  SnmpVersion, SnmpSecurityLevel, SnmpAuthProtocol, SnmpPrivProtocol, MaskedSnmpCredential, SnmpCredentialInput,
} from './snmp';
export type { MonitorData, EditFormData, Monitor, CreateMonitorForm } from './monitor-agent';
export type { DashboardData, TrendPoint, DashboardTrend, TrendRange, AlertHotspot, AlertHotspots, HotspotKind } from './dashboard';
export { TREND_RANGES, TREND_RANGE_LABEL, HOTSPOT_KINDS } from './dashboard';
export type { Client, ApiKeyRecord, PublicApiEvent, WebhookConfig, SftpDestinationConfig, UsageMonth } from './client';
