// @ts-nocheck
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

interface EnvConfig {
  PORT: number
  NODE_ENV: string
  DATABASE_URL: string
  JWT_SECRET?: string
  JWT_EXPIRES_IN?: string
}

class EnvironmentConfig {
  private config: EnvConfig

  constructor() {
    this.config = this.loadConfig()
    this.validateConfig()
  }

  private loadConfig(): EnvConfig {
    return {
      PORT: Number.parseInt(process.env.PORT || "3000", 10),
      NODE_ENV: process.env.NODE_ENV || "development",
      DATABASE_URL: process.env.DATABASE_URL || "",
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    }
  }

  private validateConfig(): void {
    const requiredVars = ["DATABASE_URL"]

    for (const varName of requiredVars) {
      if (!this.config[varName as keyof EnvConfig]) {
        throw new Error(`Missing required environment variable: ${varName}`)
      }
    }
  }

  public get(key: keyof EnvConfig) {
    return this.config[key]
  }

  public getAll(): EnvConfig {
    return { ...this.config }
  }

  public isDevelopment(): boolean {
    return this.config.NODE_ENV === "development"
  }

  public isProduction(): boolean {
    return this.config.NODE_ENV === "production"
  }

  public isTest(): boolean {
    return this.config.NODE_ENV === "test"
  }
}

export const envConfig = new EnvironmentConfig()
export type { EnvConfig }
