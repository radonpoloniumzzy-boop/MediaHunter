import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type { ConversationMessage } from "@lan-ting/workflow";

export interface SessionRecord {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail extends SessionRecord {
  messages: ConversationMessage[];
}

export class SessionRepository {
  constructor(private readonly sql: Sql) {}

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await this.sql<SessionRecord[]>`
      select id, title, status, created_at::text, updated_at::text
      from chat_sessions
      order by updated_at desc
      limit 20
    `;
    return rows;
  }

  async createSession(title = "New finance request"): Promise<SessionDetail> {
    const id = randomUUID();
    await this.sql`
      insert into chat_sessions (id, title)
      values (${id}, ${title})
    `;

    return {
      id,
      title,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    };
  }

  async getSession(id: string): Promise<SessionDetail | null> {
    const sessions = await this.sql<SessionRecord[]>`
      select id, title, status, created_at::text, updated_at::text
      from chat_sessions
      where id = ${id}
      limit 1
    `;

    const session = sessions[0];
    if (!session) return null;

    const messages = await this.sql<ConversationMessage[]>`
      select role, content, created_at::text
      from chat_messages
      where session_id = ${id}
      order by created_at asc
    `;

    return {
      ...session,
      messages
    };
  }

  async appendMessage(sessionId: string, role: ConversationMessage["role"], content: string): Promise<ConversationMessage> {
    const id = randomUUID();
    await this.sql`
      insert into chat_messages (id, session_id, role, content)
      values (${id}, ${sessionId}, ${role}, ${content})
    `;

    await this.sql`
      update chat_sessions
      set updated_at = now()
      where id = ${sessionId}
    `;

    return {
      role,
      content,
      created_at: new Date().toISOString()
    };
  }
}
