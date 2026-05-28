import { log } from './Logger';
import { isBusinessHours, INTERVALS } from './BusinessHours';
import type { ScanService } from './ScanService';

interface TaskSchedulerDeps {
  scanService: ScanService;
}

export class TaskScheduler {
  private deps: TaskSchedulerDeps;
  private isNetworkTaskRunning = false;
  private lastDiscoveryTime = 0;
  private lastMeterTime = 0;
  private lastSuppliesTime = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: TaskSchedulerDeps) {
    this.deps = deps;
  }

  get isBusy(): boolean {
    return this.isNetworkTaskRunning;
  }

  start(delayMs = 0): void {
    if (delayMs > 0) {
      this.timer = setTimeout(() => this.run(), delayMs);
    } else {
      this.run();
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    if (this.isNetworkTaskRunning) {
      this.timer = setTimeout(() => this.run(), 10_000); // Check again in 10s if busy
      return;
    }

    const now = Date.now();
    const biz = isBusinessHours();

    const discoveryInterval = biz ? INTERVALS.discovery.biz : INTERVALS.discovery.off;
    const meterInterval     = biz ? INTERVALS.meter.biz : INTERVALS.meter.off;
    const suppliesInterval  = biz ? INTERVALS.supplies.biz : INTERVALS.supplies.off;

    if (now - this.lastDiscoveryTime >= discoveryInterval) {
      this.isNetworkTaskRunning = true;
      try {
        await this.deps.scanService.scan();
        this.lastDiscoveryTime = Date.now();
        this.lastMeterTime = Date.now();
        this.lastSuppliesTime = Date.now();
      } finally {
        this.isNetworkTaskRunning = false;
      }
    }
    else if (now - this.lastMeterTime >= meterInterval) {
      this.isNetworkTaskRunning = true;
      try {
        await this.deps.scanService.runMeterTask();
        this.lastMeterTime = Date.now();
      } finally {
        this.isNetworkTaskRunning = false;
      }
    }
    else if (now - this.lastSuppliesTime >= suppliesInterval) {
      this.isNetworkTaskRunning = true;
      try {
        await this.deps.scanService.runSuppliesTask();
        this.lastSuppliesTime = Date.now();
      } finally {
        this.isNetworkTaskRunning = false;
      }
    }

    // Loop every 5 seconds
    this.timer = setTimeout(() => this.run(), 5_000);
  }
}
