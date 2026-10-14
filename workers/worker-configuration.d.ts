/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}