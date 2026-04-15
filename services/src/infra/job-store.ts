import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export type JobStatus = "running" | "completed" | "failed"

export interface JobRecord {
  key: string
  status: JobStatus
  attempts: number
  updatedAt: number
  lastError?: string
  txId?: string
}

export interface JobStore {
  begin(key: string): Promise<boolean>
  complete(key: string, txId?: string): Promise<void>
  fail(key: string, error: Error): Promise<void>
  get(key: string): Promise<JobRecord | undefined>
  list(): Promise<JobRecord[]>
}

export class MemoryJobStore implements JobStore {
  protected readonly records = new Map<string, JobRecord>()

  async begin(key: string) {
    const existing = this.records.get(key)
    if (existing?.status === "running" || existing?.status === "completed") return false
    this.records.set(key, {
      key,
      status: "running",
      attempts: (existing?.attempts ?? 0) + 1,
      updatedAt: Date.now(),
      lastError: existing?.lastError,
    })
    return true
  }

  async complete(key: string, txId?: string) {
    const existing = this.records.get(key)
    this.records.set(key, {
      key,
      status: "completed",
      attempts: existing?.attempts ?? 1,
      updatedAt: Date.now(),
      txId,
    })
  }

  async fail(key: string, error: Error) {
    const existing = this.records.get(key)
    this.records.set(key, {
      key,
      status: "failed",
      attempts: existing?.attempts ?? 1,
      updatedAt: Date.now(),
      lastError: error.message,
    })
  }

  async get(key: string) {
    return this.records.get(key)
  }

  async list() {
    return [...this.records.values()]
  }
}

export class FileJobStore extends MemoryJobStore {
  constructor(private readonly path: string) {
    super()
  }

  override async begin(key: string) {
    await this.load()
    const started = await super.begin(key)
    await this.save()
    return started
  }

  override async complete(key: string, txId?: string) {
    await this.load()
    await super.complete(key, txId)
    await this.save()
  }

  override async fail(key: string, error: Error) {
    await this.load()
    await super.fail(key, error)
    await this.save()
  }

  override async get(key: string) {
    await this.load()
    return super.get(key)
  }

  override async list() {
    await this.load()
    return super.list()
  }

  private async load() {
    try {
      const raw = await readFile(this.path, "utf8")
      const parsed = JSON.parse(raw) as JobRecord[]
      this.records.clear()
      for (const record of parsed) this.records.set(record.key, record)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  private async save() {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(await super.list(), null, 2))
  }
}
